import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import type { AgentJournalRenderItem as Item } from '@journal-types';
import type { AgentSessionCurrentRequestsRead as Read } from '@requests-wire';
import { verifyUpstreamProfile } from './upstream-profile.mjs';

const upstream = resolve(process.argv[2]);
const profile = verifyUpstreamProfile(upstream);
const shared = profile.id === 'baseline' ? 'src/shared/agent-session/' : 'src/shared/';
const requests = shared + (profile.id === 'baseline' ? 'requests/' : '');
const load = async (path: string) => {
  const module = await import(pathToFileURL(resolve(upstream, path)).href);
  return module.default ?? module;
};
// Only the runner's explicitly labelled negative control supplies a copied module.
const module = await load(process.argv[3] || 'src/main/runtime/rpc/methods/structured-agent-session-current-requests.ts');
const method = module.STRUCTURED_AGENT_SESSION_CURRENT_REQUESTS_METHODS.find((entry: {name: string}) => entry.name === 'agentSession.currentRequests');
assert.equal(typeof method?.handler, 'function');
const registry = await load('src/main/native-chat/agent-session-wire/structured-agent-session-registry.ts');
const { StructuredAgentSessionCurrentWork } = await load('src/main/native-chat/agent-session-wire/structured-agent-session-current-work.ts');
const { readCurrentRequestsPiece } = await load('src/main/native-chat/agent-session-wire/agent-session-current-requests.ts');
const { reduceStructuredAgentSession: reduce, EMPTY_STRUCTURED_AGENT_SESSION: empty } = await load(shared + 'structured-agent-session-reducer.ts');
const { selectAgentSessionCurrentRequests: select } = await load(requests + 'agent-session-current-requests.ts');
const { createAgentSessionCurrentRequestsReader } = await load(requests + 'agent-session-current-requests-reader.ts');
const { STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY: structured } = await load(shared + 'agent-session-runtime-capabilities.ts');
const { AGENT_SESSION_CURRENT_REQUESTS_CLIENT_CAPABILITY: capability } = await load(requests + 'agent-session-current-requests-capability.ts');
assert.equal(typeof structured,'string','load actual structured capability for this source layout');
assert.equal(typeof capability,'string');
const sessionId = 'session-alpha';
let handlerCalls = 0;

function permission(id = 'permission-1', detail = 'Synthetic only'): Item {
  return { itemId:id, sequence:1, revision:1, observedAt:1, body:{
    kind:'approval', title:'Inspect fixture?', detail, options:[{id:'allow',label:'Allow'}],
    resolution:{state:'pending',selectedOptionId:null,resolvedBy:null,resolvedAt:null},
  }};
}

async function fixture(run: (f: ReturnType<typeof makeFixture>) => Promise<void>) {
  assert.equal(registry.getStructuredAgentSessionHost(), null, 'fresh isolated process has no installed host');
  const f = makeFixture();
  registry.setStructuredAgentSessionHost(f.host);
  try { await run(f); } finally { registry.setStructuredAgentSessionHost(null); }
}

function makeFixture() {
  let items: Item[] = [permission()];
  let sequence = 1;
  let fence: number | null = 1;
  let reads = 0;
  const journal = {
    cursor: () => ({epoch:'synthetic-epoch',sequence}),
    item: (id: string) => items.find(item => item.itemId === id) ?? null,
    itemFence: () => 1,
    visitItems: (visit: (id: string, seq: number, body: Item['body']) => void) => {
      for (const item of items) visit(item.itemId,item.sequence,item.body);
    },
    runningTurn: () => null, submissions: () => [], wroteBeforeOpen: () => false,
  };
  const work = () => new StructuredAgentSessionCurrentWork(journal, fence);
  const projection = () => work().requestProjection(sessionId);
  // The host service boundary is synthetic; gate, projection, piece reader and
  // reducer are original source. No fabricated successful read response.
  const host = {
    sessionAgent: (id: string) => { assert.equal(id,sessionId); return 'codex'; },
    readCurrentRequests: (request: Read) => {
      assert.equal(request.sessionId,sessionId);
      reads++;
      return readCurrentRequestsPiece(projection(),request);
    },
  };
  return {
    host, projection, reads: () => reads,
    replace: (next: Item[]) => { items=next; sequence++; },
    unrelatedUpdate: () => { sequence++; },
    loseOwner: () => { fence=null; },
    invoke: async (request: Read, caps: string[] = [structured,capability]) => {
      const parsed = method.params.parse(request);
      handlerCalls++;
      return method.handler(parsed, {
        clientKind:'mobile', clientCapabilities:caps,
        runtime:{ensureStructuredAgentSessionHost: () => { throw new Error('host installation forbidden in fixture'); }},
      });
    },
  };
}

