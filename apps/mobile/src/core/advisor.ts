import type { AgentSnapshot } from './types';
import { createTranslator, type Translator } from '../i18n/messages';

export type BudgetVerdict = 'disabled' | 'invalid' | 'exhausted' | 'available';
export interface AdvisorBudget { enabled: boolean; limitTokens: number; usedTokens: number; estimatedTokens: number }
export interface OfflineAdvice {
  source: 'rules';
  kind: 'question' | 'permission' | 'failure' | 'review' | 'informational' | 'unconfirmed';
  guidance: string;
  guidanceKey: typeof guidanceKeys[keyof typeof guidanceKeys];
  evidence: 'unverified' | 'structured' | 'state_only';
  authority: 'read_only';
}
const guidanceKeys = {
  unconfirmed: 'advice.unconfirmed', permission: 'advice.permission', question: 'advice.question',
  failure: 'advice.failure', review: 'advice.review', informational: 'advice.informational',
} as const;
/** Accounting only: even `available` never initiates or authorizes an API request. */
export function inspectAdvisorBudget(config: AdvisorBudget): BudgetVerdict {
  if (config.enabled === false) return 'disabled';
  if (config.enabled !== true || ![config.limitTokens,config.usedTokens,config.estimatedTokens].every(n => Number.isSafeInteger(n) && n >= 0)) return 'invalid';
  if (config.usedTokens >= config.limitTokens || config.estimatedTokens > config.limitTokens - config.usedTokens) return 'exhausted';
  return 'available';
}

/** Fixed local rules. Untrusted titles, summaries and targets cannot become instructions or authority. */
export function adviseOffline(agent: AgentSnapshot, confirmed: boolean, t: Translator = createTranslator('en')): OfflineAdvice {
  const advice = (kind: OfflineAdvice['kind'], evidence: OfflineAdvice['evidence'] = 'state_only'): OfflineAdvice =>
    ({source:'rules',kind,guidanceKey:guidanceKeys[kind],guidance:t(guidanceKeys[kind]),evidence,authority:'read_only'});
  if (!confirmed || agent.state === 'unknown') return advice('unconfirmed');
  if (agent.state === 'permission' && agent.eventType === 'permission_request') return advice('permission',
    agent.permissionEvidence === 'structured_verified' ? 'structured' : 'unverified');
  if (agent.state === 'question' && agent.eventType === 'user_question') return advice('question');
  if (agent.state === 'failed' && agent.eventType === 'task_failure') return advice('failure');
  if (agent.state === 'review' && agent.eventType === 'review_required') return advice('review');
  return advice('informational');
}
