import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compatibility, verifyUpstreamProfile } from './upstream-profile.mjs';

const upstream = resolve(process.argv[2] ?? 'vendor/orca');
const profile = verifyUpstreamProfile(upstream);
const source = async path => {
  const module = await import(pathToFileURL(resolve(upstream, path)).href);
  return module.default ?? module;
};
for (const file of profile.files) {
  assert.equal(createHash('sha256').update(readFileSync(resolve(upstream, file.path))).digest('hex'), file.sha256, file.path);
}
assert.ok(readFileSync(resolve(upstream, 'LICENSE'), 'utf8').includes('Copyright (c) 2026 Lovecast Inc.'));
const mobile = await source('mobile/src/transport/protocol-version.ts');
const desktop = await source('src/shared/protocol-version.ts');
assert.equal(mobile.MOBILE_PROTOCOL_VERSION, compatibility.protocolVersion);
assert.equal(mobile.MIN_COMPATIBLE_DESKTOP_VERSION, compatibility.minimumVersion);
assert.equal(desktop.DESKTOP_PROTOCOL_VERSION, compatibility.protocolVersion);
assert.equal(desktop.MIN_COMPATIBLE_MOBILE_VERSION, compatibility.minimumVersion);
const { MOBILE_RPC_METHOD_ALLOWLIST: methods } = await source('src/main/runtime/runtime-rpc/runtime-rpc-mobile-method-allowlist.ts');
for (const method of compatibility.readProbes) assert.ok(methods.has(method), method);
assert.equal(methods.has('worktree.list'), profile.worktreeList);
assert.ok(methods.has('agentSession.currentRequests'));
assert.ok(methods.has(compatibility.currentRequests.negotiationMethod));
const { WorktreeTabSelector } = await source('src/shared/rpc-contract/session-tabs-schemas-params.ts');
assert.equal(WorktreeTabSelector.safeParse({}).success, false, 'session list requires an explicit worktree selector');
assert.ok(WorktreeTabSelector.safeParse({worktree: 'id:mock-worktree'}).success);
const { CurrentRequestsParams } = await source('src/shared/rpc-contract/agent-session-current-requests-params.ts');
// Parsing and capability advertisement do not invoke currentRequests or prove
// capability refusal, successful reads or stale-version handling by its handler.
const valid = { sessionId: 'session-alpha', version: '00000000-0000-4000-8000-000000000002' };
assert.ok(CurrentRequestsParams.safeParse(valid).success, 'original currentRequests schema accepts session/version markers');
for (const params of [{}, { sessionId: valid.sessionId }, { ...valid, version: '3' }, { ...valid, sessionId: 'bad:id' }, { ...valid, cursor: -1 }]) {
  assert.equal(CurrentRequestsParams.safeParse(params).success, false, 'missing/malformed request markers refused');
}
const { mobileRuntimeClientCapabilityUpdateParams } = await source('mobile/src/transport/mobile-runtime-client-capabilities.ts');
assert.ok(mobileRuntimeClientCapabilityUpdateParams().clientCapabilities.includes(compatibility.currentRequests.capability));
console.log(`PASS: ${profile.id} Orca ${profile.desktopVersion} (${profile.commit}); original hashes, protocol 3/min 2, allowlist and currentRequests schema/advertisement`);
console.log('LIMIT: currentRequests handler not invoked; capability refusal, normal read and stale-version handling unverified; no native client, pairing or Relay proof');
