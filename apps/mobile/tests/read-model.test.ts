import { comparePublication, normalizeWorktreePs, parseStatus, parseTabsSnapshot } from '../src/adapters/orca-read-model';
import { checkCommand } from '../src/core/policy';
import { getAttentionQueue, getOverview } from '../src/core/attention';
import type { ConnectionState } from '../src/core/types';

let count = 0;
function check(value: unknown, message: string): asserts value { count++; if (!value) throw new Error(message); }

const observedAt = Date.parse('2026-11-02T03:00:00Z');
const ctx = { hostId: 'host-1', generation: 4, observedAt };

// Shape copied from the original 1.4.245 mock's worktree.ps response (synthetic data).
function row(overrides: Record<string, unknown> = {}, agentOverrides: Record<string, unknown> = {}) {
  return {
    worktreeId: 'repo-1::/tmp/mock/manta-1', repoId: 'repo-1', repo: 'orca', path: '/tmp/mock/manta-1', branch: 'main',
    displayName: 'manta-1', status: 'working', preview: '$ pnpm test --filter mobile-1', lastOutputAt: observedAt - 1000,
    agents: [{
      paneKey: 'agent-0', parentPaneKey: null, state: 'waiting', agentType: 'claude', prompt: 'Investigate lag',
      taskTitle: 'Investigate mobile lag', displayName: 'Mobile lag 1', lastAssistantMessage: 'Running focused checks',
      toolName: null, toolInput: null, interrupted: false, stateStartedAt: observedAt - 5000, updatedAt: observedAt - 2000,
      ...agentOverrides,
    }],
    ...overrides,
  };
}
const listing = (worktrees: unknown[], extra: Record<string, unknown> = {}) =>
  ({ worktrees, totalCount: worktrees.length, truncated: false, ...extra });

// A waiting agent is attention, but worktree.ps carries no structured permission proof.
const waiting = normalizeWorktreePs(listing([row(), row({ worktreeId: 'repo-2::/tmp/mock/narwhal-2', agents: [] })]), ctx);
check(waiting.ok, 'mock-shaped listing normalizes');
if (waiting.ok) {
  check(waiting.agents.length === 1, 'worktrees without agents produce no snapshot');
  const a = waiting.agents[0]!;
  check(a.id === 'repo-1::/tmp/mock/manta-1::agent-0', 'id combines worktree and pane');
  check(a.provider === 'claude' && a.title === 'Investigate mobile lag', 'provider and title come from the agent row');
  check(a.state === 'question' && a.eventType === 'user_question', 'waiting means the agent needs the human');
  check(a.permissionEvidence === 'missing' && a.requestId === undefined, 'worktree.ps never yields structured permission proof');
  check(a.target.hostId === 'host-1' && a.target.connectionGeneration === 4 && a.target.terminalId === 'agent-0', 'target binds host, generation and pane');
  check(a.updatedAt === new Date(observedAt - 2000).toISOString(), 'updatedAt is an ISO timestamp of the host event');
  check(getAttentionQueue(waiting.agents).length === 1, 'waiting agent reaches the attention queue');
  const connection: ConnectionState = { hostId: 'host-1', generation: 4, online: true, paired: true, lastConfirmedAt: new Date(observedAt).toISOString(), controlsVerified: true, enabledCommands: ['send_prompt', 'approve_permission'] };
  const active = { hostId: 'host-1', generation: 4 };
  const fresh = observedAt + 1000;
  check(!checkCommand({ kind: 'approve_permission', target: a.target, requestId: 'r' }, a, connection, fresh, active).allowed, 'approve is refused without structured proof');
  check(!checkCommand({ kind: 'send_prompt', target: a.target, text: 'yes' }, a, connection, fresh, active).allowed, 'free text is refused while the agent waits on a structured request');
}

// blocked is also attention, still unverified.
const blocked = normalizeWorktreePs(listing([row({}, { state: 'blocked',programStatus:{state:'blocked',kind:'permission'} })]), ctx);
check(blocked.ok && blocked.agents[0]!.state === 'permission' && blocked.agents[0]!.eventType === 'permission_request', 'blocked maps to unverified permission attention');
check(blocked.ok && blocked.agents[0]!.permissionEvidence === 'missing' && blocked.agents[0]!.requestId === undefined, 'blocked has no request id or proof');

