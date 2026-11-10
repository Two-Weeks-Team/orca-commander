/**
 * Decides what to do with each frame the camera reports. A QR code is read many times a second, and a pairing QR carries the
 * device token, so: one inspection at a time, nothing at all once a pairing candidate was found (the user then confirms the
 * host), the same unusable QR is reported once rather than once per frame (also when two unusable QR codes alternate), and
 * the scanned text is never kept (only a short fingerprint, to recognise a repeat).
 */
export type ScanOutcome = 'ignored' | 'candidate' | 'not_pairing' | 'failed';

/** How long an unusable QR is ignored after it was reported. */
const REPEAT_SUPPRESS_MS = 3000;
/** How many recent unusable QR codes are remembered; older ones are forgotten so the memory stays bounded. */
const REMEMBERED_FAILURES = 8;

/** A short digest (length and FNV-1a): enough to recognise a repeat, useless for recovering the text. */
export function fingerprint(data: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data.charCodeAt(i), 0x01000193) >>> 0;
  return `${data.length}:${hash}`;
}

export interface ScanGate {
  handle(data: string): Promise<ScanOutcome>;
}

/** `inspect` decides whether the text is a usable pairing code; it must not pair (the user confirms the host first). */
export function createScanGate(
  inspect: (data: string) => Promise<'candidate' | 'invalid_code'>,
  now: () => number,
): ScanGate {
  let busy = false;
  let closed = false;
  const failures = new Map<string, number>();
  return {
    async handle(data: string): Promise<ScanOutcome> {
      if (closed || busy || typeof data !== 'string') return 'ignored';
      busy = true;
      try {
        const print = fingerprint(data);
        const seenAt = failures.get(print);
        if (seenAt !== undefined && now() - seenAt < REPEAT_SUPPRESS_MS) return 'ignored';
        const remember = () => {
          failures.delete(print);
          failures.set(print, now());
          if (failures.size > REMEMBERED_FAILURES) failures.delete(failures.keys().next().value as string);
        };
        try {
          const result = await inspect(data);
          if (result === 'candidate') {
            closed = true;
            return 'candidate';
          }
          remember();
          return 'not_pairing';
        } catch {
          remember();
          return 'failed';
        }
      } finally {
        busy = false;
      }
    },
  };
}
