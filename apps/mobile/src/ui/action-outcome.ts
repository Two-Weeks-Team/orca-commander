import type { ActionResult, ActionStatus } from '../adapters/action-client';
import { createTranslator, type Translator, type MessageKey } from '../i18n/messages';

type OutcomeMessageKey = Extract<MessageKey, `outcome.${string}`>;
const definite:Record<Exclude<ActionStatus,'partial'|'unknown'>,OutcomeMessageKey>={
 unavailable:'outcome.unavailable', storage_unavailable:'outcome.storageUnavailable', busy:'outcome.busy',
 accepted:'outcome.accepted', target_changed:'outcome.targetChanged', not_connected:'outcome.notConnected',
 expired:'outcome.expired', already_submitted:'outcome.alreadySubmitted', refused:'outcome.refused',
 cursor_required:'outcome.cursorRequired',
};
export function actionOutcomeKey(result:ActionResult):OutcomeMessageKey{
 if(result.status==='partial')return 'outcome.partial';
 if(result.status==='unknown'&&result.bodyAccepted&&result.submitAttempted===null)return 'outcome.submitIntentUnknown';
 if(result.status==='unknown')return result.bodyAccepted
  ? 'outcome.submitUnknown' : 'outcome.bodyUnknown';
 return definite[result.status];
}
export function describeActionOutcome(result:ActionResult,t:Translator=createTranslator('en')):string{
 return t(actionOutcomeKey(result));
}
