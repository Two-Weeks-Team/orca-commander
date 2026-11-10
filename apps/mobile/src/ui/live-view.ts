import {READ_FRESH_MS} from '../core/read-freshness';
import type { LiveSnapshot } from '../adapters/live-session';
import { getAttentionQueue, getOverview } from '../core/attention';
import type { AgentSnapshot } from '../core/types';
import { describeLiveStatus } from './live-status';
import type { LiveStatus } from './live-status';
import { createTranslator, type Translator } from '../i18n/messages';

/**
 * Everything the live screen may show, decided in one tested place. The screen does not rely on the session's invariant
 * alone (outside the live phase every agent is unknown): whatever a snapshot carries, agents are shown as unknown, counters
 * as unconfirmed (never zero) and the queue is empty unless a read was confirmed recently enough to call live.
 */
export const STALE_AFTER_MS = READ_FRESH_MS;
/** A refused stored pairing needs the existing owner-operated pairing path, not another automatic retry. */
export const needsPairingRepair=(snapshot:Pick<LiveSnapshot,'phase'|'error'>):boolean=>snapshot.phase==='stopped'&&(snapshot.error==='auth_rejected'||snapshot.error==='host_mismatch');
/** A device clock that jumps further than this makes the age of a read meaningless. */
const CLOCK_SKEW_MS = 5_000;

export interface LiveView {
  status: LiveStatus;
  /** Real states only while live; otherwise the same rows, all unknown. */
  agents: AgentSnapshot[];
  /** Null while unconfirmed: the screen shows "—", not 0. */
  counts: ReturnType<typeof getOverview> | null;
  /** How many agents are unconfirmed (all of them unless live). */
  unknownCount: number;
  queue: AgentSnapshot[];
  /** Stopped because the token was refused or the host has another key: offer to pair again. */
  needsRepair: boolean;
  /** Stopped with an error: offer an explicit retry (an OS event never retries it). */
  canRetry: boolean;
}

function ageOfRead(snapshot: LiveSnapshot, now: number): number | undefined {
  if (!Number.isFinite(now)) return undefined;
  const at = Date.parse(snapshot.connection?.lastConfirmedAt ?? '');
  if (!Number.isFinite(at)) return undefined;
  const age = now - at;
  if (age < -CLOCK_SKEW_MS) return undefined;
  return Math.max(0, age);
}

const asUnknown = (agent: AgentSnapshot): AgentSnapshot => ({
  ...agent, target: { ...agent.target }, state: 'unknown', eventType: 'informational', requestId: undefined, permissionEvidence: 'missing',
});

export function describeLiveView(snapshot: LiveSnapshot, now: number, t: Translator = createTranslator('en')): LiveView {
  let status = describeLiveStatus(snapshot, t);
  if (snapshot.phase === 'live') {
    const age = ageOfRead(snapshot, now);
    if (age === undefined) {
      status = { live: false, tone: 'warn', headline: t('live.unreadableTime'), detail: t('live.unconfirmed') };
    } else if (age > STALE_AFTER_MS) {
      status = { live: false, tone: 'warn', headline: t('live.stale', { seconds: Math.floor(age / 1000) }), detail: t('live.unconfirmed') };
    } else {
      status = { ...status, detail: `${status.detail ?? ''} · ${t('live.confirmedAge', { seconds: Math.floor(age / 1000) })}` };
    }
  }
  const agents = status.live ? snapshot.agents.map(agent => ({ ...agent, target: { ...agent.target } })) : snapshot.agents.map(asUnknown);
  const counts = status.live ? getOverview(agents) : null;
  return {
    status,
    agents,
    counts,
    unknownCount: counts ? counts.unknown : agents.length,
    queue: status.live ? getAttentionQueue(agents) : [],
    needsRepair: needsPairingRepair(snapshot),
    canRetry: snapshot.phase === 'stopped' && snapshot.error !== undefined,
  };
}
