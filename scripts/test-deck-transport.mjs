import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { verifyUpstreamProfile } from './upstream-profile.mjs';

// Runs Deck's compiled direct transport (the ORIGINAL v2 client framing, vendored byte for byte) against the
// ORIGINAL desktop server channel (src/main/runtime/rpc/e2ee-channel.ts) of the pinned checkout, over real
// WebSockets on loopback. No cryptography is implemented here or in the adapter. Synthetic data only.
const upstream = resolve(process.argv[2] ?? 'vendor/orca');
const profile = verifyUpstreamProfile(upstream);
const built = new URL('../apps/mobile/.test-build/src/adapters/', import.meta.url);
const transportPath = fileURLToPath(new URL('direct-e2ee-transport.js', built));
const clientPath = fileURLToPath(new URL('read-only-orca-client.js', built));
const appSessionPath = fileURLToPath(new URL('app-live-session.js', built));
const offerPath = fileURLToPath(new URL('../upstream/orca-1.4.245/src/shared/mobile-relay-pairing-offer.js', built));
if (!existsSync(transportPath) || !existsSync(clientPath) || !existsSync(appSessionPath) || !existsSync(offerPath)) throw new Error('Compile Deck first: (cd apps/mobile && npm ci --ignore-scripts && npx tsc -p tsconfig.domain.json)');

// The vendored e2ee.ts imports expo-crypto (React Native). Answer that single import with node:crypto.
const Module = createRequire(import.meta.url)('node:module');
const nodeCrypto = createRequire(import.meta.url)('node:crypto');
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'expo-crypto') return { getRandomBytes: length => new Uint8Array(nodeCrypto.randomBytes(length)) };
  return load.call(this, request, ...rest);
};
const pick = module => module.connectDirectTransport || module.ReadOnlyOrcaClient ? module : module.default;
const { connectDirectTransport, DirectTransportError } = pick(await import(pathToFileURL(transportPath).href));
const { ReadOnlyOrcaClient } = pick(await import(pathToFileURL(clientPath).href));
const { createAppLiveSession } = await import(pathToFileURL(appSessionPath).href).then(module => module.createAppLiveSession ? module : module.default);
const { PAIRING_OFFER_VERSION } = await import(pathToFileURL(offerPath).href).then(module => module.PAIRING_OFFER_VERSION ? module : module.default);

