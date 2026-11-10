import { describeLiveView as describeLiveViewForLocale, STALE_AFTER_MS } from '../src/ui/live-view';
import type { LiveSnapshot } from '../src/adapters/live-session';
import type { AgentSnapshot } from '../src/core/types';
import { getOverview } from '../src/core/attention';
import { createTranslator } from '../src/i18n/messages';
const korean = createTranslator('ko');
const describeLiveView = (snapshot: LiveSnapshot, now: number) => describeLiveViewForLocale(snapshot, now, korean);

let count = 0;
function check(value: unknown, message: string): asserts value { count++; if (!value) throw new Error(message); }

const host = { hostId: 'h'.repeat(32), endpointHost: '192.168.0.60:6768', pairedAt: '2026-11-02T06:00:00.000Z' };
const now = Date.parse('2026-11-02T06:10:00.000Z');
const agent = (id: string, state: AgentSnapshot['state'], eventType: AgentSnapshot['eventType'] = 'informational'): AgentSnapshot => ({
  id, provider: 'claude', title: `task ${id}`, summary: '', state, eventType, updatedAt: new Date(now - 1000).toISOString(),
  target: { hostId: 'h', worktreeId: `wt-${id}` }, permissionEvidence: 'missing',
});
const agents = [agent('a', 'question', 'user_question'), agent('b', 'working'), agent('c', 'done'), agent('d', 'failed', 'task_failure')];
const connection = (ageMs: number) => ({ hostId: 'h', online: true, paired: true, controlsVerified: false, enabledCommands: [], lastConfirmedAt: new Date(now - ageMs).toISOString() });
const snap = (extra: Partial<LiveSnapshot>): LiveSnapshot => ({ phase: 'live', agents, host, attempt: 0, connection: connection(2000), ...extra });

// A fresh live read: real states, real counts, the queue, and how old the read is.
{
  const view = describeLiveView(snap({}), now);
  check(view.status.live && view.status.headline.includes('LIVE'), 'a fresh read is live');
  check(view.agents.map(a => a.state).join() === 'question,working,done,failed', 'real states are shown');
  check(view.counts !== null && JSON.stringify(view.counts) === JSON.stringify(getOverview(agents)), 'counts are the real overview');
  check(view.queue.length === 2 && view.status.detail?.includes('2초 전 확인') === true, 'the queue is built and the age of the read is shown');
  check(!view.needsRepair && !view.canRetry, 'nothing to repair');
}

// A read that stopped being refreshed is not live, whatever the phase still says.
{
  const view = describeLiveView(snap({ connection: connection(STALE_AFTER_MS + 5000) }), now);
  check(!view.status.live && !view.status.headline.includes('LIVE') && view.status.tone === 'warn', 'a read older than the limit is not live');
  check(view.status.headline.includes('마지막 확인') && view.status.headline.includes('35초'), 'and says how long ago it was confirmed');
  check(view.agents.every(a => a.state === 'unknown') && view.counts === null && view.queue.length === 0, 'its agents are unknown, the counters unconfirmed and the queue empty');
  check(describeLiveView(snap({ connection: connection(STALE_AFTER_MS) }), now).status.live, 'exactly at the limit is still live');
  check(!describeLiveView(snap({ connection: undefined }), now).status.live, 'a live snapshot without a confirmation time is not trusted');
  check(!describeLiveView(snap({ connection: { ...connection(0), lastConfirmedAt: undefined } }), now).status.live, 'nor one whose confirmation time is missing');
  check(!describeLiveView(snap({ connection: { ...connection(0), lastConfirmedAt: 'not a date' } }), now).status.live, 'nor an unreadable one');
  check(!describeLiveView(snap({ connection: connection(-60_000) }), now).status.live, 'nor one from far in the future (the clock moved)');
  check(describeLiveView(snap({ connection: connection(-1000) }), now).status.live, 'a second of skew is tolerated');
}

// Whatever a snapshot carries outside the live phase, the screen shows unknown: the UI does not rely on one invariant alone.
for (const invalidClock of [NaN, Infinity, -Infinity]) {
  const view = describeLiveView(snap({}), invalidClock);
  check(!view.status.live && view.counts === null && view.queue.length === 0, 'an invalid clock cannot claim LIVE or confirmed counters');
}

for (const phase of ['loading', 'unpaired', 'connecting', 'reconnecting', 'stopped'] as const) {
  const view = describeLiveView(snap({ phase, error: phase === 'reconnecting' ? 'transport_failed' : undefined, attempt: phase === 'reconnecting' ? 2 : 0 }), now);
  check(!view.status.live, `${phase} is not live`);
  check(view.agents.length === agents.length && view.agents.every(a => a.state === 'unknown' && a.requestId === undefined && a.permissionEvidence === 'missing'), `${phase}: even real-looking states are shown as unknown`);
  check(view.counts === null && view.queue.length === 0, `${phase}: counters unconfirmed, queue empty`);
}

// Unconfirmed counters are "unknown", never zero; how many agents are unconfirmed is still told.
{
  const view = describeLiveView(snap({ phase: 'reconnecting', error: 'transport_failed', attempt: 1 }), now);
  check(view.unknownCount === 4, 'the number of unconfirmed agents is reported');
  check(describeLiveView(snap({ phase: 'connecting', agents: [] }), now).unknownCount === 0, 'and zero agents are zero');
}

// What the user can do about a stop.
{
  for (const error of ['auth_rejected', 'host_mismatch'] as const) {
    const view = describeLiveView(snap({ phase: 'stopped', error }), now);
    check(view.needsRepair && view.canRetry, `${error}: pair again, or retry`);
  }
  const storage = describeLiveView(snap({ phase: 'stopped', error: 'storage_unavailable' }), now);
  check(!storage.needsRepair && storage.canRetry, 'a store that could not forget the pairing: retry only');
  const background = describeLiveView(snap({ phase: 'stopped' }), now);
  check(!background.needsRepair && !background.canRetry, 'an ordinary stop resumes by itself');
  check(!describeLiveView(snap({ phase: 'reconnecting', error: 'auth_rejected' }), now).needsRepair, 'only a stopped session asks to pair again');
}

const translated = describeLiveViewForLocale(snap({}), now, createTranslator('en'));
check(translated.status.live && translated.queue.length === 2 && translated.status.detail !== describeLiveView(snap({}), now).status.detail && translated.agents[0].title === 'task a', 'locale affects fixed display copy while queue/state and owner titles stay unchanged');
console.log(`PASS: ${count} live view assertions (pure function; no UI)`);
