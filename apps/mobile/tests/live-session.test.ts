import {ReadOnlyClientError} from '../src/adapters/read-only-orca-client';
import { LiveSession } from '../src/adapters/live-session';
import type { LiveSnapshot } from '../src/adapters/live-session';
import { PairingStore, PAIRING_STORAGE_KEY } from '../src/adapters/pairing-store';
import type { PairedHost, SecureValueStore } from '../src/adapters/pairing-store';
import type { RpcTransport } from '../src/adapters/read-only-orca-client';
import { PAIRING_OFFER_VERSION } from '../src/upstream/orca-1.4.245/src/shared/mobile-relay-pairing-offer';

let count = 0;
function check(value: unknown, message: string): asserts value { count++; if (!value) throw new Error(message); }

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const KEY = b64(new Uint8Array(32).map((_, i) => i + 1));
const TOKEN = 'SECRET-DEVICE-TOKEN-abcdef';
const code = btoa(JSON.stringify({ v: PAIRING_OFFER_VERSION, endpoint: 'ws://192.168.0.60:6768', deviceToken: TOKEN, publicKeyB64: KEY }));

class MemoryStore implements SecureValueStore {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async set(key: string, value: string) { this.values.set(key, value); }
  async remove(key: string) { this.values.delete(key); }
}

type Handler = () => unknown;
class FakeTransport implements RpcTransport {
  closed = 0;
  calls: string[] = [];
  handlers = new Map<string, Handler>();
  async request(method: string): Promise<unknown> {
    this.calls.push(method);
    const handler = this.handlers.get(method);
    if (!handler) throw new Error(`unhandled ${method}`);
    return handler();
  }
  close() { this.closed++; }
}

const t0 = Date.parse('2026-11-02T06:00:00Z');
let clock = t0;
const status = { runtimeId: 'rt', protocolVersion: 3, minCompatibleMobileVersion: 2, capabilities: [], graphStatus: 'ready' };
const statusFor = (runtimeId: string) => ({ ...status, runtimeId });
const listing = (state: string, title = 'task') => ({
  worktrees: [{ worktreeId: 'wt-1', displayName: 'wt-1', preview: '', agents: [{ paneKey: 'agent-0', state, agentType: 'claude', taskTitle: title, interrupted: false, updatedAt: clock - 1000 }] }],
  totalCount: 1, truncated: false,
});

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
function manualDelay() {
  const waiting: Array<{ ms: number; resolve: () => void }> = [];
  return {
    delay: (ms: number) => new Promise<void>(resolve => { waiting.push({ ms, resolve }); }),
    waiting,
    async next(): Promise<number | undefined> { await settle(); const entry = waiting.shift(); entry?.resolve(); await settle(); return entry?.ms; },
  };
}

function setup(options: { store?: MemoryStore; usage?:Promise<unknown>; focus?:()=>unknown } = {}) {
  const memory = options.store ?? new MemoryStore();
  const transports: FakeTransport[] = [];
  const behavior = { state: 'waiting', openFails: false, openError: '', listFails: false, nowFails: false, title: 'task', runtimeId: 'rt', attempts: 0 };
  const timer = manualDelay();
  const session = new LiveSession({
    store: new PairingStore(memory),
    openTransport: async (_host: PairedHost) => {
      behavior.attempts++;
      if (behavior.openError) throw Object.assign(new Error(`refused ${TOKEN}`), { code: behavior.openError });
      if (behavior.openFails) throw new Error(`refused ${TOKEN}`);
      const transport = new FakeTransport();
      transport.handlers.set('status.get', () => ({...statusFor(behavior.runtimeId),capabilities:options.focus?['frontend.focus.read.v1']:[]}));
      transport.handlers.set('worktree.ps', () => { if (behavior.listFails) throw new Error('socket closed'); return listing(behavior.state, behavior.title); });
      if(options.usage)transport.handlers.set('accounts.list',()=>options.usage!);
      if(options.focus)transport.handlers.set('frontend.focus.get',options.focus);
      transports.push(transport);
      return transport;
    },
    delay: timer.delay,
    now: () => { if (behavior.nowFails) throw new Error(`clock broke ${TOKEN}`); return clock; },
    refreshMs: 5000,
  });
  const seen: LiveSnapshot[] = [];
  session.subscribe(snapshot => { seen.push(snapshot); });
  return { memory, transports, behavior, timer, session, seen };
}

