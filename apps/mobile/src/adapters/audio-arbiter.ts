export type AudioLeaseKind = 'mic' | 'speech';
const leaseBrand: unique symbol = Symbol('deck-audio-lease');
/** Ownership is object identity; copying its shape never transfers authority. */
export type AudioLease = Readonly<{ readonly [leaseBrand]: true }>;
export type AudioArbiterSnapshot = Readonly<{ kind: AudioLeaseKind | null }>;
export interface AudioArbiter {
 acquire(kind: AudioLeaseKind): AudioLease | null;
 release(lease: AudioLease): boolean;
 getSnapshot(): AudioArbiterSnapshot;
 subscribe(listener: () => void): () => void;
}

/** Process-local exclusion only. Callers release after their native teardown is confirmed. */
export function createAudioArbiter(): AudioArbiter {
 let owner: AudioLease | null = null;
 const idle: AudioArbiterSnapshot = Object.freeze({kind:null});
 let snapshot = idle;
 const listeners = new Set<() => void>();
 const publish = () => {
  for (const listener of [...listeners]) {
   try { listener(); } catch { /* An observer cannot own or prevent audio cleanup. */ }
  }
 };
 return {
  acquire(kind) {
   if (owner !== null || (kind !== 'mic' && kind !== 'speech')) return null;
   owner = Object.freeze({[leaseBrand]:true as const});
   snapshot = Object.freeze({kind});
   const lease = owner;
   publish();
   return lease;
  },
  release(lease) {
   if (owner === null || owner !== lease) return false;
   owner = null;
   snapshot = idle;
   publish();
   return true;
  },
  getSnapshot: () => snapshot,
  subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
 };
}

/** Every native microphone and speech adapter must use this same instance. */
export const audioArbiter = createAudioArbiter();