// A mobile route allowlist is not a read/write classification: some mobile methods can mutate.
// Execute the two original metadata handlers with a runtime that traps every non-query call.
async function verifyOriginalMetadataReadContracts() {
  const original = async path => {
    const module=await import(pathToFileURL(resolve(upstream,path)).href);
    return module.default??module;
  };
  const [{MOBILE_RPC_METHOD_ALLOWLIST},{TERMINAL_QUERY_METHODS},{CLIENT_UI_METHODS}]=await Promise.all([
    original('src/main/runtime/runtime-rpc/runtime-rpc-mobile-method-allowlist.ts'),
    original('src/main/runtime/rpc/methods/terminal/terminal-query-methods.ts'),
    original('src/main/runtime/rpc/methods/client-ui.ts'),
  ]);
  for(const method of ['terminal.list','ui.get'])assert.ok(MOBILE_RPC_METHOD_ALLOWLIST.has(method),`${method} is in the original mobile routing allowlist`);
  // These are permitted by upstream mobile too; Deck's separate exact read set must continue to exclude them.
  for(const method of ['terminal.send','ui.set'])assert.ok(MOBILE_RPC_METHOD_ALLOWLIST.has(method),'upstream mobile allowance alone is not read-only proof');
  const terminal=TERMINAL_QUERY_METHODS.find(method=>method.name==='terminal.list');
  const ui=CLIENT_UI_METHODS.find(method=>method.name==='ui.get');
  const setUi=CLIENT_UI_METHODS.find(method=>method.name==='ui.set');
  assert.ok(terminal&&ui&&setUi);assert.equal(ui.params,null,'ui.get accepts no mutation payload');
  const reads=[],mutations=[];
  const runtime=new Proxy({}, {get(_target,name){
    if(name==='listTerminals')return (...args)=>{reads.push({name,args});return {terminals:[{handle:'fixture',preview:'fixture-preview'}],totalCount:1,truncated:false};};
    if(name==='getUIState')return ()=>{reads.push({name});return {acknowledgedAgentsByPaneKey:{fixture:123}};};
    return ()=>{mutations.push(String(name));throw new Error('metadata read mutation trap');};
  }});
  const context={runtime,clientKind:'mobile',pairedDeviceParentId:null};
  const params=terminal.params.parse({limit:500,includeVisualLayouts:false,includePreview:false});
  assert.equal(params.worktree,undefined);assert.equal(params.placeUnshownLiveTerminals,undefined,'no placement request can reach the original handler');
  const terminals=await terminal.handler(params,context);
  const uiResult=await ui.handler(undefined,context);
  assert.deepEqual(reads.map(read=>read.name),['listTerminals','getUIState']);assert.deepEqual(mutations,[],'metadata queries invoked no placement or settings mutation');
  assert.equal(reads[0].args[0],undefined);assert.equal(reads[0].args[1],500);assert.equal(reads[0].args[2].includeVisualLayouts,false);
  assert.deepEqual(uiResult.ui.acknowledgedAgentsByPaneKey,{fixture:123});
  if(params.includePreview===false)assert.equal('preview' in terminals.terminals[0],false,'supporting pin suppresses previews at the original handler');
  else assert.equal(terminals.terminals[0].preview,'fixture-preview','unsupported option is not falsely claimed as server-side suppression');
  // Prove the trap is live against the real setter, rather than assuming a method name implies safety.
  assert.throws(()=>setUi.handler({},context),/metadata read mutation trap/);
  assert.deepEqual(mutations,['updateUIState']);
  console.log(`PASS: original mobile routes and metadata handlers ${profile.commit}; no placement/setter calls; real ui.set negative control refused`);
}
await verifyOriginalMetadataReadContracts();

const requireUpstream = createRequire(resolve(upstream, 'package.json'));
const { WebSocketServer } = requireUpstream('ws');
const { generateKeyPair } = await import(pathToFileURL(resolve(upstream, 'src/shared/e2ee-crypto.ts')).href);
const { E2EEChannel } = await import(pathToFileURL(resolve(upstream, 'src/main/runtime/rpc/e2ee-channel.ts')).href);

const GOOD_TOKEN = 'harness-device-token';
const b64 = bytes => Buffer.from(bytes).toString('base64');
const keys = generateKeyPair();
const hostKey = b64(keys.publicKey);
const otherKey = b64(generateKeyPair().publicKey);

