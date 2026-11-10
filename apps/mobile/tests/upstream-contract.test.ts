import { inspectPairingCode, inspectProtocolVersion, isSupportedReadProbe, G0_READINESS } from '../src/adapters/upstream-contract';
import { relayConnectWebSocketUrl } from '../src/upstream/orca/mobile/src/transport/mobile-relay-connect-url';
import { encodeBase64Bytes, decodeCanonicalBase64Bytes } from '../src/upstream/orca/mobile/src/transport/base64-byte-codec';
import { MOBILE_RPC_METHOD_ALLOWLIST } from '../src/upstream/orca/src/main/runtime/runtime-rpc/runtime-rpc-mobile-method-allowlist';
import { UnimplementedOrcaClient } from '../src/adapters/orca-client';
import { MOBILE_RPC_METHOD_ALLOWLIST as INSTALLED_ALLOWLIST } from '../src/upstream/orca-1.4.245/src/main/runtime/runtime-rpc/runtime-rpc-mobile-method-allowlist';

let assertions = 0;
function check(value: unknown, name: string): asserts value { assertions++; if (!value) throw new Error(name); }
const now = Date.parse('2026-11-02T00:00:00Z');
const key = btoa('k'.repeat(32));
const offer = { v: 2, endpoint: 'ws://127.0.0.1:6768', deviceToken: 'synthetic-only-token', publicKeyB64: key, scope: 'mobile' };
const encode = (value: unknown) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
check(inspectPairingCode(encode(offer), now)?.endpoint === offer.endpoint, 'original pairing schema accepts valid LAN fixture');
for (const patch of [ {v:1}, {deviceToken:''}, {publicKeyB64:'invalid'}, {publicKeyB64:btoa('k'.repeat(31))}, {scope:'runtime'}, {endpoint:'https://example.test'}, {endpoint:'ws://name:password@example.test'}, {endpoint:'ws://example.test/#secret'} ]) {
  check(inspectPairingCode(encode({...offer,...patch}), now) === null, 'invalid pairing rejected');
}
for (const raw of ['', '!', 'A', ' '.repeat(132100), btoa('not json')]) check(inspectPairingCode(raw, now) === null, 'malformed input refused');
check(inspectPairingCode(encode(offer), NaN) === null, 'invalid clock refused');
const relay = {v:1,directorUrl:'https://director.example.test',cellUrl:'https://cell.example.test',assignmentEpoch:1,relayHostId:'h'.repeat(16),inviteToken:'i'.repeat(43),inviteExpiresAt:now+60000,e2eeFraming:2};
check(inspectPairingCode(encode({...offer,relay}), now)?.relay?.e2eeFraming === 2, 'relay fixture accepted');
for (const patch of [{inviteExpiresAt:now}, {inviteExpiresAt:now+631000}, {directorUrl:'http://example.test'}, {cellUrl:'https://cell.example.test/path'}, {e2eeFraming:1}, {assignmentEpoch:-1}]) {
 check(inspectPairingCode(encode({...offer,relay:{...relay,...patch}}), now) === null,'invalid relay refused');
}
check(inspectProtocolVersion(2,2).kind === 'ok','supported older desktop');
check(inspectProtocolVersion(3,3).kind === 'ok','current protocol');
check(inspectProtocolVersion(1,2).kind === 'blocked','old desktop blocked');
check(inspectProtocolVersion(3,4).kind === 'blocked','old mobile blocked');
for (const value of [undefined,null,NaN,Infinity,-1,2.5,'3']) {
 check(inspectProtocolVersion(value,2).kind === 'blocked','invalid desktop metadata');
 check(inspectProtocolVersion(3,value).kind === 'blocked','invalid minimum metadata');
}
for (const method of ['status.get','worktree.ps','session.tabs.list']) {
 check(isSupportedReadProbe(method),'read probe supported by both known releases');
 check(MOBILE_RPC_METHOD_ALLOWLIST.has(method) && INSTALLED_ALLOWLIST.has(method),'both original source contracts admit probe');
}
check(MOBILE_RPC_METHOD_ALLOWLIST.has('worktree.list'),'initial contract pin remains intact');
check(!INSTALLED_ALLOWLIST.has('worktree.list'),'installed contract excludes worktree.list');
check(INSTALLED_ALLOWLIST.has('agentSession.currentRequests'),'allowlisting alone does not prove usable request contract');
for (const method of ['agentSession.currentRequests','worktree.list','terminal.send','agentSession.respondToApproval','agentSession.respondToQuestion','git.push','orchestration.ask','unknown']) check(!isSupportedReadProbe(method),'parameterized/version-specific methods, writes and unknown blocked');
check(MOBILE_RPC_METHOD_ALLOWLIST.has('agentSession.respondToApproval'),'structured permission exists upstream but Deck does not enable it');
check(!G0_READINESS.liveConnectionEnabled && !G0_READINESS.realControlsEnabled,'no-go remains explicit');
check(relayConnectWebSocketUrl('https://cell.example.test','host/id') === 'wss://cell.example.test/v1/connect/host%2Fid','original relay routing escapes host ID');
const bytes = new Uint8Array(20000).fill(255);
check(decodeCanonicalBase64Bytes(encodeBase64Bytes(bytes))?.length === bytes.length,'upstream base64 chunk roundtrip');
check(decodeCanonicalBase64Bytes('Zh==') === null,'noncanonical unused bits refused');
check(decodeCanonicalBase64Bytes(' Zg==') === null,'whitespace refused');
async function disabledAdapter() {
 const client = new UnimplementedOrcaClient();
 for (const run of [() => client.connect(), () => client.listAgents(), () => client.send({kind:'send_prompt',target:{hostId:'h',worktreeId:'w',terminalId:'t'},text:'test'})]) {
  let blocked = false;
  try { await run(); } catch { blocked = true; }
  check(blocked,'live adapter remains disabled');
 }
 console.log(`PASS: ${assertions} upstream contract assertions (offline fixtures, not real pairing)`);
}
void disabledAdapter();
