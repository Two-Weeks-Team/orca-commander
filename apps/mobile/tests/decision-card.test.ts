import { getAttentionQueue } from '../src/core/attention';
import type { AgentSnapshot } from '../src/core/types';
import { buildDecisionCard as buildDecisionCardForLocale, buildDecisionCards as buildDecisionCardsForLocale, buildDecisionOverview } from '../src/ui/decision-card-model';
import { normalizeWorktreePs } from '../src/adapters/orca-read-model';
import { createTranslator } from '../src/i18n/messages';
const korean = createTranslator('ko');
const buildDecisionCard = (agent: AgentSnapshot, confirmed: boolean, now: number) => buildDecisionCardForLocale(agent, confirmed, now, korean);
const buildDecisionCards = (agents: AgentSnapshot[], confirmed: boolean, now: number) => buildDecisionCardsForLocale(agents, confirmed, now, korean);

let count = 0;
function check(ok: unknown, why: string): asserts ok { count++; if (!ok) throw new Error(why); }
const now = Date.parse('2026-11-02T12:00:00.000Z');
const a: AgentSnapshot = {id:'a',provider:'codex',title:'같은 제목',summary:'변경 범위 확인',state:'question',eventType:'user_question',
  updatedAt:new Date(now-1000).toISOString(),target:{hostId:'h',worktreeId:'w',terminalId:'t',dispatchId:'d',connectionGeneration:1}};
for (const state of ['done','idle','working','unknown'] as const) {
  check(getAttentionQueue([{...a,state}]).length === 0, 'a stale question event cannot turn a non-question state into a blocker');
}
check(getAttentionQueue([{...a,state:'question',eventType:'permission_request'}]).length === 0, 'mismatched permission signal cannot outrank a real question');
const cases: AgentSnapshot[] = [
  {...a,id:'review',state:'review',eventType:'review_required'},
  {...a,id:'failure',state:'failed',eventType:'task_failure'},
  a,
  {...a,id:'permission',state:'permission',eventType:'permission_request',permissionEvidence:'missing'},
];
check(getAttentionQueue(cases).map(x=>x.id).join(',') === 'permission,a,failure,review', 'permission signal, question, failure, review keep priority');
const variants = [a,...(['hostId','worktreeId','terminalId','dispatchId','connectionGeneration'] as const).map(field =>
  ({...a,target:{...a.target,[field]:field==='connectionGeneration'?2:'different'}}))];
