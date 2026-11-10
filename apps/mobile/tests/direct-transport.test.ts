import {isMethodNotFound} from '../src/adapters/read-only-orca-client';
import { inspect } from 'node:util';
import { connectDirectTransport, DirectTransportError } from '../src/adapters/direct-e2ee-transport';
import type { DirectTransportOptions } from '../src/adapters/direct-e2ee-transport';
import type { createDirectSocketFraming } from '../src/upstream/orca-1.4.245/mobile/src/transport/direct-socket-framing';

// State-machine tests of the transport adapter with an injected framing: no real crypto and no network.
// The cryptographic interop with the original desktop channel is covered by scripts/test-deck-transport.mjs.
type FramingArgs = Parameters<typeof createDirectSocketFraming>[0];

let count = 0;
function check(value: unknown, message: string): asserts value { count++; if (!value) throw new Error(message); }
async function rejects(promise: Promise<unknown>, code: string, message: string): Promise<DirectTransportError> {
  count++;
  try { await promise; } catch (error) {
    if (error instanceof DirectTransportError && error.code === code) return error;
    throw new Error(`${message}: expected ${code}, got ${error instanceof DirectTransportError ? error.code : String(error)}`);
  }
  throw new Error(`${message}: expected rejection ${code}`);
}

const TOKEN = 'SECRET-DEVICE-TOKEN-1234';
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));

class FakeSocket {
  sent: string[] = [];
  closed = 0;
  protected listeners = new Map<string, Array<(event: unknown) => void>>();
  addEventListener(type: string, fn: (event: unknown) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  removeEventListener(type: string, fn: (event: unknown) => void) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter(f => f !== fn)); }
  send(data: string) { this.sent.push(String(data)); }
  close() { this.closed++; }
  emit(type: string, event: unknown = {}) { for (const fn of this.listeners.get(type) ?? []) fn(event); }
}

class StrictSocket extends FakeSocket {
  unhandledErrors = 0;
  close() {
    this.closed++;
    // Like ws: closing while CONNECTING reports an error on the next tick, which throws if nobody listens.
    queueMicrotask(() => { if ((this.listeners.get('error') ?? []).length === 0) this.unhandledErrors++; });
  }
}

class FakeFraming {
  started = 0;
  disposed = 0;
  inbound: unknown[] = [];
  texts: string[] = [];
  ready = false;
  writeThrows = false;
  constructor(readonly args: FramingArgs) {}
  start() { this.started++; }
  handleInbound(raw: unknown) { this.inbound.push(raw); }
  sendText(text: string): boolean {
    if (this.writeThrows) throw new Error(`write failed for ${TOKEN}`);
    if (!this.ready) return false;
    this.texts.push(text);
    return true;
  }
  dispose() { this.disposed++; }
  authenticate() { this.args.events.onReadyAccepted(); this.ready = true; this.args.events.onAuthenticated(); }
}

