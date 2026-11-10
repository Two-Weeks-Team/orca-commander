import { evaluateCompat } from '../upstream/orca/mobile/src/transport/protocol-compat';
import { normalizePairingBase64 } from '../upstream/orca/src/shared/mobile-pairing-base64';
import { PAIRING_INPUT_MAX_CHARACTERS } from '../upstream/orca/src/shared/mobile-pairing-protocol-limits';
import { createPairingOfferSchema, type PairingOffer } from '../upstream/orca/src/shared/mobile-relay-pairing-offer';
import { decodeCanonicalBase64Bytes } from '../upstream/orca/mobile/src/transport/base64-byte-codec';
import { MOBILE_RPC_METHOD_ALLOWLIST } from '../upstream/orca/src/main/runtime/runtime-rpc/runtime-rpc-mobile-method-allowlist';
import { MOBILE_RPC_METHOD_ALLOWLIST as INSTALLED_ALLOWLIST } from '../upstream/orca-1.4.245/src/main/runtime/runtime-rpc/runtime-rpc-mobile-method-allowlist';

export const PINNED_ORCA_COMMIT = '7e935c596129ff9bed35a4eaebd1b0a5668a2b98';
export const INSTALLED_RELEASE_ORCA_COMMIT = '1c6ac8c3c4d2c3dec2cb5966d225ca2a0e0471d3';

// An offline parsing result is never proof of authenticated pairing.
export function inspectPairingCode(code: string, now = Date.now()): PairingOffer | null {
  if (!Number.isFinite(now) || code.length > PAIRING_INPUT_MAX_CHARACTERS) return null;
  try {
    const result = createPairingOfferSchema(() => now).safeParse(
      JSON.parse(atob(normalizePairingBase64(code.trim()))),
    );
    if (!result.success) return null;
    const key = decodeCanonicalBase64Bytes(result.data.publicKeyB64);
    const endpoint = new URL(result.data.endpoint);
    if (key?.length !== 32 || !['ws:', 'wss:'].includes(endpoint.protocol) ||
        endpoint.username || endpoint.password || endpoint.hash || !endpoint.hostname ||
        result.data.scope === 'runtime') return null;
    return result.data;
  } catch {
    // Pairing inputs contain credentials: never include them in exceptions or logs.
    return null;
  }
}

export function inspectProtocolVersion(desktopVersion: unknown, minimumMobile: unknown) {
  if (typeof desktopVersion !== 'number' || !Number.isSafeInteger(desktopVersion) || desktopVersion < 0 ||
      typeof minimumMobile !== 'number' || !Number.isSafeInteger(minimumMobile) || minimumMobile < 0) {
    return { kind: 'blocked', reason: 'invalid_protocol_metadata' } as const;
  }
  return evaluateCompat({ desktopProtocolVersion: desktopVersion, desktopMinCompatibleMobileVersion: minimumMobile });
}

// Protocol 3/minimum 2 is shared by both known releases, but worktree.list is
// absent from 1.4.245. Use the verified common subset; this never sends RPCs.
// currentRequests needs a session/version marker and capability negotiation;
// it is excluded until that contract is integrated. These are method candidates,
// not ready RPCs: session.tabs.list still requires a worktree selector.
const DECK_READ_PROBES = new Set(['status.get', 'worktree.ps', 'session.tabs.list']);

// Method eligibility is not parameter validation, a successful RPC or authority.
export function isSupportedReadProbe(method: string): boolean {
  return DECK_READ_PROBES.has(method) && MOBILE_RPC_METHOD_ALLOWLIST.has(method) && INSTALLED_ALLOWLIST.has(method);
}

export const G0_READINESS = {
  status: 'no-go',
  liveConnectionEnabled: false,
  realControlsEnabled: false,
  missingEvidence: ['android-lan', 'ios-lan', 'operated-relay-eligibility', 'independent-app-relay', 'native-e2ee-host-pin'],
} as const;
