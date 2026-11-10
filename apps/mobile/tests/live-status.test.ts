import { describeLiveStatus as describeLiveStatusForLocale } from '../src/ui/live-status';
import type { LiveSnapshot } from '../src/adapters/live-session';
import { createTranslator } from '../src/i18n/messages';
const korean = createTranslator('ko');
const describeLiveStatus = (snapshot: Pick<LiveSnapshot, 'phase' | 'error' | 'attempt' | 'host'>) => describeLiveStatusForLocale(snapshot, korean);

let count = 0;
function check(value: unknown, message: string): asserts value { count++; if (!value) throw new Error(message); }

const host = { hostId: 'h'.repeat(32), endpointHost: '192.168.0.60:6768', pairedAt: '2026-11-02T06:00:00.000Z' };
const snap = (extra: Partial<LiveSnapshot>): LiveSnapshot => ({ phase: 'unpaired', agents: [], attempt: 0, ...extra });

// "LIVE" may be claimed only while a confirmed read is current.
{
  const phases: LiveSnapshot['phase'][] = ['loading', 'unpaired', 'connecting', 'live', 'reconnecting', 'stopped'];
  for (const phase of phases) {
    const status = describeLiveStatus(snap({ phase, host: phase === 'unpaired' ? undefined : host, attempt: phase === 'reconnecting' ? 2 : 0 }));
    check(status.live === (phase === 'live'), `only the live phase is live (${phase})`);
    check((status.headline.includes('LIVE')) === (phase === 'live'), `the word LIVE appears only in the live phase (${phase})`);
  }
}

{
  const live = describeLiveStatus(snap({ phase: 'live', host }));
  check(live.tone === 'ok' && live.headline.includes('연결 확인') && live.detail?.includes('192.168.0.60:6768') === true, 'live reports the confirmed connection and shows the host');
  check(describeLiveStatus(snap({ phase: 'unpaired' })).tone === 'neutral', 'unpaired is neutral');
  check(describeLiveStatus(snap({ phase: 'loading' })).headline.includes('불러오는 중'), 'loading says so and does not claim to be unpaired');
  check(describeLiveStatus(snap({ phase: 'connecting', host })).headline.includes('연결 중'), 'connecting says so');
}

{
  const lost = describeLiveStatus(snap({ phase: 'reconnecting', host, attempt: 3, error: 'transport_failed' }));
  check(lost.tone === 'warn' && lost.headline.includes('다시 연결 중') && lost.headline.includes('3'), 'reconnecting shows the attempt');
  check(lost.detail?.includes('확인 불가') === true, 'and says that what is shown cannot be confirmed');
}

{
  const refused = describeLiveStatus(snap({ phase: 'stopped', host, error: 'auth_rejected' }));
  check(refused.tone === 'danger' && refused.detail?.includes('다시 페어링') === true && !refused.live, 'a refused token tells the user to pair again');
  const changed = describeLiveStatus(snap({ phase: 'stopped', host, error: 'host_mismatch' }));
  check(changed.tone === 'danger' && changed.detail?.includes('키') === true && changed.detail.includes('다시 페어링'), 'a host with a different key is called out');
  const paused = describeLiveStatus(snap({ phase: 'stopped', host }));
  check(paused.tone === 'neutral' && !paused.live && paused.detail?.includes('확인 불가') === true, 'a stopped session (backgrounded) is neutral and says nothing is current');
  const storage = describeLiveStatus(snap({ phase: 'stopped', host, error: 'storage_unavailable' }));
  check(storage.tone === 'danger' && storage.detail?.includes('보안 저장소') === true, 'a store that cannot forget the pairing is reported');
  const unpairedStorage = describeLiveStatus(snap({ phase: 'unpaired', error: 'storage_unavailable' }));
  check(unpairedStorage.tone === 'danger' && unpairedStorage.detail?.includes('보안 저장소') === true, 'an unreadable store is reported while unpaired');
}

// Where it is trying, and what kind of failure it was. A private-network host that cannot be reached is very often the iOS
// "Local Network" permission, which iOS reports to an app as a plain failure: say so, once it has failed more than once.
{
  const lan = { ...host, endpointHost: '192.168.0.60:6791' };
  const refused = describeLiveStatus(snap({ phase: 'reconnecting', host: lan, attempt: 1, error: 'connect_failed' }));
  check(refused.detail?.includes('192.168.0.60:6791') === true && refused.detail.includes('connect_failed'), 'the reconnecting banner names where it is trying and the kind of failure');
  check(!refused.detail.includes('로컬 네트워크'), 'one failure is not yet blamed on the permission');
  const again = describeLiveStatus(snap({ phase: 'reconnecting', host: lan, attempt: 2, error: 'connect_failed' }));
  check(again.detail?.includes('설정') === true && again.detail.includes('로컬 네트워크'), 'a repeated failure to reach a private address points at the Local Network permission');
  check(describeLiveStatus(snap({ phase: 'reconnecting', host: lan, attempt: 3, error: 'handshake_timeout' })).detail?.includes('로컬 네트워크') === true, 'a handshake that never completes does too');
  for (const endpointHost of ['10.1.2.3:6768', '172.16.0.9:6768', '172.31.255.1:6768', '192.168.1.5:6768', '169.254.1.1:6768', 'my-mac.local:6768', '[fe80::1]:6768']) {
    check(describeLiveStatus(snap({ phase: 'reconnecting', host: { ...host, endpointHost }, attempt: 2, error: 'connect_failed' })).detail?.includes('로컬 네트워크') === true, `${endpointHost} is a local-network address`);
  }
  for (const endpointHost of ['100.64.0.1:6768', '203.0.113.9:6768', '172.32.0.1:6768', '172.15.0.1:6768', 'example.com:6768', '8.8.8.8:6768']) {
    check(describeLiveStatus(snap({ phase: 'reconnecting', host: { ...host, endpointHost }, attempt: 5, error: 'connect_failed' })).detail?.includes('로컬 네트워크') === false, `${endpointHost} is not blamed on the Local Network permission`);
  }
  check(describeLiveStatus(snap({ phase: 'reconnecting', host: lan, attempt: 5, error: 'request_timeout' })).detail?.includes('로컬 네트워크') === false, 'other kinds of failure are not blamed on it');
  check(!JSON.stringify(refused).includes('SECRET'), 'nothing but fixed text and the address is shown');
}

{
  const codes = ['transport_failed', 'incompatible_protocol', 'host_not_ready', 'host_identity_mismatch', 'request_timeout', 'malformed_response'] as const;
  const seen = new Set<string>();
  for (const error of codes) {
    const status = describeLiveStatus(snap({ phase: 'reconnecting', host, attempt: 1, error }));
    check(typeof status.detail === 'string' && status.detail.includes(error), `the code ${error} is shown for support, never free text`);
    seen.add(status.detail);
  }
  check(seen.size === codes.length, 'each code is distinguishable');
  const odd = describeLiveStatus(snap({ phase: 'reconnecting', host, attempt: 1, error: 'snapshot_rejected' }));
  check(odd.detail?.includes('snapshot_rejected') === true, 'any other code still shows its code');
}

const translated = describeLiveStatusForLocale(snap({ phase: 'live', host }), createTranslator('en'));
check(translated.live && translated.tone === 'ok' && translated.detail?.includes(host.endpointHost) && translated.headline !== describeLiveStatus(snap({ phase: 'live', host })).headline, 'locale changes labels while retaining confirmed state and the complete owner address');
console.log(`PASS: ${count} live status assertions (pure function; no UI)`);
