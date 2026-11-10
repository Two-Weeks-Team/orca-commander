import { requireOptionalNativeModule } from 'expo-modules-core';

export type SpeechLanguage = 'ko-KR' | 'en-US';
export type SpeechUnavailableReason = 'unavailable' | 'loading' | 'background' | 'busy' | 'focus_denied';
export type SpeechPreparation = { ready: boolean; reason?: SpeechUnavailableReason };
export type SpeechAcceptance = { accepted: boolean; reason?: SpeechUnavailableReason };
export type SpeechFinished = { id: string; reason: 'finished' | 'stopped' | 'error' | 'interrupted' };
export type SpeechStarted = { id: string };
export type SpeechEvents = {
  onSpeechFinished: (event: SpeechFinished) => void;
  onSpeechStarted: (event: SpeechStarted) => void;
};
export type SpeechSubscription = { remove(): void };
export interface NativeDeckSpeech {
  prepare(language: SpeechLanguage): Promise<SpeechPreparation>;
  speak(id: string, text: string, language: string, rate: number): Promise<SpeechAcceptance>;
  stop(): Promise<boolean>;
  dispose(): Promise<boolean>;
  addListener<K extends keyof SpeechEvents>(name: K, listener: SpeechEvents[K]): SpeechSubscription;
}
let native: NativeDeckSpeech | null | undefined;
function module(): NativeDeckSpeech | null {
  if (native === undefined) {
    try { native = requireOptionalNativeModule<NativeDeckSpeech>('DeckSpeech'); }
    catch { native = null; }
  }
  return native;
}
/** Native submission is not evidence of audible output. No utterances are queued. */
export const DeckSpeech: NativeDeckSpeech = {
  async prepare(language) {
    try { return await module()?.prepare(language) ?? { ready: false, reason: 'unavailable' }; }
    catch { return { ready: false, reason: 'unavailable' }; }
  },
  async speak(id, text, language, rate) {
    try { return await module()?.speak(id, text, language, rate) ?? { accepted: false, reason: 'unavailable' }; }
    catch { return { accepted: false, reason: 'unavailable' }; }
  },
  async stop() {
    try { return await module()?.stop() ?? false; }
    catch { return false; }
  },
  async dispose() {
    try { return await module()?.dispose() ?? false; }
    catch { return false; }
  },
  addListener(name, listener) { return module()?.addListener(name, listener) ?? { remove() {} }; },
};
export default DeckSpeech;
