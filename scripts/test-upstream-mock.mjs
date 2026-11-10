import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { verifyUpstreamProfile } from './upstream-profile.mjs';

const upstream = resolve(process.argv[2] ?? 'vendor/orca');
const profile = verifyUpstreamProfile(upstream);
const requireMobile = createRequire(resolve(upstream, 'mobile/package.json'));
const nacl = requireMobile('tweetnacl');
const loader = requireMobile.resolve('tsx');
// Use the original mock's crypto helper, never a parallel encryption implementation.
const cryptoModule = await import(pathToFileURL(resolve(upstream, 'mobile/scripts/mock-server-encryption.ts')).href);
const crypto = cryptoModule.default ?? cryptoModule;
const socketProbe = createServer();
socketProbe.listen(0, '127.0.0.1');
await once(socketProbe, 'listening');
const port = socketProbe.address().port;
await new Promise((resolveClose, reject) => socketProbe.close(error => error ? reject(error) : resolveClose()));
const server = spawn(process.execPath, ['--import', loader, 'scripts/mock-server.ts'], {
  cwd: resolve(upstream, 'mobile'),
  env: {...process.env, PORT:String(port), ORCA_BACKGROUND_LAUNCH:'1'},
  stdio: ['ignore', 'pipe', 'pipe'],
});
const sockets = new Set();
let failures = '';
server.stderr.on('data', chunk => { failures += chunk; });

function inbox(socket) {
  const queue = [];
  const waiting = [];
  socket.addEventListener('message', event => {
    const next = waiting.shift();
    if (next) next(String(event.data)); else queue.push(String(event.data));
  });
  return () => queue.length ? Promise.resolve(queue.shift()) : new Promise((res, rej) => {
    const deliver = value => { clearTimeout(timer); res(value); };
    const timer = setTimeout(() => { const i=waiting.indexOf(deliver); if(i>=0) waiting.splice(i,1); rej(new Error('Mock response timeout')); }, 5000);
    waiting.push(deliver);
  });
}

try {
  const publicKey = await new Promise((res, rej) => {
    let output = '';
    const timer = setTimeout(() => rej(new Error('Mock startup timeout')), 15000);
    server.once('error', error => { clearTimeout(timer); rej(error); });
    server.once('exit', code => { clearTimeout(timer); rej(new Error(`Mock exited ${code}: ${failures.slice(0,300)}`)); });
    server.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/Server public key \(base64\): ([A-Za-z0-9+/=]+)/);
      if (match) { clearTimeout(timer); res(match[1]); }
    });
  });
  async function connect(token) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    sockets.add(ws);
    const receive = inbox(ws);
    await new Promise((res, rej) => {
      const timer=setTimeout(() => rej(new Error('Mock connect timeout')),5000);
      ws.addEventListener('open', () => { clearTimeout(timer); res(); }, {once:true});
      ws.addEventListener('error', () => { clearTimeout(timer); rej(new Error('Mock connection failed')); }, {once:true});
    });
    const pair = nacl.box.keyPair();
    const shared = crypto.deriveSharedKey(pair.secretKey, new Uint8Array(Buffer.from(publicKey,'base64')));
    ws.send(JSON.stringify({type:'e2ee_hello',publicKeyB64:Buffer.from(pair.publicKey).toString('base64')}));
    assert.equal(JSON.parse(await receive()).type,'e2ee_ready');
    ws.send(crypto.e2eeEncrypt(JSON.stringify({type:'e2ee_auth',deviceToken:token}),shared));
    const reply = JSON.parse(crypto.e2eeDecrypt(await receive(),shared));
    return {ws,receive,shared,reply};
  }
  const denied = await connect('invalid-synthetic-token');
  assert.equal(denied.reply.error.code,'unauthorized');
  const valid = await connect('mock-device-token');
  assert.equal(valid.reply.type,'e2ee_authenticated');
  for (const method of ['status.get','worktree.ps','session.tabs.list']) {
    const params = method === 'session.tabs.list' ? {worktree:'id:mock-worktree'} : {};
    valid.ws.send(crypto.e2eeEncrypt(JSON.stringify({id:method,method,params,deviceToken:'mock-device-token'}),valid.shared));
    const encrypted = await valid.receive();
    const result = JSON.parse(crypto.e2eeDecrypt(encrypted,valid.shared));
    assert.equal(result.id,method);
    assert.equal(result.ok,true, `${method} must be supported by the pinned mock`);
    if (method === 'session.tabs.list') {
      assert.equal(result.result.worktree, 'mock-worktree');
      assert.ok(Array.isArray(result.result.tabs) && result.result.tabs.length > 0);
    }
    assert.equal(crypto.e2eeDecrypt(encrypted,nacl.randomBytes(32)),null,'wrong key cannot decrypt');
    const tampered=Buffer.from(encrypted,'base64'); tampered[tampered.length-1] ^= 1;
    assert.equal(crypto.e2eeDecrypt(tampered.toString('base64'),valid.shared),null,'tampered response cannot decrypt');
  }
  for (const method of ['worktree.list', 'agentSession.currentRequests']) {
    valid.ws.send(crypto.e2eeEncrypt(JSON.stringify({id:method,method,deviceToken:'mock-device-token'}),valid.shared));
    const unsupported=JSON.parse(crypto.e2eeDecrypt(await valid.receive(),valid.shared));
    assert.equal(unsupported.id,method);
    assert.equal(unsupported.ok,false,`mock must not pretend ${method} is implemented`);
    assert.equal(unsupported.error.code,'method_not_found','distinguish missing mock coverage from auth/transport failure');
  }
  valid.ws.close();
  const reconnect=await connect('mock-device-token');
  assert.equal(reconnect.reply.type,'e2ee_authenticated');
  console.log(`PASS: original upstream mock ${profile.desktopVersion} (${profile.commit}); encrypted auth, bad-token refusal, status/worktree reads, wrong-key/tamper refusal, fresh reconnect`);
  console.log('LIMIT: legacy mock with a loopback client; original listener uses its default bind address, not network isolation or operated Relay/native/v2 deployment proof');
} finally {
  for (const ws of sockets) ws.close();
  if (server.exitCode === null) {
    const stopped=once(server,'exit');
    server.kill('SIGTERM');
    const force=setTimeout(() => server.kill('SIGKILL'),3000);
    await stopped;
    clearTimeout(force);
  }
}
