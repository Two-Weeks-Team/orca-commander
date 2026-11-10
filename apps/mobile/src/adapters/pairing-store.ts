import { sha256 } from '@noble/hashes/sha256';
import { decodeCanonicalBase64Bytes } from '../upstream/orca-1.4.245/mobile/src/transport/base64-byte-codec';
import { extractPairingCodeFromUrl } from '../upstream/orca-1.4.245/mobile/src/transport/pairing';
import { inspectPairingCode } from './upstream-contract';

/**
 * What Deck keeps after pairing, and where. The device token and the pinned host key are secrets: they live
 * only in the platform secure store (Keychain/Keystore) as one JSON value, are validated on every read, and
 * never appear in errors, logs or the UI summary. Everything else in the pairing offer (device ids, host
 * descriptor, Relay credentials) is dropped on purpose.
 */

export interface PairedHost {
  hostId: string;
  endpoint: string;
  hostPublicKeyB64: string;
  deviceToken: string;
  pairedAt: string;
}

/** Minimal secure key-value store; the app implements it with expo-secure-store. */
export interface SecureValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const PAIRING_STORAGE_KEY = 'orca-deck.paired-host.v1';

export class PairingStoreError extends Error {
  constructor(readonly code: 'storage_unavailable' | 'invalid_pairing') {
    // Storage errors can echo what was being written: only the code is exposed, never a cause.
    super(code);
    this.name = 'PairingStoreError';
  }
}

const MAX_INPUT_CHARS = 130_000;
const MAX_TOKEN_CHARS = 64 * 1024;
const FIELDS = ['deviceToken', 'endpoint', 'hostId', 'hostPublicKeyB64', 'pairedAt'];

export function hostIdFromPublicKey(publicKeyB64: string): string {
  const bytes = decodeCanonicalBase64Bytes(publicKeyB64);
  if (!bytes || bytes.length !== 32) throw new PairingStoreError('invalid_pairing');
  return Array.from(sha256(bytes), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function validEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string') return false;
  try {
    const url = new URL(endpoint);
    // No credentials, fragment or query: those would end up in the socket URL and in network logs.
    return (url.protocol === 'ws:' || url.protocol === 'wss:') && !url.username && !url.password && !url.hash && !url.search && url.hostname !== '';
  } catch {
    return false;
  }
}

function validHost(value: unknown): PairedHost | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join() !== FIELDS.join()) return null;
  const { hostId, endpoint, hostPublicKeyB64, deviceToken, pairedAt } = record;
  if (typeof hostId !== 'string' || typeof hostPublicKeyB64 !== 'string' || typeof deviceToken !== 'string' || typeof pairedAt !== 'string') return null;
  if (!validEndpoint(endpoint) || !deviceToken || deviceToken.length > MAX_TOKEN_CHARS || !Number.isFinite(Date.parse(pairedAt))) return null;
  try {
    if (hostIdFromPublicKey(hostPublicKeyB64) !== hostId) return null;
  } catch {
    return null;
  }
  return { hostId, endpoint, hostPublicKeyB64, deviceToken, pairedAt };
}

/**
 * Accepts the raw code or an `orca://pair` link (what the desktop's QR carries: `?code=` with an unpadded url-safe code, or
 * the original's `#` form) and returns only what Deck keeps, or null. The link is parsed with the ORIGINAL
 * `extractPairingCodeFromUrl` (regex and URLSearchParams, as in the original app), preserving the original custom-link
 * and fragment handling. Expo installs a WHATWG URL implementation; no failure of its parser was observed on a device.
 */
export function pairedHostFromCode(input: string, now = Date.now()): PairedHost | null {
  if (typeof input !== 'string' || input.length > MAX_INPUT_CHARS) return null;
  let code = input.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(code)) {
    // Any other scheme (a web link in a QR, say) is refused here and never opened.
    code = extractPairingCodeFromUrl(code)?.trim() ?? '';
  }
  const offer = inspectPairingCode(code, now);
  if (!offer) return null;
  try {
    return validHost({
      hostId: hostIdFromPublicKey(offer.publicKeyB64),
      endpoint: offer.endpoint,
      hostPublicKeyB64: offer.publicKeyB64,
      deviceToken: offer.deviceToken,
      pairedAt: new Date(now).toISOString(),
    });
  } catch {
    return null;
  }
}

/** What to show before the user confirms a scanned pairing: the host and port and a key digest. No secret, nothing is stored. */
export function previewPairing(input: string, now = Date.now()): { hostId: string; endpointHost: string; pairedAt: string } | null {
  const host = pairedHostFromCode(input, now);
  return host ? describeHost(host) : null;
}

export class PairingStore {
  constructor(private readonly store: SecureValueStore) {}

  async load(): Promise<PairedHost | null> {
    let raw: string | null;
    try {
      raw = await this.store.get(PAIRING_STORAGE_KEY);
    } catch {
      throw new PairingStoreError('storage_unavailable');
    }
    if (raw === null) return null;
    let host: PairedHost | null = null;
    try {
      host = validHost(JSON.parse(raw));
    } catch {
      host = null;
    }
    if (!host) {
      // A damaged or tampered value must not keep failing: treat it as not paired and remove it.
      try { await this.store.remove(PAIRING_STORAGE_KEY); } catch { /* nothing more to do */ }
      return null;
    }
    return host;
  }

  async save(host: PairedHost): Promise<void> {
    const valid = validHost(host);
    if (!valid) throw new PairingStoreError('invalid_pairing');
    try {
      await this.store.set(PAIRING_STORAGE_KEY, JSON.stringify(valid));
    } catch {
      throw new PairingStoreError('storage_unavailable');
    }
  }

  async clear(): Promise<void> {
    try {
      await this.store.remove(PAIRING_STORAGE_KEY);
      // The native Keychain delete reports nothing, so a delete that did not happen would look like success.
      if ((await this.store.get(PAIRING_STORAGE_KEY)) !== null) throw new Error('still stored');
    } catch {
      throw new PairingStoreError('storage_unavailable');
    }
  }
}

/** The only view the UI gets: no token, no key. */
export function describeHost(host: PairedHost): { hostId: string; endpointHost: string; pairedAt: string } {
  return { hostId: host.hostId, endpointHost: new URL(host.endpoint).host, pairedAt: host.pairedAt };
}
