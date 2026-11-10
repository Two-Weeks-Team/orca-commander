import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { verifyUpstreamProfile } from './upstream-profile.mjs';

// Runs Deck's compiled read-only client over the ORIGINAL mock server and the ORIGINAL
// E2EE helper (no parallel crypto). Synthetic data only; loopback only; no operated Relay.
const upstream = resolve(process.argv[2] ?? 'vendor/orca');
const profile = verifyUpstreamProfile(upstream);
const clientPath = fileURLToPath(new URL('../apps/mobile/.test-build/src/adapters/read-only-orca-client.js', import.meta.url));
const policyPath = fileURLToPath(new URL('../apps/mobile/.test-build/src/core/policy.js', import.meta.url));
if (!existsSync(clientPath) || !existsSync(policyPath)) {
  throw new Error('Compile Deck first: (cd apps/mobile && npm install && npx tsc -p tsconfig.domain.json)');
}
const clientModule = await import(pathToFileURL(clientPath).href);
const { ReadOnlyOrcaClient, ReadOnlyClientError } = clientModule.ReadOnlyOrcaClient ? clientModule : clientModule.default;
const policyModule = await import(pathToFileURL(policyPath).href);
const { checkCommand } = policyModule.checkCommand ? policyModule : policyModule.default;

const requireMobile = createRequire(resolve(upstream, 'mobile/package.json'));
const nacl = requireMobile('tweetnacl');
const loader = requireMobile.resolve('tsx');
const cryptoModule = await import(pathToFileURL(resolve(upstream, 'mobile/scripts/mock-server-encryption.ts')).href);
const crypto = cryptoModule.default ?? cryptoModule;

