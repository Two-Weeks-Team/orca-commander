import { connectDirectTransport } from './direct-e2ee-transport';
import type { DirectTransportOptions } from './direct-e2ee-transport';
import { LiveSession } from './live-session';
import type { LiveSessionOptions } from './live-session';
import { PairingStore } from './pairing-store';
import type { SecureValueStore } from './pairing-store';
import type { RpcTransport } from './read-only-orca-client';

/**
 * The one place that joins the app's pieces: the platform secure store, the pairing store, the real direct
 * transport and the live session. The transport receives exactly the endpoint, the pinned host key and the device
 * token from the pairing, and nothing else (no logger: framing log lines are not needed and must never carry secrets).
 */
export interface AppLiveSessionOptions extends Pick<LiveSessionOptions, 'delay' | 'now' | 'refreshMs'> {
  /** Test seam; defaults to the real direct E2EE transport. */
  connect?: (options: DirectTransportOptions) => Promise<RpcTransport>;
}

export function createAppLiveSession(store: SecureValueStore, options: AppLiveSessionOptions = {}): LiveSession {
  const connect = options.connect ?? connectDirectTransport;
  return new LiveSession({
    store: new PairingStore(store),
    openTransport: host => connect({
      endpoint: host.endpoint,
      hostPublicKeyB64: host.hostPublicKeyB64,
      deviceToken: host.deviceToken,
    }),
    delay: options.delay,
    now: options.now,
    refreshMs: options.refreshMs,
  });
}
