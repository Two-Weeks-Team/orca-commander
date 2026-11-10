import { adviseOffline, inspectAdvisorBudget } from '../src/core/advisor';
import type { AgentSnapshot } from '../src/core/types';
import { createTranslator } from '../src/i18n/messages';

let count = 0;
function check(ok: unknown, why: string): asserts ok { count++; if (!ok) throw new Error(why); }
const base: AgentSnapshot = { id:'a', provider:'codex', title:'fixture-value', summary:'fixture-value', state:'question',
  eventType:'user_question', updatedAt:'2026-11-02T12:00:00.000Z', target:{hostId:'h',worktreeId:'w',terminalId:'t',connectionGeneration:1} };
const budget = { enabled:true, limitTokens:100, usedTokens:60, estimatedTokens:40 };
check(inspectAdvisorBudget(budget) === 'available', 'exact remaining budget fits');
check(inspectAdvisorBudget({...budget,estimatedTokens:41}) === 'exhausted', 'budget cannot overspend by one');
check(inspectAdvisorBudget({...budget,usedTokens:100,estimatedTokens:0}) === 'exhausted', 'fully spent budgets remain exhausted for zero-cost estimates');
check(inspectAdvisorBudget({...budget,limitTokens:0,usedTokens:0,estimatedTokens:0}) === 'exhausted', 'zero budget never enables API work');
check(inspectAdvisorBudget({...budget,enabled:false,limitTokens:NaN}) === 'disabled', 'opt-out remains disabled even with malformed accounting');
for (const field of ['limitTokens','usedTokens','estimatedTokens'] as const) {
  for (const value of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    check(inspectAdvisorBudget({...budget,[field]:value}) === 'invalid', 'invalid accounting fails closed');
  }
}
check(inspectAdvisorBudget({...budget,usedTokens:101}) === 'exhausted', 'previous overspend cannot reopen a budget');
check(inspectAdvisorBudget({...budget,limitTokens:Number.MAX_SAFE_INTEGER,usedTokens:Number.MAX_SAFE_INTEGER-1,estimatedTokens:2}) === 'exhausted', 'integer boundary avoids addition overflow');
const rules = adviseOffline(base, true);
const koreanRules = adviseOffline(base, true, createTranslator('ko'));
check(rules.guidanceKey === 'advice.question' && koreanRules.guidanceKey === rules.guidanceKey, 'locale changes presentation, never the guidance classification');
check(koreanRules.guidance !== rules.guidance && koreanRules.authority === rules.authority, 'injected locale translates copy without changing authority');
check(rules.source === 'rules' && rules.kind === 'question', 'confirmed question gets offline rules');
check(!JSON.stringify(rules).includes('fixture-value'), 'advice never echoes untrusted title/summary');
check(rules.guidance.length > 0 && rules.authority === 'read_only', 'rules provide guidance with no command authority');
for (const verdict of [inspectAdvisorBudget({...budget,enabled:false}),inspectAdvisorBudget({...budget,estimatedTokens:41}),inspectAdvisorBudget({...budget,usedTokens:NaN})]) {
  check(verdict !== 'available' && adviseOffline(base,true).kind === 'question', 'disabled/invalid/exhausted model budget cannot disable rules fallback');
}
check(adviseOffline(base,false).kind === 'unconfirmed', 'unconfirmed snapshots never receive decision guidance');
check(adviseOffline({...base,state:'unknown'},true).kind === 'unconfirmed', 'unknown state suppresses decision guidance');
const missing = adviseOffline({...base,state:'permission',eventType:'permission_request',permissionEvidence:'missing'},true);
const verified = adviseOffline({...base,state:'permission',eventType:'permission_request',permissionEvidence:'structured_verified'},true);
check(missing.evidence === 'unverified' && verified.evidence === 'structured', 'permission signal and verified evidence stay distinct');
check(missing.authority === 'read_only' && verified.authority === 'read_only', 'even structured evidence confers no mobile approval authority');
check(adviseOffline({...base,state:'done',eventType:'permission_request'},true).kind === 'informational', 'contradictory completed state never becomes an approval cue');
for (const [state,eventType,kind] of [['failed','task_failure','failure'],['review','review_required','review'],['working','informational','informational']] as const) {
  check(adviseOffline({...base,state,eventType},true).kind === kind, 'fixed rules classify confirmed states without any external model');
}
console.log(`PASS: ${count} offline advisor assertions (no model, key, network or commands)`);