const observed = { tokensResolved: [], ready: 0, errors: [], handled: [] };
const behavior = { silent: false, tamperNext: false, closeOnRequest: false, tabsVersion: 1, revoked: false, runtimeId: 'harness-runtime' };
const now = Date.now();
const agentRow = (paneKey, state, extra = {}) => ({ paneKey, parentPaneKey: null, state, agentType: 'claude', taskTitle: `task ${paneKey}`, displayName: null, lastAssistantMessage: 'working on it', interrupted: false, updatedAt: now - 1000, stateStartedAt: now - 5000, ...extra });
const fixtures = {
  'status.get': () => ({ runtimeId: behavior.runtimeId, protocolVersion: 3, minCompatibleMobileVersion: 2, capabilities: [], graphStatus: 'ready' }),
  'worktree.ps': () => ({
    worktrees: [
      { worktreeId: 'repo-1::/tmp/h/one', repoId: 'repo-1', repo: 'orca', displayName: 'one', hostId: 'local', preview: '', agents: [agentRow('agent-0', 'waiting'), agentRow('agent-1', 'done', { mainAgent: { state: 'done', outcome: 'failure', stateStartedAt: now - 4000 } })] },
      { worktreeId: 'repo-2::/tmp/h/two', repoId: 'repo-2', repo: 'dash', displayName: 'two', hostId: 'local', preview: '', agents: [] },
    ],
    totalCount: 2, truncated: false, hostScope: { hostIds: ['local'], omittedHostIds: [] },
  }),
  'terminal.list': params => {
    assert.deepEqual(params,{limit:500,includeVisualLayouts:false,includePreview:false},'original desktop channel receives only metadata catalog options');
    return {terminals:[{handle:'unrepresented-agent',worktreeId:'repo-1::/tmp/h/one',tabId:'orphan-tab',leafId:'leaf',connected:true,orphaned:true,agentIdentity:'claude',title:'Orphan redraw',lastOutputAt:Date.now()}],totalCount:1,truncated:false,hostScope:{hostIds:['local'],omittedHostIds:[]}};
  },
  'ui.get': () => ({ui:{acknowledgedAgentsByPaneKey:{}}}),
  'session.tabs.list': params => ({ worktree: String(params?.worktree ?? '').replace(/^id:/, ''), publicationEpoch: 'harness:epoch-1', snapshotVersion: behavior.tabsVersion, tabs: [{ type: 'terminal', id: 't1', title: 'zsh', status: 'ready', terminal: 'term-1' }] }),
};

const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await once(server, 'listening');
const endpoint = `ws://127.0.0.1:${server.address().port}`;
const sockets = new Set();
server.on('connection', ws => {
  sockets.add(ws);
  const send = ws.send.bind(ws);
  ws.send = (data, ...rest) => {
    if (behavior.tamperNext) {
      behavior.tamperNext = false;
      if (typeof data === 'string') data = data.slice(0, -2) + (data.at(-2) === 'A' ? 'B' : 'A') + data.at(-1);
      else { data = Buffer.from(data); data[data.length - 1] ^= 1; }
    }
    return send(data, ...rest);
  };
  // The desktop's direct wiring (rpc/mobile-socket-wiring.ts): requireV2 is false for direct sockets.
  const channel = new E2EEChannel(ws, {
    serverSecretKey: keys.secretKey,
    transportContext: { transport: 'direct' },
    requireV2: false,
    resolveAuthenticatedDevice: token => {
      observed.tokensResolved.push(token);
      return token === GOOD_TOKEN && !behavior.revoked ? { deviceId: 'harness-device', scope: 'mobile', clientId: token, callerFingerprint: 'harness', credentialRevision: 0, deviceToken: token } : null;
    },
    onReady: (ch) => {
      observed.ready++;
      ch.onMessage((plaintext, reply) => {
        const request = JSON.parse(plaintext);
        observed.handled.push(request.method);
        if (behavior.closeOnRequest) { ws.terminate(); return; }
        if (behavior.silent) return;
        const handler = fixtures[request.method];
        reply(JSON.stringify(handler
          ? { id: request.id, ok: true, result: handler(request.params), _meta: { runtimeId: behavior.runtimeId } }
          : { id: request.id, ok: false, error: { code: 'method_not_found', message: 'no such method' } }));
      });
    },
    onError: (code, reason) => { observed.errors.push([code, reason]); try { ws.close(code, reason); } catch { /* already closed */ } },
  });
  ws.on('message', (data, isBinary) => channel.handleRawMessage(isBinary ? new Uint8Array(data) : data.toString('utf8')));
  ws.on('close', () => { sockets.delete(ws); channel.destroy(); });
});