// Other states.
const states = normalizeWorktreePs(listing([
  row({ worktreeId: 'w-work' }, { state: 'working' }),
  row({ worktreeId: 'w-done' }, { state: 'done' }),
  row({ worktreeId: 'w-unconfirmed' }, { state: 'done', restoredUnconfirmed: true }),
  row({ worktreeId: 'w-new' }, { state: 'brand-new-state' }),
  row({ worktreeId: 'w-int' }, { state: 'done', interrupted: true }),
  row({ worktreeId: 'w-contradiction' }, { state: 'waiting', interrupted: true }),
]), ctx);
check(states.ok, 'mixed states normalize');
if (states.ok) {
  const by = (id: string) => states.agents.find(a => a.target.worktreeId === id)!;
  check(by('w-work').state === 'working' && by('w-work').eventType === 'informational', 'working is informational');
  check(by('w-done').state === 'done', 'confirmed done stays done');
  check(by('w-unconfirmed').state === 'unknown', 'restored but unconfirmed completion is never shown as done');
  check(by('w-new').state === 'unknown', 'an unrecognized host state fails closed');
  check(by('w-int').state === 'idle' && by('w-int').eventType === 'informational', 'a done turn that was cancelled is not attention');
  check(by('w-contradiction').state === 'unknown', 'interrupted outside done is contradictory and fails closed');
  check(getOverview(states.agents).done === 1, 'only confirmed completion counts as done');
}

// Failure closed on incomplete or malformed input.
const truncated = normalizeWorktreePs(listing([row()], { truncated: true }), ctx);
check(!truncated.ok && truncated.reason === 'truncated_listing', 'truncated listing is not a full snapshot');
const partial = normalizeWorktreePs({ worktrees: [row()], totalCount: 3, truncated: false }, ctx);
check(!partial.ok && partial.reason === 'truncated_listing', 'totalCount above the listed rows is also partial');
check(!normalizeWorktreePs({ totalCount: 0, truncated: false }, ctx).ok, 'missing worktrees array is malformed');
check(!normalizeWorktreePs(null, ctx).ok && !normalizeWorktreePs('x', ctx).ok, 'non-objects are malformed');
check(!normalizeWorktreePs(listing([row({ worktreeId: '' })]), ctx).ok, 'empty worktree id is malformed');
check(!normalizeWorktreePs(listing([row({}, { paneKey: '' })]), ctx).ok, 'empty pane key is malformed');
check(!normalizeWorktreePs(listing([row({}, { updatedAt: Number.NaN })]), ctx).ok, 'non-finite update time is malformed');
const dup = normalizeWorktreePs(listing([row(), row()]), ctx);
check(!dup.ok && dup.reason === 'duplicate_identity', 'the same worktree and pane twice is rejected');
const dupHosts = normalizeWorktreePs(listing([row({ hostId: 'local' }), row({ hostId: 'ssh:other' })]), ctx);
check(!dupHosts.ok && dupHosts.reason === 'duplicate_identity', 'the same worktree id on two execution hosts is ambiguous and rejected');
// Row hostId is Orca's execution-host id ('local', 'ssh:<id>', 'runtime:<id>'), a different namespace from Deck's host id.
for (const executionHost of ['local', 'ssh:persisted-host', 'runtime:peer-1']) {
  check(normalizeWorktreePs(listing([row({ hostId: executionHost })]), ctx).ok, `a row on execution host ${executionHost} is accepted`);
}