await test('actual handler refuses missing currentRequests capability before host read', () => fixture(async f => {
  await assert.rejects(f.invoke({sessionId,version:f.projection().marker.version},[structured]), {
    refusal:{code:'structured_agent_session_unsupported',message:'structured_agent_session_unsupported',details:{reason:'clientCapabilityMissing'}},
  });
  assert.equal(f.reads(),0);
}));

await test('actual handler also requires structured-session capability', () => fixture(async f => {
  await assert.rejects(f.invoke({sessionId,version:f.projection().marker.version},[capability]), {
    refusal:{code:'structured_agent_session_unsupported',message:'structured_agent_session_unsupported',details:{reason:'clientCapabilityMissing'}},
  });
  assert.equal(f.reads(),0);
}));

await test('actual handler reads pending permission with real session and UUID marker', () => fixture(async f => {
  const marker=f.projection().marker;
  const result=await f.invoke({sessionId,version:marker.version});
  assert.deepEqual(result.marker,marker);
  assert.deepEqual(JSON.parse(result.json),[permission()]);
  assert.equal(result.nextCursor,null);
  assert.equal(result.restart,undefined);
  assert.equal(f.reads(),1);
}));

await test('declaration schema rejects invalid UUID before handler entry', () => fixture(async f => {
  const before=handlerCalls;
  await assert.rejects(f.invoke({sessionId,version:'not-a-uuid'}));
  assert.equal(handlerCalls,before);
  assert.equal(f.reads(),0);
}));

await test('stale UUID version returns restart and no obsolete permission JSON', () => fixture(async f => {
  const old=f.projection().marker;
  f.replace([]);
  const current=f.projection().marker;
  assert.notEqual(current.version,old.version);
  const stale=await f.invoke({sessionId,version:old.version,cursor:17});
  assert.deepEqual(stale,{marker:current,json:'',nextCursor:0,restart:true});
  const restarted=await f.invoke({sessionId,version:stale.marker.version,cursor:0});
  assert.deepEqual(JSON.parse(restarted.json),[]);
}));

await test('unrelated journal update preserves original actionable permission version', () => fixture(async f => {
  const before=f.projection().marker;
  f.unrelatedUpdate();
  assert.deepEqual(f.projection().marker,before);
  assert.deepEqual(JSON.parse((await f.invoke({sessionId,version:before.version})).json),[permission()]);
}));

await test('resolved approval is excluded by original current-work projection', () => fixture(async f => {
  const item=permission();
  assert.equal(item.body.kind,'approval');
  if (item.body.kind !== 'approval') throw new Error('invalid fixture');
  f.replace([{...item,revision:2,body:{...item.body,resolution:{state:'resolved',selectedOptionId:'allow',resolvedBy:'synthetic',resolvedAt:2}}}]);
  assert.deepEqual(JSON.parse((await f.invoke({sessionId,version:f.projection().marker.version})).json),[]);
}));

await test('lost synthetic owner clears actionable requests while fixture approval stays pending', () => fixture(async f => {
  const item=permission();
  f.replace([item]);
  const beforeRow=JSON.stringify(item);
  const before=f.projection().marker;
  f.loseOwner();
  const after=f.projection().marker;
  assert.notEqual(after.owner,before.owner);
  assert.ok(after.revision>before.revision);
  assert.deepEqual(JSON.parse((await f.invoke({sessionId,version:after.version})).json),[]);
  assert.deepEqual(item,JSON.parse(beforeRow),'in-memory pending approval was not resolved or mutated');
}));

