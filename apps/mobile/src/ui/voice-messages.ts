import type { DictationSnapshot, VoiceAvailability } from '../adapters/host-dictation';
import type { PlainMessageKey } from '../i18n/messages';

export const voiceAvailabilityKeys = {
 unknown:'voice.unknown', disabled:'voice.disabled', model_missing:'voice.modelMissing', model_not_ready:'voice.modelNotReady',
 ready_local:'voice.local', ready_cloud:'voice.cloud', unavailable:'voice.unavailable'
} as const satisfies Record<VoiceAvailability,PlainMessageKey>;
export const voiceErrorKeys = {
 microphone_denied:'voice.microphoneDenied', capture_failed:'voice.captureFailed', connection_lost:'voice.connectionLost',
 host_failed:'voice.hostFailed', interrupted:'voice.interrupted', audio_overflow:'voice.overflow'
} as const satisfies Record<NonNullable<DictationSnapshot['error']>,PlainMessageKey>;