function setup(extra: Partial<DirectTransportOptions> = {}) {
  const socket = new FakeSocket();
  const framings: FakeFraming[] = [];
  const logs: string[] = [];
  const created: string[] = [];
  const connecting = connectDirectTransport({
    endpoint: 'ws://192.168.0.60:6768',
    hostPublicKeyB64: KEY,
    deviceToken: TOKEN,
    connectTimeoutMs: 200,
    requestTimeoutMs: 200,
    createSocket: (url) => { created.push(url); return socket; },
    createFraming: ((args: FramingArgs) => { const framing = new FakeFraming(args); framings.push(framing); return framing; }) as unknown as typeof createDirectSocketFraming,
    onLog: (level, message) => { logs.push(`${level}: ${message}`); },
    ...extra,
  });
  return { socket, framings, logs, created, connecting, framing: () => framings[0]! };
}
async function ready(extra: Partial<DirectTransportOptions> = {}) {
  const h = setup(extra);
  h.socket.emit('open');
  h.framing().authenticate();
  const transport = await h.connecting;
  return { ...h, transport };
}
const reply = (id: string, body: Record<string, unknown>) => JSON.stringify({ id, ...body });
const lastId = (h: { framing: () => FakeFraming }) => JSON.parse(h.framing().texts.at(-1)!).id as string;
const tick = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const watchdog = setTimeout(() => { throw new Error('direct-transport test timed out'); }, 60_000);

  // Connect: v2 only, the pinned key and the device token reach the framing, nothing else does.
  {
    const h = setup();
    check(h.created[0] === 'ws://192.168.0.60:6768', 'the endpoint from the pairing offer is dialed');
    check(h.framings.length === 0 || h.framing().started === 0, 'the handshake does not start before the socket opens');
    h.socket.emit('open');
    const f = h.framing();
    check(f.started === 1, 'the hello is sent once the socket opens');
    check(f.args.framing === 'v2' && f.args.mayUseLegacy() === false, 'only v2 framing is used and legacy is never allowed');
    check(f.args.serverPublicKeyB64 === KEY && f.args.deviceToken === TOKEN, 'the pinned host key and the token are handed to the original framing');
    f.args.emitLog('info', 'Sent e2ee_hello (v2)', `token ${TOKEN}`);
    check(h.logs.every(line => !line.includes(TOKEN)), 'log details (which may carry secrets) are never forwarded');
    f.authenticate();
    const transport = await h.connecting;
    check(transport.state === 'ready', 'the transport is ready after authentication');
  }

  // Requests are correlated by id, in any order.
  {
    const h = await ready();
    const a = h.transport.request('status.get', {});
    const b = h.transport.request('worktree.ps', { limit: 5 });
    const frames = h.framing().texts.map(text => JSON.parse(text));
    check(frames.length === 2 && frames[0].method === 'status.get' && frames[1].method === 'worktree.ps' && frames[1].params.limit === 5, 'each request is sent as an original wire request');
    check(frames[0].id !== frames[1].id && frames.every(frame => frame.deviceToken === TOKEN), 'ids are unique and the wire request carries the original deviceToken field');
    h.socket.emit('message', { data: 'ignored-by-adapter' });
    check(h.framing().inbound.length === 1 && h.framing().inbound[0] === 'ignored-by-adapter', 'inbound frames go to the original framing untouched');
    h.framing().args.events.onText(reply(frames[1].id, { ok: true, result: { which: 'second' } }));
    h.framing().args.events.onText(reply(frames[0].id, { ok: true, result: { which: 'first' } }));
    check(JSON.stringify(await a) === '{"which":"first"}' && JSON.stringify(await b) === '{"which":"second"}', 'replies resolve their own request whatever the order');
  }

  // Terminal writes must be classified by the original host as input from this phone.
  {
    const h=await ready();
    const pending=h.transport.request('terminal.send',{terminal:'term_fixture',enter:true,client:{id:'spoofed',type:'desktop'}});
    const frame=JSON.parse(h.framing().texts.at(-1)!);
    h.framing().args.events.onText(reply(frame.id,{ok:true,result:{send:{accepted:true}}}));
    await pending;
    check(frame.params.client?.type==='mobile'&&frame.params.client?.id===TOKEN,'terminal input uses the authenticated original mobile client identity');
    check(!JSON.stringify(h.transport).includes(TOKEN),'mobile identity stays inside transport serialization boundary');
    h.transport.close();
  }

  // The input-only native-chat lease is ACKed and released by its exact request id.
  {
    const h=await ready();const opening=h.transport.acquireTerminalInput('term_lease');
    const subscribe=JSON.parse(h.framing().texts.at(-1)!);
    check(subscribe.method==='terminal.subscribe'&&subscribe.params.client.type==='mobile'&&subscribe.params.client.id===TOKEN,'input lease uses authenticated mobile presence');
    check(subscribe.params.capabilities.mobileInputLeaseOnly===1&&subscribe.params.capabilities.terminalBinaryStream===1&&subscribe.params.viewport===undefined,'input-only subscription neither renders output nor resizes the PTY');
    h.framing().args.events.onText(reply(subscribe.id,{ok:true,streaming:true,result:{type:'subscribed',streamId:null,lines:[],truncated:false}}));
    const lease=await opening;check(lease.isActive()&&!JSON.stringify(lease).includes(TOKEN),'ACKed lease is live without exposing subscription credentials');
    const releasing=lease.release();const unsubscribe=JSON.parse(h.framing().texts.at(-1)!);
    check(!lease.isActive()&&unsubscribe.method==='terminal.unsubscribe'&&unsubscribe.params.requestId===subscribe.id,'release immediately invalidates the lease and addresses the exact registration');
    h.framing().args.events.onText(reply(unsubscribe.id,{ok:true,result:{unsubscribed:true}}));await releasing;
    const writes=h.framing().texts.length;await lease.release();check(h.framing().texts.length===writes,'release is idempotent');h.transport.close();
  }
  {
    const h=await ready();const opening=h.transport.acquireTerminalInput('term_lease');const id=lastId(h);
    h.framing().args.events.onText(reply(id,{ok:true,streaming:true,result:{type:'subscribed',streamId:null,lines:[],truncated:false}}));const lease=await opening;
    h.framing().args.events.onText(reply(id,{ok:true,streaming:true,result:{type:'end'}}));check(!lease.isActive(),'host end invalidates the lease before another write');h.transport.close();
  }
  {
    const h=await ready();const opening=h.transport.acquireTerminalInput('term_lease');const id=lastId(h);
    h.framing().args.events.onText(reply(id,{ok:true,result:{type:'subscribed',streamId:null,lines:[],truncated:false}}));
    await rejects(opening,'protocol_error','an ordinary unary reply is not a live input registration');check(h.transport.state==='closed','invalid lease ACK closes potentially orphaned presence');
  }
  {
    const h=await ready();const opening=h.transport.acquireTerminalInput('term_lease');const id=lastId(h);
    h.framing().args.events.onText(reply(id,{ok:true,streaming:true,result:{type:'subscribed',streamId:null,lines:[],truncated:false}}));const lease=await opening;
    const releasing=lease.release();h.framing().args.events.onText(reply(lastId(h),{ok:true,result:{unsubscribed:false}}));await releasing;
    check(!lease.isActive()&&h.transport.state==='closed','uncertain teardown closes the connection instead of leaving mobile ownership behind');
  }

  // One-shot structured snapshots use independent, frame-addressed subscriptions.
  {
    const h=await ready();
    const first=h.transport.readStructuredSnapshot('owned-native');
    const second=h.transport.readStructuredSnapshot('owned-native');
    const [a,b]=h.framing().texts.map(text=>JSON.parse(text));
    check(a.method==='agentSession.subscribe'&&a.params.sessionId==='owned-native'&&a.id!==b.id,'two readers open distinct original structured streams');
    let resolved=false;void first.then(()=>{resolved=true;});
    const snapshot={type:'snapshot',sessionId:'owned-native',page:{sessionId:'owned-native'}};
    h.framing().args.events.onText(reply(a.id,{ok:true,streaming:true,result:snapshot}));
    await tick();const endA=JSON.parse(h.framing().texts.at(-1)!);
    check(!resolved&&endA.method==='agentSession.unsubscribe'&&endA.params.sessionId==='owned-native'&&endA.params.subscriptionId===a.id,'snapshot waits for cleanup of exactly its own frame; no session-wide sweep');
    h.framing().args.events.onText(reply(b.id,{ok:true,streaming:true,result:{...snapshot,fence:2}}));
    await tick();const endB=JSON.parse(h.framing().texts.at(-1)!);
    check(endB.params.subscriptionId===b.id,'concurrent same-session reader keeps its own cleanup identity');
    h.framing().args.events.onText(reply(endB.id,{ok:true,result:{unsubscribed:true}}));
    h.framing().args.events.onText(reply(endA.id,{ok:true,result:{unsubscribed:true}}));
    check((await first as {type:string}).type==='snapshot'&&(await second as {fence:number}).fence===2,'independent snapshots resolve after their own cleanup ACK');
    check(!JSON.stringify(h.transport).includes(TOKEN),'snapshot hook does not expose authentication material');h.transport.close();
  }
  for(const result of [{type:'batch'},{type:'end'},{type:'snapshot'}]){
    const h=await ready();const pending=h.transport.readStructuredSnapshot('owned-native');
    h.framing().args.events.onText(reply(lastId(h),{ok:true,streaming:result.type!=='snapshot',result}));
    await rejects(pending,'protocol_error','only an original streaming opening snapshot is accepted');
    check(h.transport.state==='closed','invalid opening stream closes uncertain subscriptions');
  }
  {
    const h=await ready();const pending=h.transport.readStructuredSnapshot('owned-native');
    h.framing().args.events.onText(reply(lastId(h),{ok:true,streaming:true,result:{type:'snapshot'}}));await tick();
    h.framing().args.events.onText(reply(lastId(h),{ok:true,result:{unsubscribed:false}}));
    await rejects(pending,'closed','uncertain structured cleanup never publishes a usable snapshot');
    check(h.transport.state==='closed','uncertain structured cleanup closes the connection');
  }

  {
    const h=await ready();const pending=h.transport.readStructuredSnapshot('owned-native');
    h.framing().args.events.onText(reply(lastId(h),{ok:true,streaming:true,result:{type:'snapshot'}}));h.socket.emit('close');
    await rejects(pending,'closed','connection loss before exact cleanup cannot publish a snapshot');
  }

  // Replies that are not for us are ignored; error replies are classified.
  {
    const h = await ready();
    const pending = h.transport.request('status.get');
    const id = lastId(h);
    h.framing().args.events.onText('not json');
    h.framing().args.events.onText(JSON.stringify([1, 2]));
    h.framing().args.events.onText(reply('someone-else', { ok: true, result: 1 }));
    h.framing().args.events.onText(reply('someone-else',{ok:false,error:{code:'method_not_found'}}));
    h.framing().args.events.onText(JSON.stringify({ type: 'stream', id }));
    h.framing().args.events.onBinary(new Uint8Array([1, 2, 3]));
    h.framing().args.events.onText(reply(id, { ok: false, error: { code: 'method_not_found', message: 'secret detail ' + TOKEN } }));
    const error = await rejects(pending, 'rpc_error', 'an error reply');
    check(error.rpcCode === 'method_not_found', 'the host error code is kept');
    check(isMethodNotFound(error),'only the correlated typed admission error is recognized');
    check(!isMethodNotFound({code:'rpc_error',rpcCode:'method_not_found'})&&!isMethodNotFound(new DirectTransportError('rpc_error','-32601'))&&!isMethodNotFound(new DirectTransportError('rpc_error','forbidden'))&&!isMethodNotFound(new DirectTransportError('request_timeout','method_not_found')),'lookalikes, numeric codes, forbidden and timeouts are not admission proof');
    check(!error.message.includes(TOKEN) && !JSON.stringify(error).includes(TOKEN) && error.message === 'rpc_error', 'host error text is never copied into the error');
    const odd = h.transport.request('status.get');
    h.framing().args.events.onText(reply(lastId(h), { result: 1 }));
    await rejects(odd, 'protocol_error', 'a reply without ok');
    check(h.transport.state === 'ready', 'one malformed reply does not close the connection');
  }

  // A delivered frame with no original-decoder callback is not pure request silence.
  {
    const h=await ready({requestTimeoutMs:30});
    const pending=h.transport.request('status.get');
    h.socket.emit('message',{data:'opaque unclassified frame'});
    h.socket.emit('message',{data:'opaque unrelated accepted frame'});
    h.framing().args.events.onText(reply('unrelated-retired-id',{ok:true,result:{}}));
    await rejects(pending,'request_timeout','unclassified inbound frame never resolves the read');
    check(h.transport.state==='closed'&&h.socket.closed>0,'a decoder-dropped/desynchronized frame retains conservative close on deadline');
  }
  // Authenticated unknown-id text and binary frames still consume the original decoder observation.
  {
    const h=await ready({requestTimeoutMs:30});
    const pending=h.transport.request('accounts.list');
    h.socket.emit('message',{data:'opaque accepted text frame'});
    h.framing().args.events.onText(reply('retired-id',{ok:true,result:{}}));
    h.socket.emit('message',{data:new Uint8Array([1])});
    h.framing().args.events.onBinary(new Uint8Array([2]));
    await rejects(pending,'request_timeout','an unanswered unary read remains isolated beside unrelated accepted frames');
    check(h.transport.state==='ready'&&h.socket.closed===0,'accepted callbacks keep a synchronized channel reusable');h.transport.close();
  }

  // An optional slow read expires alone; late replies still pass through the unchanged framing.
  {
    const h=await ready({requestTimeoutMs:30});
    const slow=h.transport.request('accounts.list',{refreshUsage:true}),slowId=lastId(h);
    const other=h.transport.request('worktree.ps'),otherId=lastId(h);
    h.framing().args.events.onText(reply(otherId,{ok:true,result:{rows:'fresh'}}));
    check((await other as {rows:string}).rows==='fresh','tab reads complete beside a slow usage refresh');
    await rejects(slow,'request_timeout','only the optional read expires');
    check(h.transport.state==='ready'&&h.socket.closed===0&&h.framing().disposed===0,'read timeout retains the authenticated connection');
    h.framing().args.events.onText(reply(slowId,{ok:true,result:{late:true}}));
    const next=h.transport.request('status.get');h.framing().args.events.onText(reply(lastId(h),{ok:true,result:7}));
    check(await next===7,'a late timed-out reply cannot consume another request');h.transport.close();
  }

  // Connect failures.
  {
    const h = setup();
    h.socket.emit('open');
    h.framing().args.events.onReadyAccepted();
    h.framing().args.events.onAuthRejected();
    await rejects(h.connecting, 'auth_rejected', 'rejected token');
    check(h.socket.closed >= 1 && h.framing().disposed >= 1, 'a rejected connection closes the socket and the framing');
  }
  {
    // The host answered but its ready did not match the pinned key: that is not a rejected token.
    const h = setup();
    h.socket.emit('open');
    h.framing().args.events.onAuthRejected();
    await rejects(h.connecting, 'host_mismatch', 'a host that does not match the pinned key');
  }
  {
    const h = setup({ connectTimeoutMs: 30 });
    h.socket.emit('open');
    await rejects(h.connecting, 'handshake_timeout', 'a host that never answers');
    check(h.socket.closed >= 1, 'the socket is closed after a handshake timeout');
  }
  {
    const h = setup();
    h.socket.emit('error', { message: `connect ECONNREFUSED ${TOKEN}` });
    const error = await rejects(h.connecting, 'connect_failed', 'socket error before open');
    check(!JSON.stringify(error).includes(TOKEN) && error.message === 'connect_failed', 'socket error text is not exposed');
  }
  {
    const h = setup();
    h.socket.emit('close', { code: 1006 });
    await rejects(h.connecting, 'connect_failed', 'closed before ready');
  }
  {
    const h = setup();
    h.socket.emit('open');
    h.framing().args.events.onProtocolError(new Error('v2 hello refused'));
    await rejects(h.connecting, 'protocol_error', 'protocol error during the handshake');
  }
  {
    const throwing = connectDirectTransport({
      endpoint: 'ws://192.168.0.60:6768', hostPublicKeyB64: KEY, deviceToken: TOKEN,
      createSocket: () => { throw new Error(`cannot open ws://192.168.0.60:6768 with ${TOKEN}`); },
    });
    const error = await rejects(throwing, 'connect_failed', 'socket factory throwing');
    check(!JSON.stringify(error).includes(TOKEN) && !String(error.stack).includes(TOKEN), 'the original message and token are not kept');
  }
  for (const endpoint of ['http://192.168.0.60:6768', 'not a url', 'ws://user:pw@host:6768', 'ws://host:6768/#frag', 'ws://host:6768/?token=abc']) {
    const created: string[] = [];
    await rejects(connectDirectTransport({ endpoint, hostPublicKeyB64: KEY, deviceToken: TOKEN, createSocket: (url) => { created.push(url); return new FakeSocket(); } }), 'connect_failed', `endpoint ${endpoint}`);
    check(created.length === 0, `no socket is created for ${endpoint}`);
  }

  // Failures after ready reject everything in flight, then everything.
  {
    const h = await ready();
    const first = h.transport.request('status.get');
    const second = h.transport.request('worktree.ps');
    h.framing().args.events.onProtocolError(new Error('bad frame'));
    await rejects(first, 'protocol_error', 'in-flight request on protocol error');
    await rejects(second, 'protocol_error', 'second in-flight request');
    check(h.transport.state === 'closed' && h.socket.closed >= 1 && h.framing().disposed >= 1, 'a protocol error closes the transport');
    await rejects(h.transport.request('status.get'), 'closed', 'request after close');
  }
  {
    const h = await ready();
    const pending = h.transport.request('status.get');
    h.socket.emit('close', { code: 1006 });
    await rejects(pending, 'closed', 'host closed the socket');
    check(h.transport.state === 'closed', 'a socket close ends the transport');
  }
  {
    const h = await ready();
    const pending = h.transport.request('status.get');
    h.transport.close();
    h.transport.close();
    await rejects(pending, 'closed', 'local close');
    check(h.socket.closed === 1 && h.framing().disposed === 1, 'close() is idempotent and releases the socket once');
  }
  {
    const h = await ready({ maxReplyChars: 64 });
    const pending = h.transport.request('status.get');
    h.framing().args.events.onText(reply(lastId(h), { ok: true, result: 'x'.repeat(200) }));
    await rejects(pending, 'protocol_error', 'an oversized reply');
    check(h.transport.state === 'closed', 'an oversized reply closes the transport');
  }
  {
    const h = await ready();
    h.framing().ready = false;
    await rejects(h.transport.request('status.get'), 'not_connected', 'framing that is not ready');
    check(h.transport.state === 'ready', 'a not-ready framing is reported without closing');
    h.framing().ready = true;
    h.framing().writeThrows = true;
    const failure = await rejects(h.transport.request('status.get'), 'protocol_error', 'a failed socket write');
    check(!JSON.stringify(failure).includes(TOKEN) && failure.message === 'protocol_error', 'write error text is not exposed');
    check((h.transport as { state: string }).state === 'closed', 'a failed write closes the transport');
  }

  // The secrets are not properties of the object: serializing or inspecting a transport must not reveal them.
  {
    const h = await ready();
    const shown = `${JSON.stringify(h.transport)} ${inspect(h.transport, { depth: 6, showHidden: true })} ${Object.getOwnPropertyNames(h.transport).join()}`;
    check(!shown.includes(TOKEN) && !shown.includes(KEY), 'neither the device token nor the host key can be read off a transport');
  }

  // A throwing framing factory or socket is reduced to a code, releases the socket, and leaks no key material.
  {
    const socket = new FakeSocket();
    const failing = connectDirectTransport({
      endpoint: 'ws://192.168.0.60:6768', hostPublicKeyB64: KEY, deviceToken: TOKEN, connectTimeoutMs: 60_000,
      createSocket: () => socket,
      createFraming: (() => { throw new Error(`Invalid public key: expected 32 bytes from "${KEY.slice(0, 20)}..." ${TOKEN}`); }) as unknown as typeof createDirectSocketFraming,
    });
    const error = await rejects(failing, 'connect_failed', 'a framing factory that throws');
    check(socket.closed === 1 && error.message === 'connect_failed' && !JSON.stringify(error).includes(TOKEN) && !String(error.stack).includes(KEY.slice(0, 20)), 'the socket is released and no key material is kept');
  }
  {
    const socket = new FakeSocket();
    socket.addEventListener = () => { throw new Error(`no listeners for ${TOKEN}`); };
    const error = await rejects(connectDirectTransport({
      endpoint: 'ws://192.168.0.60:6768', hostPublicKeyB64: KEY, deviceToken: TOKEN, connectTimeoutMs: 60_000, createSocket: () => socket,
    }), 'connect_failed', 'a socket that cannot take listeners');
    check(socket.closed === 1 && !JSON.stringify(error).includes(TOKEN), 'such a socket is closed and nothing leaks');
  }
  for (const key of ['AAAA', '', 'not base64!', btoa('x'.repeat(31)), btoa('x'.repeat(33))]) {
    const created: string[] = [];
    await rejects(connectDirectTransport({ endpoint: 'ws://192.168.0.60:6768', hostPublicKeyB64: key, deviceToken: TOKEN, createSocket: (url) => { created.push(url); return new FakeSocket(); } }), 'connect_failed', `host key ${JSON.stringify(key)}`);
    check(created.length === 0, 'a pinned key that is not 32 bytes is refused before any socket is opened');
  }

  // Frames are bounded before they reach the framing: nothing is buffered without limit, before or after authentication.
  {
    const h = setup();
    h.socket.emit('open');
    h.socket.emit('message', { data: 'x'.repeat(70_000) });
    await rejects(h.connecting, 'protocol_error', 'a huge frame before authentication');
    check(h.framing().inbound.length === 0 && h.socket.closed === 1, 'the frame never reached the framing and the socket was closed');
  }
  {
    const h = await ready({ maxReplyChars: 64 });
    const pending = h.transport.request('status.get');
    h.socket.emit('message', { data: 'y'.repeat(70_000) });
    await rejects(pending, 'protocol_error', 'a huge frame after authentication');
    check((h.transport as { state: string }).state === 'closed' && h.framing().inbound.length === 0, 'an oversized frame closes the transport before it is parsed');
  }
  {
    const h = await ready({ maxReplyChars: 64 });
    const pending = h.transport.request('status.get');
    h.socket.emit('message', { data: { byteLength: 5_000_000 } });
    await rejects(pending, 'protocol_error', 'a huge binary frame');
    const other = await ready({ maxReplyChars: 64 });
    const second = other.transport.request('status.get');
    other.socket.emit('message', { data: { size: 5_000_000 } });
    await rejects(second, 'protocol_error', 'a huge blob frame');
    const fine = await ready({ maxReplyChars: 64 });
    fine.socket.emit('message', { data: 'z'.repeat(1_000) });
    check(fine.framing().inbound.length === 1 && (fine.transport as { state: string }).state === 'ready', 'a frame within the limit still passes');
  }

  // A socket without removeEventListener must not restart the handshake after the transport ended.
  {
    const h = setup();
    (h.socket as { removeEventListener?: unknown }).removeEventListener = undefined;
    h.socket.emit('open');
    h.framing().authenticate();
    const transport = await h.connecting;
    transport.close();
    h.socket.emit('open');
    h.socket.emit('message', { data: 'late' });
    check(h.framing().started === 1 && h.framing().inbound.length === 0, 'events after close do not reach the framing again');
    h.framing().args.events.onAuthenticated();
    check(transport.state === 'closed', 'a late authentication cannot revive a closed transport');
  }

  // Closing during CONNECTING makes some sockets (Node's ws) emit a late 'error'; an EventEmitter with no listener throws.
  {
    const socket = new StrictSocket();
    const failing = connectDirectTransport({
      endpoint: 'ws://192.168.0.60:6768', hostPublicKeyB64: KEY, deviceToken: TOKEN, connectTimeoutMs: 30,
      createSocket: () => socket,
      createFraming: ((args: FramingArgs) => new FakeFraming(args)) as unknown as typeof createDirectSocketFraming,
    });
    await rejects(failing, 'connect_failed', 'a connect that times out before the socket opens');
    await tick();
    check(socket.closed === 1 && socket.unhandledErrors === 0, 'a late error from the closing socket has a listener and cannot crash the app');
  }

  // An error event after ready ends the transport; a duplicate reply is ignored and settles nothing twice.
  {
    const h = await ready();
    const pending = h.transport.request('status.get');
    h.socket.emit('error', { message: `network down ${TOKEN}` });
    const error = await rejects(pending, 'closed', 'a socket error after ready');
    check(h.transport.state === 'closed' && !JSON.stringify(error).includes(TOKEN), 'it closes the transport and exposes no text');
  }
  {
    const h = await ready();
    const pending = h.transport.request('status.get');
    const id = lastId(h);
    h.framing().args.events.onText(reply(id, { ok: true, result: 'first' }));
    h.framing().args.events.onText(reply(id, { ok: true, result: 'second' }));
    h.framing().args.events.onText(reply(id, { ok: false, error: { code: 'late' } }));
    check(await pending === 'first' && h.transport.state === 'ready', 'only the first reply to an id counts, and the connection stays usable');
  }

  // Timeouts that are not positive finite numbers fall back to the defaults instead of firing at once.
  for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const h = await ready({ requestTimeoutMs: bad });
    const pending = h.transport.request('status.get');
    await tick(40);
    check((h.transport as { state: string }).state === 'ready', `a request timeout of ${bad} does not fire at once`);
    h.framing().args.events.onText(reply(lastId(h), { ok: true, result: 1 }));
    check(await pending === 1, `the request still completes with a timeout of ${bad}`);
  }

  clearTimeout(watchdog);
  console.log(`PASS: ${count} direct transport assertions (injected framing; no crypto and no network)`);
}

void main();