await test('consumer preserves complete requests on same owner, rejects late reads, discards changed owner', () => fixture(async f => {
  const first=f.projection().marker;
  const items=JSON.parse((await f.invoke({sessionId,version:first.version})).json);
  let state=reduce({...empty,epoch:first.epoch,fence:1,items:[permission()]},{type:'requests-marker',marker:first});
  state=reduce(state,{type:'requests-complete',marker:first,items});
  const loading=reduce(state,{type:'loading'});
  assert.deepEqual(loading.currentRequests,items);
  assert.deepEqual(loading.requestAuthority,first);
  f.replace([permission(),{...permission('permission-2'),sequence:2}]);
  const next=f.projection().marker;
  state=reduce(loading,{type:'requests-marker',marker:next});
  assert.equal(next.owner,first.owner);
  assert.deepEqual(state.currentRequests,items);
  assert.equal(reduce(state,{type:'requests-complete',marker:first,items:[]}),state);
  f.loseOwner();
  const changed=f.projection().marker;
  state=reduce(state,{type:'requests-marker',marker:changed});
  assert.deepEqual(state.currentRequests,[]);
  assert.equal(state.requestAuthority,undefined);
  assert.equal(reduce(state,{type:'requests-complete',marker:next,items}),state);
  assert.deepEqual(select(state),[],'old pending history cannot restore dropped authority');
}));

await test('large original read pieces reassemble complete permission through actual handler', () => fixture(async f => {
  const item=permission('large','x'.repeat(60_000));
  f.replace([item]);
  const marker=f.projection().marker;
  const chunks: string[]=[];
  let cursor: number | null=0;
  while(cursor!==null) {
    const piece=await f.invoke({sessionId,version:marker.version,cursor});
    assert.deepEqual(piece.marker,marker);
    chunks.push(piece.json);
    if(piece.nextCursor!==null) assert.ok(piece.nextCursor>cursor);
    cursor=piece.nextCursor;
  }
  assert.ok(chunks.length>1);
  assert.deepEqual(JSON.parse(chunks.join('')),[item]);
}));

await test('same-owner empty revision preserves old complete state only until the new read completes', () => fixture(async f => {
  const first=f.projection().marker;
  const items=JSON.parse((await f.invoke({sessionId,version:first.version})).json);
  let state=reduce({...empty,items:[permission()]},{type:'requests-marker',marker:first});
  state=reduce(state,{type:'requests-complete',marker:first,items});
  f.replace([]);
  const stale=await f.invoke({sessionId,version:first.version});
  assert.equal(stale.restart,true);
  assert.equal(stale.marker.owner,first.owner);
  state=reduce(state,{type:'requests-marker',marker:stale.marker});
  assert.deepEqual(state.currentRequests,items);
  const next=await f.invoke({sessionId,version:stale.marker.version});
  state=reduce(state,{type:'requests-complete',marker:next.marker,items:JSON.parse(next.json)});
  assert.deepEqual(state.currentRequests,[]);
  assert.deepEqual(state.requestAuthority,next.marker);
  assert.deepEqual(select(state),[],'pending history does not override a complete empty result');
}));

await test('original reader invalidation drops a late successful actual-handler read', () => fixture(async f => {
  let release!: () => void;
  let entered!: () => void;
  const barrier=new Promise<void>(done => { release=done; });
  const started=new Promise<void>(done => { entered=done; });
  let completions=0;
  const reader=createAgentSessionCurrentRequestsReader({
    read: async (request: Read) => { const piece=await f.invoke(request); entered(); await barrier; return piece; },
    complete: () => { completions++; },
    replaceMarker: () => { throw new Error('unexpected restart'); },
    error: (error: unknown) => { throw error; },
  });
  try {
    reader.observe(f.projection().marker);
    await started;
    reader.invalidate();
    release();
    await new Promise<void>(done => setImmediate(done));
    assert.equal(completions,0);
  } finally { release(); reader.invalidate(); }
}));

verifyUpstreamProfile(upstream);
console.log(`SOURCE ${profile.commit}; actual currentRequests handler entries: ${handlerCalls}; synthetic host/journal boundary; no RPC transport or live host`);
