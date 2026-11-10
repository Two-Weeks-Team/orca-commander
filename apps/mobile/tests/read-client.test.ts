import { ReadOnlyClientError, ReadOnlyOrcaClient, type RpcTransport } from '../src/adapters/read-only-orca-client';
import { checkCommand } from '../src/core/policy';

let count = 0;
function check(value: unknown, message: string): asserts value { count++; if (!value) throw new Error(message); }
async function rejects(promise: Promise<unknown>, code: string, message: string): Promise<void> {
  count++;
  try { await promise; } catch (error) {
    if (error instanceof ReadOnlyClientError && error.code === code) return;
    throw new Error(`${message}: expected ${code}, got ${error instanceof ReadOnlyClientError ? error.code : String(error)}`);
  }
  throw new Error(`${message}: expected rejection ${code}`);
}

const t0 = Date.parse('2026-11-02T03:00:00Z');
let clock = t0;
const now = () => clock;
const status = { runtimeId: 'mock-runtime', protocolVersion: 3, minCompatibleMobileVersion: 2, capabilities: [], graphStatus: 'ready' };
const row = (id: string, state = 'waiting', updatedAt = t0 - 1000) => ({
  worktreeId: id, displayName: id, preview: '', agents: [{ paneKey: 'agent-0', state, agentType: 'claude', taskTitle: `task ${id}`, interrupted: false, updatedAt }],
});
const listing = (...ids: string[]) => ({ worktrees: ids.map(id => row(id)), totalCount: ids.length, truncated: false });
const tabs = (version: number, epoch = 'epoch-a', worktree = 'wt-1') => ({ worktree, publicationEpoch: epoch, snapshotVersion: version, tabs: [{ type: 'terminal', id: 't1', title: 'zsh', status: 'ready', terminal: 'term-1' }] });

type Handler = (params: Record<string, unknown> | undefined) => unknown | Promise<unknown>;
class FakeTransport implements RpcTransport {
  calls: { method: string; params?: Record<string, unknown> }[] = [];
  handlers = new Map<string, Handler>();
  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ method, params });
    const handler = this.handlers.get(method);
    if (!handler) throw new Error(`unhandled ${method}`);
    return handler(params);
  }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(res => { resolve = res; }); return { promise, resolve }; }
function fresh(extra: Partial<ConstructorParameters<typeof ReadOnlyOrcaClient>[0]> = {}) {
  const transport = new FakeTransport();
  transport.handlers.set('status.get', () => status);
  transport.handlers.set('worktree.ps', () => listing('wt-1'));
  const client = new ReadOnlyOrcaClient({ hostId: 'host-1', transport, now, ...extra });
  return { transport, client };
}