// Clock skew: host clock ahead of the phone cannot be compared; do not trust or discard everything.
const smallSkew = normalizeWorktreePs(listing([row({}, { updatedAt: observedAt + 3_000 })]), ctx);
check(smallSkew.ok && smallSkew.agents[0]!.state === 'question' && smallSkew.agents[0]!.updatedAt === new Date(observedAt).toISOString(), 'a host clock a few seconds ahead keeps the state and clamps the time');
const received = normalizeWorktreePs(listing([row({}, { updatedAt: observedAt + 8_000 })]), { ...ctx, skewReference: observedAt + 10_000 });
check(received.ok && received.agents[0]!.state === 'question', 'a row updated while the request was in flight is not skew');
const skew = normalizeWorktreePs(listing([row({}, { updatedAt: observedAt + 90_000 })]), ctx);
check(skew.ok && skew.agents[0]!.state === 'unknown' && skew.agents[0]!.updatedAt === new Date(observedAt).toISOString(), 'a future host timestamp becomes unknown, not fresh');
check(skew.ok && getAttentionQueue(skew.agents).length === 0, 'unknown skewed rows are not actionable attention');

// Full owner display text keeps content after terminal control cleanup.
const noisy = normalizeWorktreePs(listing([row({}, { lastAssistantMessage: 'ok\u0007\u001b[31m' + 'x'.repeat(500), taskTitle: null, displayName: null })]), ctx);
// eslint-disable-next-line no-control-regex
check(noisy.ok && noisy.agents[0]!.summary.length > 200 && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(noisy.agents[0]!.summary), 'summary remains complete and control characters are removed');
check(noisy.ok && !noisy.agents[0]!.summary.includes('[31m') && noisy.agents[0]!.summary.startsWith('okxxx'), 'terminal escape sequences are removed entirely, not just the escape byte');
check(noisy.ok && noisy.agents[0]!.title === 'manta-1', 'title falls back to the worktree display name');