check(buildDecisionCards(variants,true,now).length === 6, 'identical titles/ids never merge across any target field');
check(new Set(buildDecisionCards(variants,true,now).map(x=>x.key)).size === 6, 'render keys retain target identity');
check(buildDecisionCards([{...a,target:{...a.target,worktreeId:'a|b',terminalId:'c'}},{...a,target:{...a.target,worktreeId:'a',terminalId:'b|c'}}],true,now).length === 2, 'delimiter-bearing identifiers cannot collide');
const grouped = buildDecisionCards([a,{...a,summary:'최신 관찰',updatedAt:new Date(now).toISOString()}],true,now);
check(grouped.length === 1 && grouped[0].occurrences === 2 && grouped[0].summary === '최신 관찰', 'same event observations retain count and latest content');
const request = {...a,requestId:'request-a'};
check(buildDecisionCards([request,{...request,id:'other-observation'}],true,now)[0].occurrences === 2, 'same target/request can deduplicate across row ids');
check(buildDecisionCards([request,{...request,requestId:'request-b'}],true,now).length === 2, 'separate requests never collapse');
check(buildDecisionCards([a],false,now).length === 0, 'unconfirmed reads cannot enter the decision queue');
check(buildDecisionCards([{...a,state:'unknown'}],true,now).length === 0, 'unknown state cannot enter the decision queue');
check(buildDecisionCards([a],true,NaN).length === 0, 'invalid clock cannot claim current decisions');
const old = buildDecisionCards([{...a,updatedAt:new Date(now-3_600_000).toISOString()}],true,now);
check(old.length === 1 && old[0].stateAge.includes('60분'), 'a freshly read long-waiting question stays visible with its state age');
const unconfirmed = buildDecisionCard(a,false,now);
check(unconfirmed.state === 'unknown' && unconfirmed.advice.kind === 'unconfirmed', 'details also fail closed outside the queue');
const signal = buildDecisionCard({...a,state:'permission',eventType:'permission_request',permissionEvidence:'missing'},true,now);
check(signal.advice.evidence === 'unverified' && signal.evidence.includes('미검증'), 'permission signal carries a visible missing-evidence warning');
const structured = buildDecisionCard({...a,state:'permission',eventType:'permission_request',permissionEvidence:'structured_verified'},true,now);
check(structured.advice.authority === 'read_only' && structured.evidence.includes('이 상태 카드는 승인할 수 없음'), 'verified evidence still cannot enable approval');
for (const evidence of [['structured_verified','missing'],['missing','structured_verified']] as const) {
  const duplicates = evidence.map(permissionEvidence=>({...a,state:'permission' as const,eventType:'permission_request' as const,permissionEvidence}));
  check(buildDecisionCards(duplicates,true,now)[0].advice.evidence === 'unverified', 'equal-time conflicting evidence never upgrades by arrival order');
}
// Authenticated owners see their own host content; future external-AI minimization is a separate boundary.
const ownerCard = buildDecisionCard({...a,title:'token=fixture-value',summary:'담당 first@example.test',target:{...a.target,hostId:'owner-host-id',worktreeId:'repo::/Users/example/project/rudd'}},true,now);
check(ownerCard.title === 'token=fixture-value' && ownerCard.summary === '담당 first@example.test', 'authenticated screen preserves owner titles and summaries even when they resemble secrets or contacts');
check(ownerCard.provenance.find(x=>x.label==='호스트')?.value === 'owner-host-id', 'host provenance remains the actual source identifier');
check(ownerCard.provenance.find(x=>x.label==='워크트리')?.value === 'repo::/Users/example/project/rudd', 'owner can read the complete worktree source');
check(ownerCard.provenance.find(x=>x.label==='터미널')?.value === 't' && ownerCard.provenance.find(x=>x.label==='디스패치')?.value === 'd', 'terminal/dispatch provenance is not replaced with another hash');
check(ownerCard.provenance.length === 5, 'host, worktree, terminal, dispatch and generation are all represented');
for (const worktreeId of ['repo::/Users/example','repo::/home/example','repo::C:\\Users\\example']) {
 check(buildDecisionCard({...a,target:{...a.target,worktreeId}},true,now).provenance.find(x=>x.label==='워크트리')?.value === worktreeId, 'owner paths remain readable in source disclosure');
}
check(a.summary === '변경 범위 확인' && a.target.hostId === 'h', 'building cards does not mutate source snapshots');
const normalized=normalizeWorktreePs({worktrees:[{worktreeId:'w',agents:[{paneKey:'t',state:'waiting',agentType:'codex',updatedAt:now-1000,taskTitle:'토큰 만료 정책: first@example.test',lastAssistantMessage:'token=fixture-value 확인 필요'}]}],totalCount:1,truncated:false},
 {hostId:'h',generation:1,observedAt:now});
check(normalized.ok,'owner-data integration fixture is valid');
if (normalized.ok) {
 const card=buildDecisionCard(normalized.agents[0],true,now);
 check(card.title === '토큰 만료 정책: first@example.test' && card.summary === 'token=fixture-value 확인 필요', 'live adapter-to-card path must not apply external-AI redaction to the owner screen');
}
const nativeOnly={entries:[{items:[]}],asyncEntries:[{questions:[{title:'Native pending question'}]}]};
check(buildDecisionOverview([],nativeOnly,true).count===1&&!buildDecisionOverview([],nativeOnly,true).empty,'native question cannot coexist with zero decision cards or an empty-queue claim');
const combined=buildDecisionOverview(buildDecisionCards([a],true,now),{entries:[{items:[{kind:'approval'},{kind:'question'}]}],asyncEntries:[{questions:[{},{}]}]},true);
check(combined.count===4&&combined.nativeCount===3,'overview counts the rendered state, approval and async cards; aggregated async questions remain one card');
check(buildDecisionOverview([],{entries:[],asyncEntries:[]},true).empty,'only a confirmed empty combined view claims no decisions');
const offlineOverview=buildDecisionOverview(buildDecisionCards([a],true,now),nativeOnly,false);
check(offlineOverview.count===null&&!offlineOverview.empty&&offlineOverview.nativeCount===0,'unconfirmed connection cannot report either zero or current native decisions');
const translated = buildDecisionCardForLocale(a, true, now, createTranslator('en'));
check(translated.key === buildDecisionCard(a, true, now).key && translated.title === a.title && translated.summary === a.summary && translated.reason !== buildDecisionCard(a, true, now).reason && translated.advice.authority === 'read_only', 'locale changes presenter copy without changing source identity, owner content or authority');
console.log(`PASS: ${count} decision-card assertions (pure model, no native UI or commands)`);
