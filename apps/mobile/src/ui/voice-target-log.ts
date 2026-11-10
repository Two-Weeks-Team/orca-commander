import {createTranslator,type PlainMessageKey} from '../i18n/messages';
export type VoiceTargetStage='captured'|'changed'|'retained'|'no_target'|'hidden'|'suppressed'|'navigate'|'callback_failed'|'empty';
const keys:Record<VoiceTargetStage,PlainMessageKey>={captured:'voice.targetStageCaptured',changed:'voice.targetStageChanged',retained:'voice.targetStageRetained',no_target:'voice.targetStageNone',hidden:'voice.targetStageHidden',suppressed:'voice.targetStageSuppressed',navigate:'voice.targetStageNavigate',callback_failed:'voice.targetStageCallbackFailed',empty:'voice.targetStageEmpty'};
/** Fixed built-in stage names only. This API cannot accept a body or target identifier. */
export function logVoiceTargetStage(stage:VoiceTargetStage):void{
 try{console.info('[DeckVoice]',createTranslator('ko')(keys[stage]));}catch{/* Diagnostics never own capture settlement. */}
}