// Finished-turn verdict (mainAgent.outcome) decides what "done" means; the host shows failures as news, never as completion.
const verdictRow = (id: string, state: string, mainAgent?: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  row({ worktreeId: id }, { state, ...(mainAgent ? { mainAgent: { stateStartedAt: observedAt - 9000, ...mainAgent } } : {}), ...extra });
const verdicts = normalizeWorktreePs(listing([
  verdictRow('v-fail', 'done', { state: 'done', outcome: 'failure' }),
  verdictRow('v-interruption', 'done', { state: 'done', outcome: 'interruption' }),
  verdictRow('v-fail-children', 'working', { state: 'done', outcome: 'failure' }),
  verdictRow('v-cancel', 'done', { state: 'done', outcome: 'cancellation' }),
  verdictRow('v-superseded', 'done', { state: 'done', outcome: 'superseded' }),
  verdictRow('v-unconfirmed', 'done', { state: 'done', outcome: 'unconfirmed' }),
  verdictRow('v-success', 'done', { state: 'done', outcome: 'success' }),
  verdictRow('v-legacy-done', 'done'),
  verdictRow('v-weird', 'done', { state: 'done', outcome: 'something-newer' }),
  verdictRow('v-live-lead', 'working', { state: 'working', outcome: 'failure' }),
  verdictRow('v-cancel-children', 'working', { state: 'done', outcome: 'cancellation' }),
  row({ worktreeId: 'v-bad-shape' }, { state: 'done', mainAgent: 'not-an-object' }),
  verdictRow('v-monitoring', 'working', { state: 'done' }, { workingMode: 'monitoring' }),
  verdictRow('v-stopping', 'working', { state: 'working', stopping: true }, { stateStartedAt: observedAt - 60_000, hasLivePty: true, structuredHostOwned: true }),
]), ctx);
check(verdicts.ok, 'verdict rows normalize');
if (verdicts.ok) {
  const v = (id: string) => verdicts.agents.find(a => a.target.worktreeId === id)!;
  check(v('v-fail').state === 'failed' && v('v-fail').eventType === 'task_failure', 'a failed turn is never done');
  check(v('v-interruption').state === 'failed', 'a provably unsolicited death is a failure');
  check(v('v-fail-children').state === 'failed', 'a fault outranks a combined state that still reads working');
  check(v('v-cancel').state === 'idle' && v('v-superseded').state === 'idle', 'a stopped or replaced turn is not attention');
  check(v('v-unconfirmed').state === 'unknown', 'an unproven end is never success');
  check(v('v-success').state === 'done' && v('v-legacy-done').state === 'done', 'success and legacy done rows stay done');
  check(v('v-weird').state === 'unknown', 'an outcome from a newer host fails closed');
  check(v('v-live-lead').state === 'working', 'a verdict is ignored while the lead agent is still live');
  check(v('v-cancel-children').state === 'working', 'cancellation waits for a combined done, so live children stay visible');
  check(v('v-bad-shape').state === 'unknown', 'a malformed mainAgent fails closed');
  check(v('v-monitoring').state === 'working' && v('v-monitoring').monitoring === true, 'a finished turn held by a live monitor is marked monitoring, as on the desktop');
  check(v('v-cancel-children').monitoring === undefined && v('v-live-lead').monitoring === undefined, 'ordinary working rows are not monitoring');
  check(v('v-stopping').stopping === true && v('v-stopping').livePty === true && v('v-stopping').hostOwned === true, 'stop, live terminal and host ownership are carried');
  check(v('v-stopping').stateSince === new Date(observedAt - 60_000).toISOString(), 'the age counts from when the state began');
  check(v('v-fail').stateSince === new Date(observedAt - 9000).toISOString(), 'a failed turn ages from the main agent');
  check(v('v-unconfirmed').unconfirmed === true && v('v-weird').unconfirmed === undefined, 'only an unconfirmed verdict is marked unconfirmed');
  check(getOverview(verdicts.agents).done === 2, 'only success and legacy done count as done');
  const failedIds = getAttentionQueue(verdicts.agents).filter(a => a.eventType === 'task_failure').map(a => a.target.worktreeId).sort();
  check(JSON.stringify(failedIds) === JSON.stringify(['v-fail', 'v-fail-children', 'v-interruption']), 'failures reach the attention queue');
}

// A row restored after a host restart has not been confirmed in any state.
const restored = normalizeWorktreePs(listing([
  row({ worktreeId: 'r-work' }, { state: 'working', restoredUnconfirmed: true }),
  row({ worktreeId: 'r-blocked' }, { state: 'blocked', restoredUnconfirmed: true }),
]), ctx);
check(restored.ok && restored.agents.every(a => a.state === 'unknown'), 'restored unconfirmed rows are unknown whatever their state');
check(restored.ok && getAttentionQueue(restored.agents).length === 0, 'a restored blocked row is not actionable attention');

// Blocked rows are refused by policy exactly like waiting rows.
const blockedRow = normalizeWorktreePs(listing([row({}, { state: 'blocked' })]), ctx);
if (blockedRow.ok) {
  const b = blockedRow.agents[0]!;
  const conn: ConnectionState = { hostId: 'host-1', generation: 4, online: true, paired: true, lastConfirmedAt: new Date(observedAt).toISOString(), controlsVerified: true, enabledCommands: ['send_prompt', 'approve_permission', 'reject_permission'] };
  for (const command of [{ kind: 'approve_permission' as const, target: b.target, requestId: 'r' }, { kind: 'reject_permission' as const, target: b.target, requestId: 'r' }, { kind: 'send_prompt' as const, target: b.target, text: 'yes' }]) {
    const verdict = checkCommand(command, b, conn, observedAt + 1000, { hostId: 'host-1', generation: 4 });
    check(!verdict.allowed, `blocked rows refuse ${command.kind}`);
  }
}

// Listing completeness evidence.
check(!normalizeWorktreePs({ worktrees: [row()] }, ctx).ok, 'a listing without truncated/totalCount is not trusted as complete');
const missingTruncated = normalizeWorktreePs({ worktrees: [row()], totalCount: 1 }, ctx);
check(!missingTruncated.ok && missingTruncated.reason === 'malformed', 'missing truncated flag is malformed');
const stringTruncated = normalizeWorktreePs({ worktrees: [row()], totalCount: 1, truncated: 'true' }, ctx);
check(!stringTruncated.ok && stringTruncated.reason === 'malformed', 'a non-boolean truncated flag is malformed');
check(!normalizeWorktreePs({ worktrees: [row()], truncated: false }, ctx).ok, 'missing totalCount is malformed');
const scopeGap = normalizeWorktreePs(listing([row()], { hostScope: { hostIds: ['local'], omittedHostIds: ['ssh:unreachable'] } }), ctx);
check(!scopeGap.ok && scopeGap.reason === 'truncated_listing', 'an omitted ssh host means the listing is incomplete');
check(normalizeWorktreePs(listing([row()], { hostScope: { hostIds: ['local'], omittedHostIds: ['runtime:peer'] } }), ctx).ok, 'an omitted paired runtime peer owns its own control plane');
check(normalizeWorktreePs(listing([row()], { hostScope: { hostIds: ['local'], omittedHostIds: [] } }), ctx).ok, 'a complete host scope is accepted');
check(!normalizeWorktreePs(listing([row()], { hostScope: 'x' }), ctx).ok, 'a malformed host scope is malformed');

// Agent-controlled display text: no terminal escapes, C1 or bidi controls, whole Unicode fields remain.
const spoof = normalizeWorktreePs(listing([row({}, {
  taskTitle: '\u001b[2J\u001b]0;evil title\u0007Safe\u202egnp.exe\u0085\u2066',
  lastAssistantMessage: 'a\u009bb\u202ec',
})]), ctx);
check(spoof.ok && spoof.agents[0]!.title === 'Safegnp.exe', 'title loses CSI, OSC, C1 and bidi override characters');
check(spoof.ok && spoof.agents[0]!.summary === 'abc', 'summary loses C1 and bidi override characters');
const invisible = normalizeWorktreePs(listing([row({}, { taskTitle: 'a\u200bb\u200dc\ufeffd\u061ce\u200ef' })]), ctx);
check(invisible.ok && invisible.agents[0]!.title === 'abcdef', 'zero-width, byte-order and directional marks are removed');
const huge = normalizeWorktreePs(listing([row({}, { taskTitle: 'x'.repeat(1_000_000) })]), ctx);
check(huge.ok && huge.agents[0]!.title.length === 1_000_000, 'the entire received owner title is retained');
const emoji = normalizeWorktreePs(listing([row({}, { taskTitle: '😀'.repeat(200), lastAssistantMessage: '😀'.repeat(300) })]), ctx);
check(emoji.ok && Array.from(emoji.agents[0]!.title).length === 200 && Array.from(emoji.agents[0]!.summary).length === 300, 'complete Unicode title and summary survive normalization');
check(emoji.ok && (() => { try { encodeURIComponent(emoji.agents[0]!.title + emoji.agents[0]!.summary); return true; } catch { return false; } })(), 'complete normalization never leaves half a surrogate pair');
const blankTitle = normalizeWorktreePs(listing([row({}, { taskTitle: '\u202e\u202e', displayName: '  ' })]), ctx);
check(blankTitle.ok && blankTitle.agents[0]!.title === 'manta-1', 'a title that is empty after cleaning falls back');

const multiline=normalizeWorktreePs(listing([row({}, {lastAssistantMessage:'첫 줄\n둘째\t열\r\n셋째'})]),ctx);
check(multiline.ok&&multiline.agents[0].summary==='첫 줄\n둘째\t열\n셋째','owner line breaks and tabs remain readable with CRLF normalized');

// status.get (shape copied from the original mock).
const mockStatus = { runtimeId: 'mock-runtime', protocolVersion: 3, minCompatibleMobileVersion: 2, capabilities: ['accounts.codex-reset-credit.v1'], graphStatus: 'ready', windowCount: 1, tabCount: 2, terminalCount: 2 };
const status = parseStatus(mockStatus);
check(status.ok && status.status.runtimeId === 'mock-runtime' && status.status.protocolVersion === 3 && status.status.minCompatibleMobileVersion === 2, 'status identity and protocol are parsed');
check(status.ok && status.status.ready && status.status.capabilities.includes('accounts.codex-reset-credit.v1'), 'a ready graph with capabilities is parsed');
const starting = parseStatus({ ...mockStatus, graphStatus: 'starting' });
check(starting.ok && !starting.status.ready, 'a graph that is not ready is not ready');
check(parseStatus({ ...mockStatus, capabilities: undefined }).ok, 'older hosts may omit capabilities');
check(parseStatus({ ...mockStatus, capabilities: ['ok', 7] }).ok === false, 'non-string capabilities are malformed');
check(!parseStatus({ ...mockStatus, runtimeId: '' }).ok, 'empty runtime id is malformed');
check(!parseStatus({ ...mockStatus, protocolVersion: 3.5 }).ok && !parseStatus({ ...mockStatus, minCompatibleMobileVersion: -1 }).ok, 'non-integer protocol numbers are malformed');
check(!parseStatus(undefined).ok && !parseStatus([]).ok, 'non-object status is malformed');

// session.tabs.list carries the host's own publication epoch and monotone version.
const mockTabs = { worktree: 'mock-worktree', publicationEpoch: 'mock-server:aaaa', snapshotVersion: 1, tabs: [{ type: 'terminal', id: 'tab-1::leaf', title: 'zsh', status: 'ready', terminal: 'term-1', isActive: true }] };
const tabs = parseTabsSnapshot(mockTabs);
check(tabs.ok && tabs.snapshot.worktree === 'mock-worktree' && tabs.snapshot.publication.epoch === 'mock-server:aaaa' && tabs.snapshot.publication.version === 1, 'tabs publication is parsed');
check(tabs.ok && tabs.snapshot.tabs.length === 1 && tabs.snapshot.tabs[0]!.terminal === 'term-1' && tabs.snapshot.tabs[0]!.id === 'tab-1::leaf', 'tabs keep id, type, title, status and terminal');
check(!parseTabsSnapshot({ ...mockTabs, publicationEpoch: '' }).ok, 'missing epoch is malformed');
check(!parseTabsSnapshot({ ...mockTabs, snapshotVersion: -1 }).ok && !parseTabsSnapshot({ ...mockTabs, snapshotVersion: 1.2 }).ok, 'version must be a non-negative integer');
check(!parseTabsSnapshot({ ...mockTabs, tabs: 'x' }).ok && !parseTabsSnapshot({ ...mockTabs, tabs: [{ type: 'terminal' }] }).ok, 'malformed tabs are rejected');
check(!parseTabsSnapshot({ ...mockTabs, worktree: '' }).ok, 'empty worktree is malformed');

check(tabs.ok && tabs.snapshot.published && tabs.snapshot.complete, 'a published, fully reconciled snapshot is complete');
for (const epoch of ['none', 'none:client-navigation']) {
  const placeholder = parseTabsSnapshot({ ...mockTabs, publicationEpoch: epoch, tabs: [] });
  check(placeholder.ok && !placeholder.snapshot.published && !placeholder.snapshot.complete, `epoch "${epoch}" means ask later, not "no tabs"`);
}
const unreconciled = parseTabsSnapshot({ ...mockTabs, clientHostedPagesUnreconciled: true });
check(unreconciled.ok && unreconciled.snapshot.published && !unreconciled.snapshot.complete, 'unreconciled client-hosted pages make the snapshot incomplete');
const unverifiable = parseTabsSnapshot({ ...mockTabs, agentSessionsUnverifiable: true });
check(unverifiable.ok && !unverifiable.snapshot.complete, 'unverifiable chat sessions make the snapshot incomplete');

const same = { epoch: 'e1', version: 5 };
check(comparePublication(undefined, same) === 'accept', 'first publication is accepted');
check(comparePublication(same, { epoch: 'e1', version: 6 }) === 'accept', 'a newer version in the same epoch is accepted');
check(comparePublication(same, { epoch: 'e1', version: 5 }) === 'accept', 'an equal version is the same publication re-read and is processed again, as the original client does');
check(comparePublication(same, { epoch: 'e1', version: 4 }) === 'stale', 'an older version in the same epoch is stale');
check(comparePublication(same, { epoch: 'e2', version: 1 }) === 'new_epoch', 'a new epoch means the publisher restarted and needs a fresh sync');

// Deck retirement needs explicit evidence beyond a successful basic pane read.
const completeDeck=normalizeWorktreePs(listing([row({hostId:'local',unverifiableTerminalCount:0})],{hostScope:{hostIds:['local'],omittedHostIds:[]}}),ctx);
check(completeDeck.ok&&completeDeck.inventory.complete===true,'zero unverifiable terminals supplies pane completeness evidence');
check(completeDeck.ok&&completeDeck.inventory.worktreeIds[0]==='repo-1::/tmp/mock/manta-1'&&completeDeck.inventory.generation===ctx.generation&&completeDeck.inventory.observedAt===ctx.observedAt,'inventory evidence carries exact host scope, generation and issue time');
const unknownTerminalCoverage=normalizeWorktreePs(listing([row({hostId:'local'})],{hostScope:{hostIds:['local'],omittedHostIds:[]}}),ctx);
check(unknownTerminalCoverage.ok&&!unknownTerminalCoverage.inventory.complete,'missing terminal completeness does not become complete');
const unavailableTerminal=normalizeWorktreePs(listing([row({hostId:'local',unverifiableTerminalCount:1})],{hostScope:{hostIds:['local'],omittedHostIds:[]}}),ctx);
check(unavailableTerminal.ok&&!unavailableTerminal.inventory.complete,'unverifiable host terminals preserve partial-read truth');
check(!normalizeWorktreePs(listing([row(),row({agents:[]})]),ctx).ok,'duplicate worktrees are invalid even if one has no agents');
check(!normalizeWorktreePs(listing([row()],{totalCount:0}),ctx).ok,'a total count below returned rows is inconsistent');

const duplicatePaneRow=row({hostId:'local',unverifiableTerminalCount:0});
const duplicatePaneAgent=duplicatePaneRow.agents[0];
const duplicatePane=normalizeWorktreePs(listing([{...duplicatePaneRow,agents:[duplicatePaneAgent,{...duplicatePaneAgent,state:'blocked'},{...duplicatePaneAgent,paneKey:'independent-pane'}]}],{hostScope:{hostIds:['local'],omittedHostIds:[]}}),ctx);
check(duplicatePane.ok&&!duplicatePane.inventory.complete,'duplicate pane identity makes only absence coverage partial');
check(duplicatePane.ok&&duplicatePane.agents.length===2&&duplicatePane.agents[1].target.terminalId==='independent-pane','ambiguous pane is quarantined while independent positive row survives');
check(duplicatePane.ok&&duplicatePane.agents[0].state==='unknown'&&duplicatePane.agents[0].permissionEvidence==='missing'&&duplicatePane.agents[0].requestId===undefined,'duplicate target stays unknown with no request authority');
check(duplicatePane.ok&&duplicatePane.inventory.ambiguousPanes?.includes(JSON.stringify([duplicatePaneRow.worktreeId,duplicatePaneAgent.paneKey])),'ambiguity identity reaches the deck projection for disabled binding');
const omittedRuntime=normalizeWorktreePs(listing([row({hostId:'local',unverifiableTerminalCount:0})],{hostScope:{hostIds:['local'],omittedHostIds:['runtime:peer']}}),ctx);
check(omittedRuntime.ok&&!omittedRuntime.inventory.complete,'an omitted runtime remains basic-readable but never proves full absence');
check(completeDeck.ok&&typeof completeDeck.inventory.scopeIdentity==='string','complete pane evidence has an explicit scope identity');
const differentScope=normalizeWorktreePs(listing([row({hostId:'local',unverifiableTerminalCount:0})],{hostScope:{hostIds:['local','runtime:peer'],omittedHostIds:[]}}),ctx);
check(completeDeck.ok&&differentScope.ok&&completeDeck.inventory.scopeIdentity!==differentScope.inventory.scopeIdentity,'changed host scope changes the absence identity');
console.log(`PASS: ${count} read-model assertions (synthetic mock-shaped fixtures; no host contacted)`);

for(const appVersion of ['1.4.250','1.4.252','2.0','v1.4.251']){const r=parseStatus({...mockStatus,appVersion});check(r.ok&&r.status.appVersion===appVersion,'diagnostic host label is retained verbatim without semver authorization');}
