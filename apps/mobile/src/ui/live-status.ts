import type { LiveError, LiveSnapshot } from '../adapters/live-session';
import { createTranslator, type Translator, type MessageKey } from '../i18n/messages';

/**
 * What the live screen tells the user about the connection. Pure, so the safety properties are tested without a
 * UI: "LIVE" is claimed only while a confirmed read is current, every other phase says that what is shown cannot be
 * confirmed, and only codes (never host text) reach the screen.
 */
export type StatusTone = 'neutral' | 'ok' | 'warn' | 'danger';

export interface LiveStatus {
  live: boolean;
  tone: StatusTone;
  headline: string;
  detail?: string;
}

export const UNCONFIRMED = createTranslator('en')('live.unconfirmed');

const REASONS: Partial<Record<LiveError, Extract<MessageKey, `live.reason.${string}`>>> = {
  transport_failed: 'live.reason.connectionFailed', request_timeout: 'live.reason.timeout',
  incompatible_protocol: 'live.reason.incompatible', host_not_ready: 'live.reason.notReady',
  host_identity_mismatch: 'live.reason.hostChanged', malformed_response: 'live.reason.malformed',
  connect_failed: 'live.reason.connectionFailed', handshake_timeout: 'live.reason.handshake',
  protocol_error: 'live.reason.protocol',
};

/** A host on the local network, where iOS asks for the "Local Network" permission (Tailscale and public addresses are not). */
export function isLocalNetworkHost(endpointHost: string | undefined): boolean {
  if (!endpointHost) return false;
  const host = (endpointHost.startsWith('[') ? endpointHost.slice(1, endpointHost.indexOf(']')) : endpointHost.replace(/:\d+$/, '')).toLowerCase();
  if (host.endsWith('.local')) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  // IPv6: link-local, and unique-local except Tailscale's own prefix (it is routed through the tunnel, not the local network).
  return host.startsWith('fe80:') || ((host.startsWith('fc') || host.startsWith('fd')) && !host.startsWith('fd7a:115c:a1e0:'));
}

export function describeLiveStatus(snapshot: Pick<LiveSnapshot, 'phase' | 'error' | 'attempt' | 'host'>, t: Translator = createTranslator('en')): LiveStatus {
  const { phase, error, attempt, host } = snapshot;
  switch (phase) {
    case 'loading':
      return { live: false, tone: 'neutral', headline: t('common.loading') };
    case 'unpaired':
      return error === 'storage_unavailable'
        ? { live: false, tone: 'danger', headline: t('link.unpaired'), detail: t('live.storageUnreadable') }
        : { live: false, tone: 'neutral', headline: t('link.unpaired') };
    case 'connecting':
      return { live: false, tone: 'neutral', headline: t('live.connecting'), detail: host?.endpointHost };
    case 'live':
      return { live: true, tone: 'ok', headline: t('live.confirmed'), detail: `${host?.endpointHost ?? 'Orca'} · ${t('live.connectedDetail')}` };
    case 'reconnecting': {
      const reasonKey = error && REASONS[error];
      const reason = reasonKey ? t(reasonKey) : t('live.genericError');
      const where = host ? t('live.address', { address: host.endpointHost }) : '';
      // iOS reports a refused Local Network permission to the app as an ordinary failed connection.
      const hint = attempt >= 2 && (error === 'connect_failed' || error === 'handshake_timeout') && isLocalNetworkHost(host?.endpointHost)
        ? ` ${t('live.localNetworkHint')}` : '';
      return {
        live: false,
        tone: 'warn',
        headline: t('live.reconnecting', { attempt }),
        detail: `${reason}${error ? ` (${error})` : ''}.${where}${hint} ${t('live.unconfirmed')}`,
      };
    }
    case 'stopped':
      if (error === 'auth_rejected') {
        return { live: false, tone: 'danger', headline: t('live.stopped'), detail: t('live.authRejected') };
      }
      if (error === 'host_mismatch') {
        return { live: false, tone: 'danger', headline: t('live.stopped'), detail: t('live.hostKeyMismatch') };
      }
      if (error === 'storage_unavailable') {
        return { live: false, tone: 'danger', headline: t('live.stopped'), detail: t('live.storageUnpairFailed') };
      }
      return { live: false, tone: 'neutral', headline: t('live.paused'), detail: t('live.unconfirmed') };
  }
}