async function main() {
  const watchdog = setTimeout(() => { throw new Error('read-client test timed out'); }, 60_000);
  // Not connected yet: nothing is readable.
  {
    const { client } = fresh();
    await rejects(client.listAgents(), 'not_connected', 'listAgents before connect');
    await rejects(client.readTabs('wt-1'), 'not_connected', 'readTabs before connect');
  }

  // Connect verifies identity and readiness, then starts a new generation.
  {
    const { transport, client } = fresh({ paired: true });
    await client.connect();
    check(transport.calls[0]?.method === 'status.get', 'connect reads status first');
    check(client.getState().generation === 1 && client.getState().phase === 'syncing', 'connect begins generation 1 and still needs a snapshot');
    check(client.runtimeId === 'mock-runtime', 'runtime id is exposed after connect');
    const agents = await client.listAgents();
    check(transport.calls.some(c => c.method === 'worktree.ps'), 'listAgents calls worktree.ps');
    check(agents.length === 1 && agents[0]!.target.hostId === 'host-1' && agents[0]!.target.connectionGeneration === 1, 'agents are bound to host and generation');
    check(client.getState().phase === 'ready' && client.getState().revision === 1, 'first accepted snapshot is revision 1');
    check(fresh().client.connectionState().paired === false, 'pairing is the pairing layer\'s claim; a bare client does not assert it');
    const conn = client.connectionState();
    check(conn.hostId === 'host-1' && conn.generation === 1 && conn.online && conn.paired && conn.controlsVerified === false && (conn.enabledCommands ?? []).length === 0, 'reads never verify controls');
    const verdict = checkCommand({ kind: 'send_prompt', target: agents[0]!.target, text: 'go' }, agents[0]!, conn, clock, { hostId: 'host-1', generation: 1 });
    check(!verdict.allowed && verdict.reason === 'unverified_capability', 'policy refuses writes because no capability was verified');
  }

  // A connected original terminal may be absent from hooks; it must still reach the real reader.
  {
    const {transport,client}=fresh();
    const terminal={handle:'hookless-supervisor',connected:true,orphaned:false,worktreeId:'wt-1',tabId:'tab-supervisor',leafId:'leaf-supervisor',agentIdentity:'claude',title:'Supervisor',lastOutputAt:t0-100};
    transport.handlers.set('terminal.list',()=>({terminals:[terminal],totalCount:1,truncated:false,hostScope:{hostIds:['local'],omittedHostIds:[]}}));
    transport.handlers.set('terminal.agentStatus',params=>({agentStatus:{handle:params?.terminal,isRunningAgent:true,status:'idle'}}));
    await client.connect();const rows=await client.listAgents();
    check(rows.some(a=>a.target.terminalId==='tab-supervisor:leaf-supervisor'&&a.state==='idle'),'hook-less supervisor reaches listAgents');
    check(transport.calls.some(c=>c.method==='terminal.list'&&c.params?.includePreview===false&&c.params?.includeVisualLayouts===false),'catalog explicitly suppresses owner terminal output');
    check(transport.calls.filter(c=>c.method==='terminal.agentStatus').length===1,'original status is read only for the missing hook row');
    clock+=1000;
    check((await client.listAgents()).find(a=>a.title==='Supervisor')?.dashboard?.stateChangedAt===null,'polling publishes no invented state event time');clock=t0;
  }

  // The live reader must pass the desktop's acknowledgment projection into presentation.
  {
    const {transport,client}=fresh();
    transport.handlers.set('worktree.ps',()=>{const value=listing('wt-1');Object.assign(value.worktrees[0].agents[0],{state:'done',stateStartedAt:t0-2000});return value;});
    transport.handlers.set('ui.get',()=>({ui:{acknowledgedAgentsByPaneKey:{'agent-0':t0-2000}}}));
    transport.handlers.set('terminal.list',()=>({terminals:[{handle:'orphan',worktreeId:'wt-1',tabId:'orphan-tab',leafId:'leaf',connected:true,orphaned:true,agentIdentity:'claude',lastOutputAt:t0}],totalCount:1,truncated:false,hostScope:{hostIds:['local'],omittedHostIds:[]}}));
    await client.connect();const rows=await client.listAgents();
    check(rows.length===1,'orphan terminal output does not inflate the live reader');
    check(rows[0]?.dashboard?.visible===false&&rows[0]?.dashboard?.bucket==='idle','an acknowledged done row leaves presentation but stays in inventory');
    check(!transport.calls.some(c=>c.method==='terminal.agentStatus'),'orphan processes do not trigger supplementary status requests');
  }

  // Optional order requests carry their own source clock; a total read failure is not an empty success.
  {
    const {transport,client}=fresh();await client.connect();
    transport.handlers.set('ui.get',()=>({ui:{sortBy:'name'}}));
    transport.handlers.set('mobileRelay.projectSections',()=>({catalog:{repos:[{id:'repo'}]}}));
    const order=await client.readOrder();
    check(Reflect.get(order,'observedAt')===t0,'order retains its successful request clock');
    clock=t0+1000;
    transport.handlers.set('ui.get',()=>{throw new Error('fixture read failure');});
    transport.handlers.set('mobileRelay.projectSections',()=>{throw new Error('fixture read failure');});
    await rejects(client.readOrder(),'transport_failed','both failed order reads cannot stamp a new success');clock=t0;
  }

  // Refusals at connect.
  {
    const a = fresh(); a.transport.handlers.set('status.get', () => ({ ...status, graphStatus: 'starting' }));
    await rejects(a.client.connect(), 'host_not_ready', 'host graph not ready');
    const b = fresh(); b.transport.handlers.set('status.get', () => ({ ...status, minCompatibleMobileVersion: 99 }));
    await rejects(b.client.connect(), 'incompatible_protocol', 'mobile too old');
    const c = fresh(); c.transport.handlers.set('status.get', () => ({ ...status, protocolVersion: 1 }));
    await rejects(c.client.connect(), 'incompatible_protocol', 'desktop too old');
    const d = fresh({ expectedRuntimeId: 'someone-else' });
    await rejects(d.client.connect(), 'host_identity_mismatch', 'expected runtime id');
    const e = fresh(); e.transport.handlers.set('status.get', () => ({ runtimeId: '' }));
    await rejects(e.client.connect(), 'malformed_response', 'malformed status');
    const f = fresh(); f.transport.handlers.set('status.get', () => { throw new Error('socket closed'); });
    await rejects(f.client.connect(), 'transport_failed', 'transport failure');
    check(f.client.getState().phase === 'disconnected', 'failed connect leaves the client disconnected');
  }

  // A host that changes runtime identity on reconnect is refused (no silent host swap).
  {
    const { transport, client } = fresh();
    await client.connect();
    transport.handlers.set('status.get', () => ({ ...status, runtimeId: 'different-runtime' }));
    await rejects(client.connect(), 'host_identity_mismatch', 'runtime swap on reconnect');
  }

  // Incomplete or foreign listings never become a ready snapshot.
  {
    const { transport, client } = fresh();
    await client.connect();
    transport.handlers.set('worktree.ps', () => ({ ...listing('wt-1'), truncated: true }));
    await rejects(client.listAgents(), 'truncated_listing', 'truncated listing');
    check(client.getState().phase === 'syncing', 'a rejected listing leaves the state syncing');
    transport.handlers.set('worktree.ps', () => ({ worktrees: [{ ...row('wt-1'), worktreeId: '' }], totalCount: 1, truncated: false }));
    await rejects(client.listAgents(), 'malformed_response', 'malformed row');
    transport.handlers.set('worktree.ps', () => ({ worktrees: [row('wt-1')] }));
    await rejects(client.listAgents(), 'malformed_response', 'listing without completeness evidence');
  }

  // One ambiguous pane is inert without taking away independently verified sibling reads.
  {
    const {transport,client}=fresh({paired:true});await client.connect();
    const source=row('wt-1','working'),agent=source.agents[0];
    transport.handlers.set('worktree.ps',()=>({worktrees:[{...source,hostId:'local',unverifiableTerminalCount:0,agents:[agent,{...agent,state:'blocked'},{...agent,paneKey:'independent'}]}],totalCount:1,truncated:false,hostScope:{hostIds:['local'],omittedHostIds:[]}}));
    const agents=await client.listAgents(),ambiguous=agents.find(a=>a.target.terminalId==='agent-0')!;
    check(agents.length===2&&agents.some(a=>a.target.terminalId==='independent'&&a.state==='working'),'independent pane remains readable through the real client projection');
    check(ambiguous.state==='unknown'&&ambiguous.permissionEvidence==='missing'&&ambiguous.requestId===undefined,'ambiguous row has no state or request authority');
    const conn={...client.connectionState(),controlsVerified:true,enabledCommands:['send_prompt' as const,'approve_permission' as const,'reject_permission' as const]};
    const active={hostId:'host-1',generation:client.getState().generation};
    check(!checkCommand({kind:'send_prompt',target:ambiguous.target,text:'go'},ambiguous,conn,clock,active).allowed,'duplicate pane cannot receive prompt even with capabilities');
    for(const kind of ['approve_permission','reject_permission'] as const)check(!checkCommand({kind,target:ambiguous.target,requestId:'claimed'},ambiguous,conn,clock,active).allowed,'duplicate pane cannot approve or reject');
  }

  // Out-of-order responses: the later request wins and the earlier late response cannot overwrite it.
  {
    const { transport, client } = fresh();
    await client.connect();
    const first = deferred<unknown>(); const second = deferred<unknown>(); let n = 0;
    transport.handlers.set('worktree.ps', () => (++n === 1 ? first.promise : second.promise));
    const p1 = client.listAgents(); const p2 = client.listAgents();
    second.resolve(listing('newer'));
    const newer = await p2;
    check(newer.length === 1 && newer[0]!.target.worktreeId === 'newer', 'the later request is accepted first');
    first.resolve(listing('older'));
    await rejects(p1, 'snapshot_rejected', 'the older response arrives late');
    check(client.getState().agents[0]?.target.worktreeId === 'newer', 'the late response did not overwrite newer state');
  }

  // Disconnect and reconnect fence in-flight work.
  {
    const { transport, client } = fresh();
    await client.connect();
    await client.listAgents();
    const slow = deferred<unknown>();
    transport.handlers.set('worktree.ps', () => slow.promise);
    const inFlight = client.listAgents();
    await client.disconnect();
    check(client.getState().phase === 'disconnected' && client.getState().agents.every(a => a.state === 'unknown' && a.requestId === undefined), 'disconnect makes every agent unknown');
    slow.resolve(listing('wt-1'));
    await rejects(inFlight, 'snapshot_rejected', 'response after disconnect');
    check(client.getState().phase === 'disconnected', 'a response after disconnect cannot revive the state');
    await rejects(client.listAgents(), 'not_connected', 'listing while disconnected');

    transport.handlers.set('worktree.ps', () => listing('wt-1'));
    await client.connect();
    check(client.getState().generation === 3, 'reconnect begins a new generation');
    const slow2 = deferred<unknown>(); let k = 0;
    transport.handlers.set('worktree.ps', () => (++k === 1 ? slow2.promise : listing('wt-1')));
    const stale = client.listAgents();
    await client.connect();
    slow2.resolve(listing('wt-1'));
    await rejects(stale, 'snapshot_rejected', 'response from a previous connection generation');
  }

  // Skewed host clock: the row is unknown rather than fresh, and the snapshot still arrives.
  {
    const { transport, client } = fresh();
    await client.connect();
    transport.handlers.set('worktree.ps', () => ({ worktrees: [row('wt-1', 'blocked', t0 + 120_000)], totalCount: 1, truncated: false }));
    const agents = await client.listAgents();
    check(agents[0]!.state === 'unknown', 'a future host timestamp is shown as unknown');
  }

  // Tabs carry the host's own publication epoch and version.
  {
    const { transport, client } = fresh();
    await client.connect();
    let version = 1; let epoch = 'epoch-a';
    transport.handlers.set('session.tabs.list', () => tabs(version, epoch));
    const first = await client.readTabs('wt-1');
    check(first.snapshot.publication.version === 1 && !first.epochChanged, 'first tabs read is accepted');
    check(transport.calls.at(-1)?.params?.worktree === 'id:wt-1', 'tabs are requested by explicit worktree id selector');
    version = 2; check((await client.readTabs('wt-1')).snapshot.publication.version === 2, 'a newer version is accepted');
    version = 2; check((await client.readTabs('wt-1')).snapshot.publication.version === 2, 'an unchanged host re-sends the same version and that is not an error');
    version = 1; await rejects(client.readTabs('wt-1'), 'stale_tabs_snapshot', 'older version in the same epoch');
    epoch = 'epoch-b'; version = 1;
    const restarted = await client.readTabs('wt-1');
    check(restarted.epochChanged && restarted.snapshot.publication.epoch === 'epoch-b', 'a new epoch is accepted and flagged as a publisher restart');
    transport.handlers.set('session.tabs.list', () => tabs(5, 'epoch-b', 'other-worktree'));
    await rejects(client.readTabs('wt-1'), 'malformed_response', 'tabs for a different worktree than requested');
    transport.handlers.set('session.tabs.list', () => tabs(3, 'epoch-b'));
    check((await client.readTabs('wt-1')).snapshot.publication.version === 3, 'version 3 of epoch-b is accepted');
    await client.disconnect(); await client.connect();
    transport.handlers.set('session.tabs.list', () => tabs(2, 'epoch-b'));
    await rejects(client.readTabs('wt-1'), 'stale_tabs_snapshot', 'an older version is still rejected after reconnect');
  }

  // A tabs response from a connection that no longer exists is discarded and leaves no publisher trace.
  {
    const { transport, client } = fresh();
    await client.connect();
    const slowTabs = deferred<unknown>();
    transport.handlers.set('session.tabs.list', () => slowTabs.promise);
    const inFlight = client.readTabs('wt-1');
    await client.disconnect();
    slowTabs.resolve(tabs(7));
    await rejects(inFlight, 'snapshot_rejected', 'tabs response after disconnect');
    await client.connect();
    transport.handlers.set('session.tabs.list', () => tabs(7));
    check((await client.readTabs('wt-1')).snapshot.publication.version === 7, 'the discarded response did not advance the publisher order');

    const slowAgain = deferred<unknown>(); let calls = 0;
    transport.handlers.set('session.tabs.list', () => (++calls === 1 ? slowAgain.promise : tabs(9, 'epoch-a', 'wt-2')));
    const stale = client.readTabs('wt-2');
    await client.connect();
    slowAgain.resolve(tabs(8, 'epoch-a', 'wt-2'));
    await rejects(stale, 'snapshot_rejected', 'tabs response from a previous connection generation');
    check((await client.readTabs('wt-2')).snapshot.publication.version === 9, 'only the current-generation response is recorded');
  }

  // A failed or hung refresh never leaves old state looking current.
  {
    const { transport, client } = fresh({ paired: true });
    await client.connect(); await client.listAgents();
    check(client.connectionState().online, 'a ready client is online');
    transport.handlers.set('worktree.ps', () => { throw new Error('socket closed'); });
    await rejects(client.listAgents(), 'transport_failed', 'refresh transport failure');
    check(client.getState().phase === 'syncing' && client.getState().agents.every(a => a.state === 'unknown' && a.requestId === undefined), 'a failed refresh turns every agent unknown');
    check(!client.connectionState().online && client.connectionState().lastConfirmedAt === undefined, 'a failed refresh is not online and has no confirmation time');
    transport.handlers.set('worktree.ps', () => listing('wt-1'));
    check((await client.listAgents()).length === 1 && client.getState().phase === 'ready', 'the next successful read recovers');
    transport.handlers.set('worktree.ps', () => ({ worktrees: [{ worktreeId: '' }], totalCount: 1, truncated: false }));
    await rejects(client.listAgents(), 'malformed_response', 'malformed refresh');
    check(client.getState().phase === 'syncing' && client.getState().agents.every(a => a.state === 'unknown'), 'a malformed refresh also invalidates the old state');
  }
  {
    const { transport, client } = fresh();
    await client.connect();
    const slow = deferred<unknown>(); let n = 0;
    transport.handlers.set('worktree.ps', () => (++n === 1 ? slow.promise : listing('newer')));
    const older = client.listAgents(); const newer = client.listAgents();
    await newer;
    slow.resolve('garbage');
    await rejects(older, 'malformed_response', 'an older response that is malformed');
    check(client.getState().phase === 'ready' && client.getState().agents[0]?.target.worktreeId === 'newer', 'an older failing response does not wipe a newer accepted snapshot');
  }
  {
    const a = fresh({ requestTimeoutMs: 20 });
    a.transport.handlers.set('status.get', () => new Promise(() => {}));
    await rejects(a.client.connect(), 'request_timeout', 'hung connect');
    check(a.client.getState().phase === 'disconnected', 'a hung connect leaves the client disconnected');
    const b = fresh({ requestTimeoutMs: 20 });
    await b.client.connect(); await b.client.listAgents();
    b.transport.handlers.set('worktree.ps', () => new Promise(() => {}));
    await rejects(b.client.listAgents(), 'request_timeout', 'hung refresh');
    check(b.client.getState().agents.every(a => a.state === 'unknown'), 'a hung refresh invalidates the old state');
  }

  // Freshness is measured from when the request was issued, not when the answer arrived.
  {
    const { transport, client } = fresh();
    await client.connect();
    const issued = clock;
    transport.handlers.set('worktree.ps', () => { clock += 25_000; return listing('wt-1'); });
    check((await client.listAgents()).length === 1, 'an answer within the window is accepted');
    check(client.connectionState().lastConfirmedAt === new Date(issued).toISOString(), 'confirmation time is the issue time, not the arrival time');
    transport.handlers.set('worktree.ps', () => { clock += 31_000; return listing('wt-1'); });
    await rejects(client.listAgents(), 'snapshot_rejected', 'an answer that outlived the freshness window');
    check(client.getState().agents.every(a => a.state === 'unknown'), 'and the old state is not kept');
    clock = t0;
  }

  // A disconnect or newer connect cannot be undone by an older, still-running connect.
  {
    const { transport, client } = fresh();
    const slow = deferred<unknown>();
    transport.handlers.set('status.get', () => slow.promise);
    const pending = client.connect();
    await client.disconnect();
    slow.resolve(status);
    await rejects(pending, 'connect_superseded', 'disconnect during connect');
    check(client.getState().phase === 'disconnected', 'a disconnect during connect is honored');
    await rejects(client.listAgents(), 'not_connected', 'reading after a superseded connect');
  }
  {
    const { transport, client } = fresh();
    const first = deferred<unknown>(); const second = deferred<unknown>(); let n = 0;
    transport.handlers.set('status.get', () => (++n === 1 ? first.promise : second.promise));
    const p1 = client.connect(); const p2 = client.connect();
    second.resolve(status); await p2;
    check(client.getState().phase === 'syncing', 'the latest connect wins');
    first.resolve({ ...status, runtimeId: 'late-and-different' });
    await rejects(p1, 'connect_superseded', 'the older connect finishes late');
    check(client.getState().phase === 'syncing' && client.runtimeId === 'mock-runtime', 'a superseded connect cannot disconnect or re-pin the newer one');
    const failing = deferred<unknown>(); let k = 0;
    transport.handlers.set('status.get', () => (++k === 1 ? failing.promise : status));
    const q1 = client.connect(); const q2 = client.connect(); await q2;
    failing.resolve({ runtimeId: '' });
    await rejects(q1, 'connect_superseded', 'a superseded connect that would have failed');
    check(client.getState().phase === 'syncing', 'a superseded failing connect does not tear down the newer connection');
  }

  // Transport errors may carry credentials: nothing from them is exposed.
  {
    const { transport, client } = fresh();
    transport.handlers.set('status.get', () => { throw new Error('wss://host/?token=SECRET-TOKEN failed'); });
    try { await client.connect(); check(false, 'connect should fail'); } catch (error) {
      check(error instanceof ReadOnlyClientError && error.code === 'transport_failed' && error.message === 'transport_failed', 'the error carries only its code');
      check(error instanceof Error && error.cause === undefined, 'the original error is not attached as a cause');
      check(error instanceof Error && !JSON.stringify(error).includes('SECRET') && !String(error.stack).includes('SECRET'), 'no credential text reaches the error or its stack');
    }
  }

  // Callers cannot mutate the client's state through what they were handed.
  {
    const { client } = fresh();
    await client.connect();
    const handed = await client.listAgents();
    handed[0]!.permissionEvidence = 'structured_verified';
    handed[0]!.target.worktreeId = 'tampered';
    check(client.getState().agents[0]!.permissionEvidence === 'missing' && client.getState().agents[0]!.target.worktreeId === 'wt-1', 'returned agents are copies');
  }

  // The host's "ask later" placeholder epoch is not evidence that tabs closed and is not recorded as an order floor.
  {
    const { transport, client } = fresh();
    await client.connect();
    transport.handlers.set('session.tabs.list', () => ({ ...tabs(0, 'none'), tabs: [] }));
    const placeholder = await client.readTabs('wt-1');
    check(!placeholder.snapshot.published && !placeholder.snapshot.complete && !placeholder.epochChanged, 'a placeholder epoch is reported as unpublished');
    transport.handlers.set('session.tabs.list', () => tabs(1, 'epoch-a'));
    const real = await client.readTabs('wt-1');
    check(real.snapshot.published && real.snapshot.complete && !real.epochChanged, 'the first real publication is accepted normally');
  }

  // A transport factory makes connect() a real reconnect: each attempt gets a fresh transport and owns it.
  {
    const made: Array<FakeTransport & { closed: number; close(): void }> = [];
    const factory = async () => {
      const t = Object.assign(new FakeTransport(), { closed: 0, close() { this.closed++; } });
      t.handlers.set('status.get', () => status);
      t.handlers.set('worktree.ps', () => listing('wt-1'));
      made.push(t);
      return t;
    };
    const client = new ReadOnlyOrcaClient({ hostId: 'host-1', connectTransport: factory, now });
    await client.connect();
    check(made.length === 1 && (await client.listAgents()).length === 1, 'the factory transport is used');
    made[0]!.handlers.set('worktree.ps', () => { throw new Error('the connection died'); });
    await rejects(client.listAgents(), 'transport_failed', 'the transport died');
    await client.connect();
    check((made.length as number) === 2 && made[0]!.closed === 1, 'reconnect creates a new transport and closes the old one');
    check((await client.listAgents()).length === 1 && client.getState().phase === 'ready', 'the new transport serves reads');
    await client.disconnect();
    check(made[1]!.closed === 1, 'disconnect closes the transport the client created');
    await client.disconnect();
    check(made[1]!.closed === 1, 'closing twice is harmless');
  }
  {
    const client = new ReadOnlyOrcaClient({ hostId: 'host-1', connectTransport: async () => { throw new Error('connect ECONNREFUSED SECRET-TOKEN'); }, now });
    try { await client.connect(); check(false, 'connect should fail'); } catch (error) {
      check(error instanceof ReadOnlyClientError && error.code === 'transport_failed' && error.message === 'transport_failed' && error.cause === undefined, 'a factory failure is a coded error with no cause');
    }
    check(client.getState().phase === 'disconnected', 'a failed reconnect leaves the client disconnected');
  }
  {
    const release = deferred<unknown>();
    let late: (FakeTransport & { closed: number; close(): void }) | undefined;
    const client = new ReadOnlyOrcaClient({ hostId: 'host-1', now, connectTransport: async () => { await release.promise; late = Object.assign(new FakeTransport(), { closed: 0, close() { this.closed++; } }); return late; } });
    const pending = client.connect();
    await client.disconnect();
    release.resolve(undefined);
    await rejects(pending, 'connect_superseded', 'disconnect while the transport is being created');
    check(late !== undefined && late.closed === 1, 'a transport created for a superseded connect is closed, not leaked');
    check(client.getState().phase === 'disconnected', 'and the client stays disconnected');
  }
  // Closing an owned transport rejects what is in flight on it; that must still read as "superseded", not as a failure to retry.
  {
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    const owned = () => {
      let rejectStatus!: (error: Error) => void;
      const pending = new Promise<unknown>((_, reject) => { rejectStatus = reject; });
      return Object.assign(new FakeTransport(), { closed: 0, close() { this.closed++; rejectStatus(new Error('socket closed SECRET-TOKEN')); }, hold: () => { void 0; } , pending });
    };
    const first = owned();
    first.handlers.set('status.get', () => first.pending);
    const client = new ReadOnlyOrcaClient({ hostId: 'host-1', now, connectTransport: async () => first });
    const connecting = client.connect();
    await tick();
    await client.disconnect();
    await rejects(connecting, 'connect_superseded', 'disconnect while status.get is in flight on an owned transport');
    check(first.closed === 1, 'and that transport was closed once');
  }
  {
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    let rejectFirst!: (error: Error) => void;
    const firstStatus = new Promise<unknown>((_, reject) => { rejectFirst = reject; });
    const a = Object.assign(new FakeTransport(), { closed: 0, close() { this.closed++; rejectFirst(new Error('closed')); } });
    a.handlers.set('status.get', () => firstStatus);
    const b = Object.assign(new FakeTransport(), { closed: 0, close() { this.closed++; } });
    b.handlers.set('status.get', () => status);
    b.handlers.set('worktree.ps', () => listing('wt-1'));
    const queue = [a, b];
    const client = new ReadOnlyOrcaClient({ hostId: 'host-1', now, connectTransport: async () => queue.shift()! });
    const older = client.connect();
    await tick();
    const newer = client.connect();
    await rejects(older, 'connect_superseded', 'a newer connect closes the older transport mid status.get');
    await newer;
    check(a.closed === 1 && client.getState().phase === 'syncing' && (await client.listAgents()).length === 1, 'the newer connect completes on its own transport');
  }

  // A restarted host is a new runtime. The pin guards one connection; forgetRuntime() lets the owner accept the next one.
  {
    const runtimes = ['rt-a', 'rt-b', 'rt-b', 'rt-b'];
    const factory = async () => {
      const t = Object.assign(new FakeTransport(), { closed: 0, close() { this.closed++; } });
      const runtimeId = runtimes.shift()!;
      t.handlers.set('status.get', () => ({ ...status, runtimeId }));
      t.handlers.set('worktree.ps', () => listing('wt-1'));
      t.handlers.set('session.tabs.list', () => tabs(1, `${runtimeId}:epoch`));
      return t;
    };
    const client = new ReadOnlyOrcaClient({ hostId: 'host-1', connectTransport: factory, now });
    await client.connect();
    check(client.runtimeId === 'rt-a', 'the first connect pins the runtime');
    await client.readTabs('wt-1');
    await rejects(client.connect(), 'host_identity_mismatch', 'a different runtime on reconnect is reported');
    await rejects(client.listAgents(), 'not_connected', 'and nothing is readable after it');
    await rejects(client.connect(), 'host_identity_mismatch', 'it keeps being reported until the owner decides');
    client.forgetRuntime();
    check(client.runtimeId === undefined, 'forgetRuntime() drops the pin');
    await client.connect();
    check(client.runtimeId === 'rt-b' && (await client.listAgents()).length === 1, 'the next connect pins the new runtime and reads normally');
    const fresh = await client.readTabs('wt-1');
    check(fresh.snapshot.published && !fresh.epochChanged, 'tab ordering starts afresh for the new runtime (no stale-version carry-over)');
  }

  // Only the two secret-free "needs the user" codes cross the factory boundary; any other error stays a plain transport failure.
  for (const reason of ['auth_rejected', 'host_mismatch']) {
    const client = new ReadOnlyOrcaClient({ hostId: 'host-1', now, connectTransport: async () => { throw Object.assign(new Error('refused SECRET-TOKEN'), { code: reason }); } });
    try { await client.connect(); check(false, 'connect should fail'); } catch (error) {
      check(error instanceof ReadOnlyClientError && error.code === reason && error.message === reason && error.cause === undefined, `${reason} is passed on as a code`);
    }
  }
  // The kind of connection failure is secret-free and tells a user (and a developer) what happened: it is passed on too, as a
  // transient code. Anything else, including free text, stays a plain transport failure.
  for (const reason of ['connect_failed', 'handshake_timeout', 'protocol_error']) {
    const client = new ReadOnlyOrcaClient({ hostId: 'host-1', now, connectTransport: async () => { throw Object.assign(new Error('refused SECRET-TOKEN'), { code: reason }); } });
    try { await client.connect(); check(false, 'connect should fail'); } catch (error) {
      check(error instanceof ReadOnlyClientError && error.code === reason && error.message === reason && error.cause === undefined, `${reason} is passed on as a code`);
    }
  }
  for (const reason of ['closed', 'ECONNREFUSED SECRET-TOKEN', 7]) {
    const client = new ReadOnlyOrcaClient({ hostId: 'host-1', now, connectTransport: async () => { throw Object.assign(new Error('refused'), { code: reason }); } });
    try { await client.connect(); check(false, 'connect should fail'); } catch (error) {
      check(error instanceof ReadOnlyClientError && error.code === 'transport_failed', `a ${String(reason)} error is a plain transport failure`);
    }
  }
  {
    let threw = false;
    try { new ReadOnlyOrcaClient({ hostId: 'host-1', now }); } catch { threw = true; }
    check(threw, 'a client needs a transport or a transport factory');
    let both = false;
    try { new ReadOnlyOrcaClient({ hostId: 'host-1', now, transport: new FakeTransport(), connectTransport: async () => new FakeTransport() }); } catch { both = true; }
    check(both, 'a client takes a transport or a factory, never both');
    const bare = Object.assign(new FakeTransport(), { closed: 0, close() { this.closed++; } });
    bare.handlers.set('status.get', () => status);
    const fixed = new ReadOnlyOrcaClient({ hostId: 'host-1', transport: bare, now });
    await fixed.connect(); await fixed.connect(); await fixed.disconnect();
    check(bare.closed === 0, 'a transport the caller injected is never closed by the client, even across reconnects');
  }

  // Writes are disabled by construction.
  {
    const { transport, client } = fresh();
    await client.connect();
    const before = transport.calls.length;
    await rejects(client.send({ kind: 'send_prompt', target: { hostId: 'host-1', worktreeId: 'wt-1', terminalId: 'agent-0' }, text: 'hi' }), 'writes_disabled', 'send');
    check(transport.calls.length === before, 'a refused write never reaches the transport');
  }

  {
    const {client}=fresh();await client.connect();
    check(client.inventoryEvidence()===undefined,'a handshake supplies no inventory completeness');
    await client.listAgents();
    const evidence=client.inventoryEvidence();
    check(evidence?.worktreeIds.join(',')==='wt-1'&&evidence?.complete===false,'basic reader exposes scoped partial evidence without inventing missing terminal coverage');
    if(evidence)(evidence.worktreeIds as string[]).push('injected');
    check(client.inventoryEvidence()?.worktreeIds.length===1,'view metadata cannot mutate the reader inventory');
    await client.disconnect();check(client.inventoryEvidence()===undefined,'disconnect invalidates prior inventory evidence');
  }

  clearTimeout(watchdog);
  console.log(`PASS: ${count} read-only client assertions (fake transport; no host contacted)`);
}

// An unhandled rejection exits non-zero, which fails the test run.
void main();
