import { requireOptionalNativeModule } from 'expo-modules-core';

export type DeckFeedbackStatus = {
  supported: boolean;
  ready: boolean;
  loading: boolean;
  enabled: boolean;
  captureActive: boolean;
  foreground: boolean;
  loadFailed: boolean;
};
export type DeckClickResult = 'scheduled' | 'disabled' | 'capture_active' | 'background' |
  'not_ready' | 'system_disabled' | 'silent' | 'busy' | 'unavailable' | 'playback_failed';

type NativeDeckFeedback = {
  prepare(): DeckFeedbackStatus;
  configure(enabled: boolean, captureActive: boolean): DeckFeedbackStatus;
  getStatus(): DeckFeedbackStatus;
  playClick(): DeckClickResult;
  dispose(): void;
};

let native: NativeDeckFeedback | null | undefined;
const module = () => native === undefined
  ? (native = requireOptionalNativeModule<NativeDeckFeedback>('DeckFeedback')) : native;
const unavailable = (): DeckFeedbackStatus => ({ supported: false, ready: false, loading: false,
  enabled: false, captureActive: true, foreground: false, loadFailed: false });

/** Loading never plays a sound. Android preparation can return loading=true. */
export const prepareDeckFeedback = (): DeckFeedbackStatus => module()?.prepare() ?? unavailable();
export const configureDeckFeedback = (options: { enabled: boolean; captureActive: boolean }): DeckFeedbackStatus =>
  module()?.configure(options.enabled, options.captureActive) ?? unavailable();
export const getDeckFeedbackStatus = (): DeckFeedbackStatus => module()?.getStatus() ?? unavailable();
/** scheduled means submitted to the OS, never proof of audible output. Requests are never queued. */
export const playDeckClick = (): DeckClickResult => module()?.playClick() ?? 'unavailable';
export const disposeDeckFeedback = (): void => { module()?.dispose(); };