const open = (overrides = {}) => connectDirectTransport({ endpoint, hostPublicKeyB64: hostKey, deviceToken: GOOD_TOKEN, connectTimeoutMs: 8000, requestTimeoutMs: 4000, ...overrides });
const expectCode = async (promise, code, message) => {
  await assert.rejects(promise, error => error instanceof DirectTransportError && error.code === code, message);
};
const legacy = { process: undefined };
try {
  // 1. Happy path through the real read-only client: status, agents (verdict mapped), tabs (same version accepted).
  {
    const transport = await open();
    const readerCalls=[];
    const readerTransport={request:(method,params)=>{readerCalls.push(method);return transport.request(method,params);}};
    const client = new ReadOnlyOrcaClient({ hostId: 'deck-host', transport:readerTransport, paired: true });
    await client.connect();
    assert.equal(client.runtimeId, 'harness-runtime');
    const agents = await client.listAgents();
    assert.equal(agents.length, 2);
    assert.equal(agents.find(a => a.target.terminalId === 'agent-0').state, 'question');
    assert.equal(agents.find(a => a.target.terminalId === 'agent-1').state, 'failed', 'a failed turn is not done, end to end');
    assert.ok(agents.every(a => a.permissionEvidence === 'missing' && a.requestId === undefined));
    const first = await client.readTabs('repo-1::/tmp/h/one');
    const again = await client.readTabs('repo-1::/tmp/h/one');
    assert.equal(first.snapshot.publication.version, again.snapshot.publication.version);
    behavior.tabsVersion = 2;
    assert.equal((await client.readTabs('repo-1::/tmp/h/one')).snapshot.publication.version, 2);
    behavior.tabsVersion = 1;
    await assert.rejects(client.readTabs('repo-1::/tmp/h/one'), error => error.code === 'stale_tabs_snapshot', 'an older host version is refused');
    const beforeRefusedSend=readerCalls.length,beforeWire=observed.handled.length;
    await assert.rejects(client.send({ kind: 'send_prompt', target: agents[0].target, text: 'x' }), error => error.code === 'writes_disabled');
    assert.equal(readerCalls.length,beforeRefusedSend,'a refused write invokes no transport request, including previously used reads');
    assert.equal(observed.handled.length,beforeWire,'a refused write adds no server-channel request');
    assert.deepEqual([...new Set(observed.handled)].sort(), ['session.tabs.list', 'status.get', 'terminal.list', 'ui.get', 'worktree.ps'], 'only read methods reached the real server channel');
    transport.close();
    behavior.tabsVersion = 1;
  }

  // 2. Concurrency, host errors that do not close the connection, then a clean close.
  {
    const transport = await open();
    const results = await Promise.all(Array.from({ length: 12 }, () => transport.request('status.get')));
    assert.ok(results.every(r => r.runtimeId === 'harness-runtime'));
    await assert.rejects(transport.request('does.not.exist'), error => error.code === 'rpc_error' && error.rpcCode === 'method_not_found');
    assert.equal(transport.state, 'ready', 'a host error reply leaves the connection usable');
    assert.equal((await transport.request('status.get')).graphStatus, 'ready');
    transport.close();
    await expectCode(transport.request('status.get'), 'closed', 'request after close');
  }

  // 3. A wrong token is refused by the real server.
  {
    const before = observed.errors.length;
    await expectCode(open({ deviceToken: 'not-a-paired-token' }), 'auth_rejected', 'wrong token');
    assert.ok(observed.errors.length > before && observed.errors.at(-1)[0] === 4001, 'the real server answered Unauthorized (4001)');
  }

  // 4. Host key pinning: a different key means no handshake and the token never reaches the server.
  {
    const seen = observed.tokensResolved.length;
    // A host whose ready does not match the pinned key is a mismatch, distinct from a rejected token.
    await assert.rejects(open({ hostPublicKeyB64: otherKey }), error => error instanceof DirectTransportError && error.code === 'host_mismatch');
    assert.equal(observed.tokensResolved.length, seen, 'the device token was not sent to a host that failed key pinning');
  }

  // 5. An unanswered unary read is isolated; a terminated socket still rejects what is waiting.
  {
    const transport = await open({ requestTimeoutMs: 400 });
    behavior.silent = true;
    await expectCode(transport.request('status.get'), 'request_timeout', 'silent host');
    behavior.silent = false;
    assert.equal(transport.state, 'ready', 'pure unary-read silence does not end a synchronized channel');
    assert.equal((await transport.request('status.get')).runtimeId, 'harness-runtime', 'the same channel works after an isolated read timeout');
    behavior.closeOnRequest = true;
    await expectCode(transport.request('status.get'), 'closed', 'server terminates the socket');
    behavior.closeOnRequest = false;
    assert.equal(transport.state, 'closed');
  }

  // 6. A corrupted frame is never accepted, and the desynchronized session ends instead of hanging on.
  {
    const transport = await open({ requestTimeoutMs: 500 });
    assert.equal((await transport.request('status.get')).graphStatus, 'ready');
    behavior.tamperNext = true;
    await expectCode(transport.request('status.get'), 'request_timeout', 'the tampered reply is dropped, never parsed');
    assert.equal(transport.state, 'closed', 'the desynchronized session is closed');
    const again = await open({ requestTimeoutMs: 1500 });
    assert.equal((await again.request('status.get')).runtimeId, 'harness-runtime', 'a fresh handshake is unaffected');
    again.close();
  }

  // 7. A legacy-only host (the original mock) is refused: Deck never downgrades.
  {
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = probe.address().port; await new Promise(r => probe.close(r));
    const requireMobile = createRequire(resolve(upstream, 'mobile/package.json'));
    legacy.process = spawn(process.execPath, ['--import', requireMobile.resolve('tsx'), 'scripts/mock-server.ts'], {
      cwd: resolve(upstream, 'mobile'), env: { ...process.env, PORT: String(port), ORCA_BACKGROUND_LAUNCH: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const legacyKey = await new Promise((res, rej) => {
      let out = ''; const timer = setTimeout(() => rej(new Error('mock startup timeout')), 15000);
      legacy.process.stdout.on('data', chunk => { out += chunk; const m = out.match(/Server public key \(base64\): ([A-Za-z0-9+/=]+)/); if (m) { clearTimeout(timer); res(m[1]); } });
    });
    await assert.rejects(connectDirectTransport({ endpoint: `ws://127.0.0.1:${port}`, hostPublicKeyB64: legacyKey, deviceToken: 'mock-device-token', connectTimeoutMs: 3000 }),
      // Refused after the host answered (not a refused connection, not a closed transport): its legacy ready is not v2.
      error => error instanceof DirectTransportError && ['host_mismatch', 'protocol_error', 'handshake_timeout'].includes(error.code), 'a legacy-only host must not be connected');
  }

  // 8. The app's own composition (createAppLiveSession: pairing store + real transport + read-only client) end to end.
  {
    const mem = new Map();
    const store = { get: async key => mem.get(key) ?? null, set: async (key, value) => { mem.set(key, value); }, remove: async key => { mem.delete(key); } };
    const session = createAppLiveSession(store, { refreshMs: 150 });
    const snapshots = [];
    session.subscribe(snapshot => snapshots.push(JSON.stringify(snapshot)));
    const until = async (predicate, label, ms = 10000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) { if (predicate(session.getSnapshot())) return session.getSnapshot(); await new Promise(r => setTimeout(r, 25)); }
      throw new Error(`timed out waiting for ${label}; last phase ${session.getSnapshot().phase} ${session.getSnapshot().error ?? ''}`);
    };
    const codeFor = (key, token = GOOD_TOKEN) => Buffer.from(JSON.stringify({ v: PAIRING_OFFER_VERSION, endpoint, deviceToken: token, publicKeyB64: key })).toString('base64');
    try {
      assert.equal(await session.pair(codeFor(hostKey)), 'paired');
      const live = await until(s => s.phase === 'live', 'live');
      assert.equal(live.agents.length, 2);
      assert.equal(live.agents.find(a => a.target.terminalId === 'agent-0').state, 'question');
      assert.equal(live.agents.find(a => a.target.terminalId === 'agent-1').state, 'failed');
      assert.ok(live.connection.online && live.connection.paired && live.connection.controlsVerified === false, 'online and paired, never controls');
      assert.equal(live.host.endpointHost, endpoint.replace('ws://', ''));

      // The connection drops: the screen must say unknown (never the last state), then recover by itself.
      for (const ws of sockets) ws.terminate();
      const lost = await until(s => s.phase === 'reconnecting', 'reconnecting');
      assert.ok(lost.agents.length === 2 && lost.agents.every(a => a.state === 'unknown'), 'a lost connection shows unknown, not the last state');
      assert.equal(lost.connection.online, false);
      await until(s => s.phase === 'live', 'live again');

      // The desktop is restarted: a new runtime id behind the same key. Reported once, then pinned afresh; never a dead end.
      behavior.runtimeId = 'harness-runtime-after-restart';
      for (const ws of sockets) ws.terminate();
      await until(s => s.phase === 'reconnecting', 'reconnecting after the restart');
      const restarted = await until(s => s.phase === 'live', 'live on the restarted desktop', 25000);
      assert.equal(restarted.agents.length, 2);
      assert.ok(snapshots.some(entry => entry.includes('host_identity_mismatch')), 'the new runtime was reported once on the way');

      // The desktop revokes the device: the session stops after ONE refused attempt instead of hammering the host.
      const before = observed.tokensResolved.length;
      behavior.revoked = true;
      for (const ws of sockets) ws.terminate();
      const stopped = await until(s => s.phase === 'stopped', 'stopped after revocation');
      assert.equal(stopped.error, 'auth_rejected');
      assert.ok(stopped.agents.every(a => a.state === 'unknown'));
      // The app coming back to the foreground, over and over, is an OS event: it must not present the refused token again.
      for (let i = 0; i < 3; i++) await session.resume();
      await new Promise(r => setTimeout(r, 1600));
      assert.equal(observed.tokensResolved.length - before, 1, 'a refused token is presented exactly once, not retried, not even by resume()');
      assert.equal(session.getSnapshot().phase, 'stopped');
      behavior.revoked = false;
      await session.start();
      await until(s => s.phase === 'live', 'live after the user acts');
      assert.equal(await session.unpair(), 'unpaired');
      assert.equal(mem.size, 0);
      assert.equal(session.getSnapshot().phase, 'unpaired');
      // Unpairing closes the real connection: the server sees the socket go.
      const closedBy = Date.now() + 3000;
      while (sockets.size > 0 && Date.now() < closedBy) await new Promise(r => setTimeout(r, 25));
      assert.equal(sockets.size, 0, 'no connection to the host is left after unpairing');

      // A host whose key is not the pinned one: refused as a mismatch and the token is never sent.
      const tokens = observed.tokensResolved.length;
      assert.equal(await session.pair(codeFor(otherKey)), 'paired');
      const mismatch = await until(s => s.phase === 'stopped', 'stopped on a key mismatch');
      assert.equal(mismatch.error, 'host_mismatch');
      assert.equal(observed.tokensResolved.length, tokens, 'the device token did not reach a host with another key');
      session.stop();
      const stoppedBy = Date.now() + 3000;
      while (sockets.size > 0 && Date.now() < stoppedBy) await new Promise(r => setTimeout(r, 25));
      assert.equal(sockets.size, 0, 'no connection to the host is left after stopping');
      assert.ok(!snapshots.join('\n').includes(GOOD_TOKEN) && !snapshots.join('\n').includes(hostKey), 'no snapshot ever held the token or the host key');
    } finally {
      session.stop();
    }
  }

  console.log(`PASS: Deck direct transport over the original desktop E2EE channel ${profile.desktopVersion} (${profile.commit}); v2 handshake, token auth, concurrent reads, host-key pinning, tamper, isolated-read-timeout / unclassified-frame-close, termination, legacy refusal and the app's live session (recovery, revoked token stops, key mismatch)`);
  console.log('LIMIT: loopback with synthetic data and a harness-provided RPC handler; not a paired phone, the operated Relay or a real desktop runtime.');
} finally {
  legacy.process?.kill('SIGTERM');
  for (const ws of sockets) ws.terminate();
  server.close();
}