async function main() {
  const watchdog = setTimeout(() => { throw new Error('live-session test timed out'); }, 60_000);
  // D29 R1: serialize inventory producers without reusing a pending poll as action proof.
  for(const first of ['poll','hold']){
    if(process.env.D29_RACE_CASE&&process.env.D29_RACE_CASE!==first)continue;
    const h=setup();await h.session.pair(code);await settle();const bound=h.session.actionChannel();check(!!bound,'capture race owner');
    let calls=0,release:()=>void=()=>{};const gate=new Promise<void>(r=>{release=r;});
    h.transports[0].handlers.set('worktree.ps',async()=>{calls++;if(calls===1)await gate;return listing('waiting',calls===1?'first':'second');});
    let fresh:Promise<ReturnType<typeof h.session.actionChannel>>;
    if(first==='poll'){await h.timer.next();fresh=h.session.refreshActionChannel(bound);}
    else{fresh=h.session.refreshActionChannel(bound);await settle();await h.timer.next();}
    await settle();check(calls===1,`D29 ${first} inventory must finish before the other producer issues its own request`);
    release();const result=await fresh;await settle();check(!!result&&result.transport===bound.transport&&result.generation===bound.generation,'serialized new read keeps the original authenticated connection');
    check(Number(calls)===2,'new action inventory is issued separately; a pending poll is never reused');
    check(h.behavior.attempts===1&&h.transports[0].closed===0&&h.session.getSnapshot().phase==='live','late inventory cannot create false reconnect/target change');h.session.stop();
  }
  {
    const h=setup();await h.session.pair(code);await settle();const transport=h.transports[0];
    const client=Reflect.get(h.session,'client') as {listAgents:()=>Promise<unknown>};const original=client.listAgents.bind(client);client.listAgents=async()=>{throw new ReadOnlyClientError('snapshot_rejected');};await h.timer.next();
    check(transport.closed===0&&h.behavior.attempts===1&&h.session.getSnapshot().phase==='live','superseded poll is not a connection failure');
    client.listAgents=original;await h.timer.next();check(h.session.getSnapshot().phase==='live'&&h.behavior.attempts===1,'superseded poll continues on the same next cycle');h.session.stop();
  }
  {
    const h=setup();await h.session.pair(code);await settle();const captured=h.session.actionChannel();check(!!captured,'capture generation race');
    const client=Reflect.get(h.session,'client') as {getState:()=>{generation:number}};
    let release:()=>void=()=>{};const gate=new Promise<void>(r=>{release=r;});let calls=0;
    h.transports[0].handlers.set('worktree.ps',async()=>{if(++calls===1)await gate;return listing('waiting');});
    const fresh=h.session.refreshActionChannel(captured);await settle();await h.timer.next();
    // A newer current generation supersedes both the in-flight action and queued old poll.
    Reflect.set(client,'state',{...client.getState(),generation:captured.generation+1});
    release();check(await fresh===null,'old-generation action read supplies no authority');await settle();
    check(h.transports[0].closed===0&&h.behavior.attempts===1,'connect_superseded queued poll must not disconnect the newer current generation');
    await h.timer.next();check(h.session.actionChannel()?.generation===captured.generation+1&&h.session.actionChannel()?.transport===captured.transport,'next poll confirms the current generation on the same authenticated transport');h.session.stop();
  }
  // D29: this call must issue new reads on the captured authenticated connection, even after review age.
  {
    const h=setup();await h.session.pair(code);await settle();
    const before=h.session.actionChannel();check(!!before,'D29 initial authenticated channel');
    clock+=300000;const calls=h.transports[0].calls.length;
    const refresh=Reflect.get(h.session,'refreshActionChannel');check(typeof refresh==='function','D29 needs an explicit fresh-read action boundary');
    const fresh=await refresh.call(h.session,before);
    check(!!fresh&&fresh.transport===before.transport&&fresh.runtimeId===before.runtimeId&&fresh.generation===before.generation,'D29 refresh keeps exact original connection');
    check(h.transports[0].calls.slice(calls).includes('status.get')&&h.transports[0].calls.slice(calls).includes('worktree.ps'),'D29 refresh performs new status and inventory RPCs');
    h.behavior.runtimeId='replaced-runtime';const afterFresh=h.transports[0].calls.length;
    check(await refresh.call(h.session,before)===null,'D29 a new status from another runtime cannot authorize a write');
    check(!h.transports[0].calls.slice(afterFresh).includes('worktree.ps'),'runtime mismatch stops before inventory reads');
    h.session.stop();clock=t0;
  }


  {
    const h=setup();await h.session.pair(code);await settle();const before=h.session.actionChannel();check(!!before,'D29 capture before stop race');
    const transport=h.transports[0],count=transport.calls.length;
    transport.handlers.set('status.get',()=>{h.session.stop();return status;});
    const refresh=Reflect.get(h.session,'refreshActionChannel');
    check(await refresh.call(h.session,before)===null,'D29 stopping the owner during new status invalidates the whole read');
    check(!transport.calls.slice(count).includes('worktree.ps'),'stopped owner cannot continue to inventory');
  }

  // Before the store has been read nothing is known: not "unpaired", so no screen may offer a demo or a pairing yet.
  {
    const h = setup();
    check(h.session.getSnapshot().phase === 'loading' && h.session.getSnapshot().agents.length === 0, 'a new session is loading, not unpaired');
    h.session.stop();
    check(h.session.getSnapshot().phase === 'loading', 'stopping a session that has not loaded claims nothing');
    await h.session.start();
    check(h.session.getSnapshot().phase === 'unpaired', 'and start() still loads afterwards');
    h.session.stop();
  }

  // Nothing paired.
  {
    const h = setup();
    await h.session.start();
    check(h.session.getSnapshot().phase === 'unpaired' && h.session.getSnapshot().agents.length === 0, 'with no pairing the session is unpaired and empty');
    check(h.transports.length === 0, 'nothing is dialed without a pairing');
    const result = await h.session.pair('definitely not a pairing code');
    check(result === 'invalid_code' && h.session.getSnapshot().phase === 'unpaired' && h.memory.values.size === 0, 'an invalid code pairs nothing and stores nothing');
    h.session.stop();
  }

  // session.tabs.list selection belongs to the paired mobile client, not the focused desktop window.
  {
    const h=setup();await h.session.pair(code);await settle();
    const transport=h.transports[0];
    transport.handlers.set('worktree.ps',()=>{const read=listing('working');return {...read,worktrees:read.worktrees.map(row=>({...row,isActive:true}))};});
    transport.handlers.set('session.tabs.list',()=>({worktree:'wt-1',publicationEpoch:'epoch',snapshotVersion:1,activeTabId:'mobile-old',tabs:[{id:'mobile-old',type:'terminal',parentTabId:'old-tab',leafId:'old-leaf'}]}));
    await h.timer.next();await settle();
    check(h.session.getSnapshot().inventory?.activeWorktreeId==='wt-1','the host worktree read is present for this regression');
    check(h.session.getSnapshot().desktopFocus===undefined,'a paired-device activeTabId must never become desktop focus');
    h.session.stop();
  }

  // Focus is a separate, explicitly negotiated read. An ambiguous frontend clears the previous target.
  {
    let focus:unknown={schema:1,status:'verified',observedAt:5,selection:{worktreeId:'wt-1',tabId:'current',leafId:'leaf',focusedAt:1,activationSequence:1,lastSeenAt:5,freshForMs:30_000,source:{clientId:'c1',windowId:'w1'}}};
    const h=setup({focus:()=>focus});await h.session.pair(code);await settle();
    check(h.session.getSnapshot().desktopFocus?.tabId==='current:leaf','a negotiated verified frontend projection identifies the actual pane');
    focus={schema:1,status:'ambiguous',observedAt:6};await h.timer.next();await settle();
    check(h.session.getSnapshot().desktopFocus===undefined,'ambiguous focus clears the old target instead of retaining it');
    h.session.stop();
    const old=setup();await old.session.pair(code);await settle();
    check(!old.transports[0].calls.includes('frontend.focus.get'),'hosts without the capability never receive the extension method');old.session.stop();
  }

  // A previous connection's focus cannot revive before the next connection verifies its frontend.
  {
    const verified={schema:1,status:'verified',observedAt:5,selection:{worktreeId:'wt-1',tabId:'current',leafId:'leaf',focusedAt:1,activationSequence:1,lastSeenAt:5,freshForMs:30_000,source:{clientId:'c1',windowId:'w1'}}};
    let focus:unknown=verified;
    const h=setup({focus:()=>focus});await h.session.pair(code);await settle();
    check(h.session.getSnapshot().desktopFocus!==undefined,'this connection first verified its frontend');
    h.behavior.listFails=true;await h.timer.next();
    check(h.session.getSnapshot().phase==='reconnecting'&&h.session.getSnapshot().desktopFocus===undefined,'disconnect immediately clears frontend focus');
    let release!:(value:unknown)=>void;focus=new Promise(resolve=>{release=resolve;});h.behavior.listFails=false;await h.timer.next();
    check(h.session.getSnapshot().phase==='live'&&h.session.getSnapshot().desktopFocus===undefined,'new generation waits for its own frontend read');
    h.session.stop();release(verified);await settle();
    check(h.session.getSnapshot().desktopFocus===undefined,'late focus does not revive a stopped session');
    const stopped=setup({focus:()=>verified});await stopped.session.pair(code);await settle();stopped.session.stop();
    check(stopped.session.getSnapshot().desktopFocus===undefined,'stop immediately clears verified focus');
  }

  // Tab publication is independent of a blocked optional provider read.
  {
    let finish!:(value:unknown)=>void;const usage=new Promise<unknown>(resolve=>{finish=resolve;});
    const h=setup({usage});await h.session.pair(code);await settle();
    check(h.session.getSnapshot().phase==='live','tabs render before optional usage answers');
    h.session.stop();finish({rateLimits:{}});await settle();
    check(h.session.getSnapshot().phase==='stopped','late metadata cannot revive a stopped session');
  }

  // Reconnecting retains pane names while clearing action evidence.
  {
    const h=setup();await h.session.pair(code);await settle();h.session.stop();
    // Keep the previous rows while the same paired host reconnects.
    await h.session.start();
    const connecting=h.seen.filter(s=>s.phase==='connecting').at(-1)!;
    check(connecting.agents.length===1,'reconnecting must not erase the last pane rows');
    check(connecting.agents.every(a=>a.state==='unknown'),'retained rows do not preserve action authority');
    await settle();h.session.stop();
  }

  // Pair, go live, refresh, and never expose the secret.
  {
    const h = setup();
    check(await h.session.pair(code) === 'paired', 'a valid code pairs');
    await settle();
    check(h.memory.values.has(PAIRING_STORAGE_KEY), 'the pairing is stored');
    const live = h.session.getSnapshot();
    check(h.session.actionChannel()?.transport === h.transports[0], 'actions receive only the current authenticated transport');
    check(live.phase === 'live' && live.agents.length === 1 && live.agents[0]!.state === 'question', 'the session goes live with the host agents');
    check(live.host?.endpointHost === '192.168.0.60:6768' && !JSON.stringify(live).includes(TOKEN) && !JSON.stringify(live).includes(KEY), 'the snapshot shows the host but never the token or key');
    check(live.connection?.online === true && live.connection.paired === true && live.connection.hostId === live.host?.hostId, 'a live session is online and paired for the policy layer');
    check(live.connection?.controlsVerified === false && live.connection.enabledCommands?.length === 0 && live.connection.lastConfirmedAt !== undefined, 'reading never enables controls');
    check(h.seen.some(s => s.phase === 'connecting'), 'a connecting phase is announced first');
    check(h.timer.waiting[0]?.ms === 5000, 'the next refresh is scheduled');
    h.behavior.state = 'working';
    await h.timer.next();
    check(h.session.getSnapshot().agents[0]!.state === 'working', 'a refresh updates the agents');
    check(h.transports.length === 1 && h.transports[0]!.calls.filter(c => c === 'worktree.ps').length === 2, 'refreshing reuses the connection');
    // Usage is read once a minute; the refresh button asks for it on the very next cycle.
    const usageReads = () => h.transports[0]!.calls.filter(c => c === 'accounts.list').length;
    const before = usageReads();
    await h.timer.next();
    check(usageReads() === before, 'usage is not re-read on every agent refresh');
    h.session.refreshUsage();
    await h.timer.next();
    check(usageReads() === before + 1, 'a usage refresh request reads usage on the next cycle');
    await h.timer.next();
    check(usageReads() === before + 1, 'the request is consumed once');
    h.session.stop();
  }

  // A lost connection is shown as unknown, never as the last known state; then it recovers with backoff.
  {
    const h = setup();
    await h.session.pair(code); await settle();
    check(h.session.getSnapshot().agents[0]!.state === 'question', 'a waiting agent is shown while live');
    h.behavior.listFails = true;
    await h.timer.next();
    const lost = h.session.getSnapshot();
    check(h.session.actionChannel() === null, 'a failed read immediately removes action authority');
    check(lost.phase === 'reconnecting' && lost.error === 'transport_failed' && lost.attempt === 1, 'a failed refresh is reconnecting with a coded error');
    check(lost.agents.length === 1 && lost.agents[0]!.state === 'unknown' && lost.agents[0]!.requestId === undefined, 'the last state is replaced by unknown, never kept');
    check(lost.connection?.online === false && lost.connection.paired === true, 'a lost connection is offline but still paired');
    check(h.transports[0]!.closed >= 1, 'the failed connection is closed at once, not at the next attempt');
    check(h.timer.waiting[0]?.ms === 1000, 'the first retry waits one second');
    h.behavior.listFails = true;
    await h.timer.next();
    check(h.session.getSnapshot().attempt === 2 && (h.timer.waiting[0]?.ms as number | undefined) === 2000, 'the backoff doubles');
    check(h.transports.length === 2 && h.transports[0]!.closed >= 1, 'each attempt uses a fresh transport and the failed one is closed');
    h.behavior.listFails = false;
    await h.timer.next();
    const recovered = h.session.getSnapshot();
    check(recovered.phase === 'live' && recovered.attempt === 0 && recovered.agents[0]!.state === 'question' && recovered.error === undefined, 'a successful read goes live again and resets the backoff');
    h.session.stop();
  }

  // The backoff is capped, and a host that refuses connections never throws out of the loop.
  {
    const h = setup();
    await h.session.pair(code); await settle();
    h.behavior.openFails = true;
    h.behavior.listFails = true;
    const waits: number[] = [];
    for (let i = 0; i < 9; i++) { const ms = await h.timer.next(); if (ms !== undefined) waits.push(ms); }
    check(waits.every(ms => ms <= 30_000) && waits.includes(30_000), 'the backoff is capped at 30 seconds');
    check(h.session.getSnapshot().phase === 'reconnecting' && h.session.getSnapshot().error === 'transport_failed' && !JSON.stringify(h.seen).includes(TOKEN), 'a refusing host leaves the session reconnecting with no secret in any snapshot');
    h.session.stop();
  }

  // Restart from storage; start is idempotent.
  {
    const first = setup();
    await first.session.pair(code); await settle();
    first.session.stop();
    const second = setup({ store: first.memory });
    await Promise.all([second.session.start(), second.session.start()]);
    await settle();
    check(second.session.getSnapshot().phase === 'live' && second.transports.length === 1, 'a stored pairing reconnects on start, and starting twice runs one loop');
    await second.session.start(); await settle();
    check(second.transports.length === 1, 'calling start() again while running does not reconnect');
    second.session.stop();
  }

  // Unpair clears everything and stops polling.
  {
    const h = setup();
    await h.session.pair(code); await settle();
    await h.session.unpair();
    const snapshot = h.session.getSnapshot();
    check(snapshot.phase === 'unpaired' && snapshot.agents.length === 0 && snapshot.host === undefined, 'unpairing empties the session');
    check(h.memory.values.size === 0, 'unpairing removes the stored pairing');
    check(h.transports[0]!.closed >= 1, 'unpairing closes the connection');
    const calls = h.transports[0]!.calls.length;
    await h.timer.next(); await h.timer.next();
    check(h.transports[0]!.calls.length === calls && h.transports.length === 1, 'nothing polls after unpairing');
  }

  // Listeners: unsubscribe works and a throwing listener cannot break the loop.
  {
    const h = setup();
    let calls = 0;
    const off = h.session.subscribe(() => { calls++; });
    h.session.subscribe(() => { throw new Error('listener bug'); });
    await h.session.pair(code); await settle();
    const before = calls;
    check(before > 0 && h.session.getSnapshot().phase === 'live', 'a throwing listener does not stop the session');
    off();
    await h.timer.next();
    check(calls === before, 'an unsubscribed listener is not called again');
    h.session.stop();
    h.session.stop();
    check(true, 'stop() is idempotent');
  }

  // A stopped session must not claim to be live, and start() resumes it.
  {
    const seed = setup();
    await seed.session.pair(code); seed.session.stop();
    const h = setup({ store: seed.memory });
    await h.session.start(); await settle();
    h.session.stop();
    const stopped = h.session.getSnapshot();
    check(stopped.phase === 'stopped' && stopped.agents.every(a => a.state === 'unknown') && stopped.host !== undefined && stopped.connection === undefined, 'a stopped session is not live, keeps no trusted state and has no connection');
    check(h.transports[0]!.closed >= 1, 'stopping closes the connection');
    await h.session.start(); await settle();
    check(h.session.getSnapshot().phase === 'live' && h.transports.length === 2, 'start() after stop reconnects with a fresh transport');
    h.session.stop();
  }

  // A store that cannot be read is coded, leaks nothing, dials nothing, and a retry can still connect.
  {
    const seed = setup();
    await seed.session.pair(code); seed.session.stop();
    const h = setup({ store: seed.memory });
    const originalGet = seed.memory.get.bind(seed.memory);
    seed.memory.get = async () => { throw new Error(`keychain ${TOKEN}`); };
    await h.session.start();
    check(h.session.getSnapshot().phase === 'unpaired' && h.session.getSnapshot().error === 'storage_unavailable', 'an unreadable store leaves the session unpaired with a coded error');
    check(!JSON.stringify(h.seen).includes(TOKEN) && h.transports.length === 0, 'the failure leaks no secret and dials nothing');
    seed.memory.get = originalGet;
    await h.session.start(); await settle();
    check(h.session.getSnapshot().phase === 'live' && (h.transports.length as number) === 1, 'a retry after the store recovers connects');
    h.session.stop();
  }

  // A pairing that cannot be saved is refused and leaves what is running alone.
  {
    const broken = new MemoryStore();
    const h = setup({ store: broken });
    broken.set = async () => { throw new Error(`keychain ${TOKEN}`); };
    check(await h.session.pair(code) === 'storage_unavailable' && h.transports.length === 0, 'a pairing that cannot be saved is refused and nothing is dialed');
    check(h.session.getSnapshot().phase === 'loading' && !JSON.stringify(h.seen).includes(TOKEN), 'a refused pairing leaves the session as it was and leaks nothing');
    h.session.stop();
  }

  // A rejected token or a host whose key changed is not retried: hammering the host cannot fix it, only the user can.
  for (const reason of ['auth_rejected', 'host_mismatch'] as const) {
    {
      // Through start(), as the app does on launch: the memoised start must not swallow the user's retry.
      const seed = setup();
      await seed.session.pair(code); seed.session.stop();
      const h = setup({ store: seed.memory });
      h.behavior.openError = reason;
      await h.session.start(); await settle();
      const snapshot = h.session.getSnapshot();
      check(snapshot.phase === 'stopped' && snapshot.error === reason && snapshot.host !== undefined, `${reason} stops the session with a coded error`);
      check(h.timer.waiting.length === 0 && h.transports.length === 0, `${reason} schedules no retry`);
      check(!JSON.stringify(h.seen).includes(TOKEN), `${reason} leaks no secret`);
      h.behavior.openError = '';
      await h.session.start(); await settle();
      check(h.session.getSnapshot().phase === 'live' && (h.transports.length as number) === 1, `start() tries again after the user acts (${reason})`);
      h.session.stop();
    }
    {
      const h = setup();
      await h.session.pair(code); await settle();
      h.behavior.listFails = true;
      await h.timer.next();
      check(h.session.getSnapshot().phase === 'reconnecting', `a lost connection is retried first (${reason})`);
      h.behavior.openError = reason;
      await h.timer.next();
      const stopped = h.session.getSnapshot();
      check(stopped.phase === 'stopped' && stopped.error === reason && stopped.agents.every(a => a.state === 'unknown'), `${reason} during a reconnect ends the retrying and keeps no trusted state`);
      check(h.timer.waiting.length === 0, `no further retry is scheduled (${reason})`);
    }
  }
  {
    const h = setup();
    h.behavior.openError = 'ECONNREFUSED';
    await h.session.pair(code); await settle();
    check(h.session.getSnapshot().phase === 'reconnecting' && h.session.getSnapshot().error === 'transport_failed', 'any other error code keeps retrying as a plain transport failure');
    h.session.stop();
  }
  // The kind of connection failure is shown, and every kind is transient: the session keeps trying with backoff.
  for (const kind of ['connect_failed', 'handshake_timeout', 'protocol_error'] as const) {
    const h = setup();
    h.behavior.openError = kind;
    await h.session.pair(code); await settle();
    check(h.session.getSnapshot().phase === 'reconnecting' && h.session.getSnapshot().error === kind && h.session.getSnapshot().attempt === 1, `${kind} is reported as it is`);
    check(h.timer.waiting.length === 1 && h.timer.waiting[0]!.ms === 1000, `${kind} is retried with backoff`);
    h.session.stop();
  }

  // resume() is for the OS lifecycle: a session that stopped because the user must act is not restarted by an OS event.
  for (const reason of ['auth_rejected', 'host_mismatch'] as const) {
    const seed = setup();
    await seed.session.pair(code); seed.session.stop();
    const h = setup({ store: seed.memory });
    h.behavior.openError = reason;
    await h.session.start(); await settle();
    check(h.session.getSnapshot().phase === 'stopped' && (h.behavior.attempts as number) === 1, `${reason} stopped the session after one attempt`);
    for (let i = 0; i < 3; i++) await h.session.resume();
    await settle();
    check((h.behavior.attempts as number) === 1 && h.session.getSnapshot().error === reason, `resume() presents nothing again after ${reason}, however often the app comes to the foreground`);
    h.behavior.openError = '';
    await h.session.start(); await settle();
    check(h.session.getSnapshot().phase === 'live' && (h.behavior.attempts as number) === 2, `an explicit start() (the retry button) tries again after ${reason}`);
    h.session.stop();
  }
  {
    // An ordinary stop (the app went to the background) is resumed.
    const h = setup();
    await h.session.pair(code); await settle();
    h.session.stop();
    check(h.session.getSnapshot().phase === 'stopped' && h.session.getSnapshot().error === undefined, 'a background stop carries no error');
    await h.session.resume(); await settle();
    check(h.session.getSnapshot().phase === 'live' && (h.transports.length as number) === 2, 'resume() reconnects after an ordinary stop');
    h.session.stop();
  }
  {
    // So is a pairing that could not be removed: the user's intent to disconnect must not be reversed by the OS.
    const h = setup();
    await h.session.pair(code); await settle();
    h.memory.remove = async () => { throw new Error('keychain'); };
    await h.session.unpair();
    const dialed = h.behavior.attempts;
    await h.session.resume(); await settle();
    check(h.behavior.attempts === dialed && h.session.getSnapshot().phase === 'stopped', 'resume() does not reconnect a pairing the user tried to remove');
  }

  // A desktop that was restarted has a new runtime id; that is the same paired host, not a reason to fail for ever.
  {
    const h = setup();
    await h.session.pair(code); await settle();
    check(h.session.getSnapshot().phase === 'live', 'live on the first runtime');
    h.behavior.runtimeId = 'rt-after-restart';
    h.behavior.listFails = true;
    await h.timer.next();
    h.behavior.listFails = false;
    await h.timer.next();
    const meeting = h.session.getSnapshot();
    check(meeting.phase === 'reconnecting' && meeting.error === 'host_identity_mismatch' && meeting.agents.every(a => a.state === 'unknown'), 'the restarted host is reported once, and nothing from the old runtime is trusted');
    await h.timer.next();
    const back = h.session.getSnapshot();
    check(back.phase === 'live' && back.error === undefined && back.agents[0]?.state === 'question', 'the next attempt pins the new runtime and goes live');
    h.session.stop();
  }

  // unpair(): a start() that races the removal must not reconnect from the value that is still stored.
  {
    const h = setup();
    await h.session.pair(code); await settle();
    h.session.stop();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const originalRemove = h.memory.remove.bind(h.memory);
    h.memory.remove = async (key: string) => { await gate; await originalRemove(key); };
    const unpairing = h.session.unpair();
    const dialed = h.behavior.attempts;
    await h.session.start(); await h.session.resume(); await settle();
    check(h.behavior.attempts === dialed, 'no connection is opened while the pairing is being removed');
    release(); await unpairing; await settle();
    check(h.behavior.attempts === dialed && h.session.getSnapshot().phase === 'unpaired' && h.memory.values.size === 0, 'and the session ends unpaired');
  }

  // pair(): an app that goes to the background while the pairing is being saved does not connect behind the user's back.
  {
    const memory = new MemoryStore();
    const h = setup({ store: memory });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const originalSet = memory.set.bind(memory);
    memory.set = async (key: string, value: string) => { await gate; await originalSet(key, value); };
    const pairing = h.session.pair(code);
    h.session.stop();
    release();
    check(await pairing === 'paired' && memory.values.size === 1, 'the pairing is saved');
    await settle();
    check(h.behavior.attempts === 0, 'but no connection is opened while the app is stopped');
    await h.session.resume(); await settle();
    check(h.session.getSnapshot().phase === 'live' && (h.behavior.attempts as number) === 1, 'it connects when the app comes back');
    h.session.stop();
  }

  // Ending the session during the reconnect backoff must not open another connection.
  {
    const h = setup();
    await h.session.pair(code); await settle();
    h.behavior.listFails = true;
    await h.timer.next();
    check(h.session.getSnapshot().phase === 'reconnecting' && h.timer.waiting.length === 1, 'the session waits to reconnect');
    h.session.stop();
    h.behavior.listFails = false;
    await h.timer.next();
    check(h.transports.length === 1 && h.session.getSnapshot().phase === 'stopped', 'a stop during the backoff opens no new connection');
  }

  // An error that is not one of ours is still reduced to a code.
  {
    const h = setup();
    await h.session.pair(code); await settle();
    h.behavior.nowFails = true;
    await h.timer.next();
    const failed = h.session.getSnapshot();
    check(failed.phase === 'reconnecting' && failed.error === 'transport_failed' && !JSON.stringify(h.seen).includes(TOKEN), 'a foreign error becomes a code and never reaches a snapshot');
    h.behavior.nowFails = false;
    h.session.stop();
  }

  // Re-pairing replaces the old connection.
  {
    const h = setup();
    await h.session.pair(code); await settle();
    const otherKey = b64(new Uint8Array(32).map((_, i) => 100 + i));
    const second = btoa(JSON.stringify({ v: PAIRING_OFFER_VERSION, endpoint: 'ws://10.0.0.9:6768', deviceToken: 'OTHER-TOKEN', publicKeyB64: otherKey }));
    check(await h.session.pair(second) === 'paired', 'a second code pairs');
    await settle();
    check(h.transports[0]!.closed >= 1 && h.transports.length === 2, 'the previous connection is closed and a new one is opened');
    check(h.session.getSnapshot().host?.endpointHost === '10.0.0.9:6768', 'the session now follows the new host');
    const calls = h.transports[0]!.calls.length;
    await h.timer.next(); await h.timer.next();
    check(h.transports[0]!.calls.length === calls, 'the replaced host is never polled again');
    h.session.stop();
  }

  // Unpair reports a store that could not forget the pairing.
  {
    const h = setup();
    await h.session.pair(code); await settle();
    h.memory.remove = async () => { throw new Error(`keychain ${TOKEN}`); };
    check(await h.session.unpair() === 'storage_unavailable', 'unpair reports that the pairing could not be removed');
    check(h.session.getSnapshot().phase === 'stopped' && h.session.getSnapshot().error === 'storage_unavailable', 'the session is stopped, not claiming to be unpaired, when the pairing is still stored');
    check(!JSON.stringify(h.seen).includes(TOKEN), 'no secret in any snapshot');
  }

  // A pairing made while start() is still reading the store wins; the slow read must not connect a second time.
  {
    const memory = new MemoryStore();
    const h = setup({ store: memory });
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const originalGet = memory.get.bind(memory);
    memory.get = async (key: string) => { await gate; return originalGet(key); };
    const starting = h.session.start();
    await h.session.pair(code);
    release?.(); await starting; await settle();
    check(h.transports.length === 1 && h.session.getSnapshot().phase === 'live', 'one connection results when pair() overtakes a slow start()');
    h.session.stop();
  }

  // Stopping while a connect is still waiting must not leave a live connection behind.
  {
    const store = new MemoryStore();
    const transports: FakeTransport[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const session = new LiveSession({
      store: new PairingStore(store),
      openTransport: async () => {
        await gate;
        const transport = new FakeTransport();
        transport.handlers.set('status.get', () => status);
        transport.handlers.set('worktree.ps', () => listing('working'));
        transports.push(transport);
        return transport;
      },
      delay: manualDelay().delay, now: () => clock, refreshMs: 5000,
    });
    await session.pair(code); await settle();
    check(session.getSnapshot().phase === 'connecting', 'the session is connecting while the host has not answered');
    session.stop();
    release?.(); await settle();
    check(transports.length === 1 && transports[0]!.closed >= 1 && transports[0]!.calls.length === 0, 'a transport that arrives after stop is closed and never used');
    check(session.getSnapshot().phase === 'stopped', 'the session stays stopped');
  }

  clearTimeout(watchdog);
  console.log(`PASS: ${count} live session assertions (fake transport and timers; no device, no network)`);
}

void main();