const socketProbe = createServer();
socketProbe.listen(0, '127.0.0.1');
await once(socketProbe, 'listening');
const port = socketProbe.address().port;
await new Promise((res, rej) => socketProbe.close(error => error ? rej(error) : res()));
const server = spawn(process.execPath, ['--import', loader, 'scripts/mock-server.ts'], {
  cwd: resolve(upstream, 'mobile'),
  env: { ...process.env, PORT: String(port), ORCA_BACKGROUND_LAUNCH: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let failures = '';
server.stderr.on('data', chunk => { failures += chunk; });
const sockets = new Set();

function inbox(socket) {
  const queue = [];
  const waiting = [];
  socket.addEventListener('message', event => {
    const next = waiting.shift();
    if (next) next(String(event.data)); else queue.push(String(event.data));
  });
  return () => queue.length ? Promise.resolve(queue.shift()) : new Promise((res, rej) => {
    const deliver = value => { clearTimeout(timer); res(value); };
    const timer = setTimeout(() => { const i = waiting.indexOf(deliver); if (i >= 0) waiting.splice(i, 1); rej(new Error('Mock response timeout')); }, 5000);
    waiting.push(deliver);
  });
}

try {
  const publicKey = await new Promise((res, rej) => {
    let output = '';
    const timer = setTimeout(() => rej(new Error('Mock startup timeout')), 15000);
    server.once('exit', code => { clearTimeout(timer); rej(new Error(`Mock exited ${code}: ${failures.slice(0, 300)}`)); });
    server.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/Server public key \(base64\): ([A-Za-z0-9+/=]+)/);
      if (match) { clearTimeout(timer); res(match[1]); }
    });
  });

  // One authenticated, encrypted socket shared by every request of one Deck client.
  const token = 'mock-device-token';
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  sockets.add(ws);
  const receive = inbox(ws);
  await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('Mock connect timeout')), 5000);
    ws.addEventListener('open', () => { clearTimeout(timer); res(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); rej(new Error('Mock connection failed')); }, { once: true });
  });
  const pair = nacl.box.keyPair();
  const shared = crypto.deriveSharedKey(pair.secretKey, new Uint8Array(Buffer.from(publicKey, 'base64')));
  ws.send(JSON.stringify({ type: 'e2ee_hello', publicKeyB64: Buffer.from(pair.publicKey).toString('base64') }));
  assert.equal(JSON.parse(await receive()).type, 'e2ee_ready');
  ws.send(crypto.e2eeEncrypt(JSON.stringify({ type: 'e2ee_auth', deviceToken: token }), shared));
  assert.equal(JSON.parse(crypto.e2eeDecrypt(await receive(), shared)).type, 'e2ee_authenticated');

  let sequence = 0;
  const methods = [];
  const requests = [];
  const successfulReads = new Set();
  const transport = {
    async request(method, params = {}) {
      methods.push(method);
      requests.push({method,params});
      const id = `${method}-${++sequence}`;
      ws.send(crypto.e2eeEncrypt(JSON.stringify({ id, method, params, deviceToken: token }), shared));
      const reply = JSON.parse(crypto.e2eeDecrypt(await receive(), shared));
      assert.equal(reply.id, id, 'responses are matched by id');
      if (!reply.ok) throw new Error(reply.error?.code ?? 'rpc_error');
      successfulReads.add(method);
      return reply.result;
    },
  };

  const client = new ReadOnlyOrcaClient({ hostId: 'deck-host-1', transport });
  await client.connect();
  assert.equal(client.runtimeId, 'mock-runtime', 'host runtime identity comes from status.get');
  assert.equal(client.getState().generation, 1);

  const agents = await client.listAgents();
  assert.ok(agents.length >= 1, 'the original mock lists at least one agent');
  for (const agent of agents) {
    assert.equal(agent.permissionEvidence, 'missing', 'worktree.ps never yields structured permission proof');
    assert.equal(agent.requestId, undefined);
    assert.equal(agent.target.hostId, 'deck-host-1');
    assert.equal(agent.target.connectionGeneration, 1);
    assert.ok(agent.target.terminalId, 'each agent is bound to its pane');
  }
  assert.ok(agents.some(agent => agent.provider === 'claude'), 'provider is read from the original agentType');
  assert.equal(client.getState().phase, 'ready');
  assert.equal(client.getState().revision, 1);

  const connection = client.connectionState();
  const agent = agents[0];
  const verdict = checkCommand({ kind: 'send_prompt', target: agent.target, text: 'go' }, agent, connection, Date.now(), { hostId: 'deck-host-1', generation: 1 });
  assert.equal(verdict.allowed, false, 'reading does not enable writes');

  // The host re-sends the same publication when nothing changed; that must not be an error.
  const first = await client.readTabs('mock-worktree');
  assert.ok(first.snapshot.publication.epoch.length > 0 && Number.isSafeInteger(first.snapshot.publication.version));
  assert.ok(first.snapshot.tabs.length > 0 && first.snapshot.tabs.some(tab => tab.terminal));
  assert.equal(first.snapshot.published, true, 'the mock publishes a real epoch');
  assert.equal(first.snapshot.complete, true);
  const again = await client.readTabs('mock-worktree');
  assert.equal(again.snapshot.publication.epoch, first.snapshot.publication.epoch);
  assert.equal(again.snapshot.publication.version, first.snapshot.publication.version);
  assert.equal(again.epochChanged, false);

  const before = methods.length;
  await assert.rejects(client.send({ kind: 'send_prompt', target: agent.target, text: 'hi' }), error => error instanceof ReadOnlyClientError && error.code === 'writes_disabled');
  assert.equal(methods.length, before, 'a refused write never reaches the encrypted channel');
  assert.deepEqual([...new Set(methods)].sort(), ['session.tabs.list', 'status.get', 'terminal.list', 'ui.get', 'worktree.ps'], 'only the verified read methods were used');

  assert.deepEqual(requests.find(r => r.method === 'terminal.list')?.params,
    {limit:500,includeVisualLayouts:false,includePreview:false}, 'supplementary catalog never requests terminal output or visual layouts');
  assert.deepEqual(requests.find(r => r.method === 'ui.get')?.params, {}, 'dashboard acknowledgments use the original read-only UI projection');

  assert.ok(successfulReads.has('terminal.list') && successfulReads.has('ui.get'), 'the original mock accepted both supplementary read methods');

  await client.disconnect();
  assert.ok(client.getState().agents.every(a => a.state === 'unknown' && a.requestId === undefined), 'disconnect makes every agent unknown');
  await assert.rejects(client.listAgents(), error => error instanceof ReadOnlyClientError && error.code === 'not_connected');

  console.log(`PASS: Deck read-only client over the original mock ${profile.desktopVersion} (${profile.commit}); encrypted status/worktree/tabs reads normalized; metadata-only catalog/UI reads accepted, same-version re-read accepted, writes refused, disconnect fails closed`);
  console.log('LIMIT: legacy mock, loopback, synthetic data; not a real host, pairing, operated Relay or device. The legacy mock omits full dashboard membership/acknowledgment evidence and structured permission requests; incomplete metadata never proves absence.');
} finally {
  for (const ws of sockets) ws.close();
  if (server.exitCode === null) {
    const stopped = once(server, 'exit');
    server.kill('SIGTERM');
    const force = setTimeout(() => server.kill('SIGKILL'), 3000);
    await stopped;
    clearTimeout(force);
  }
}
