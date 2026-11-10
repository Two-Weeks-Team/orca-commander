import { adviseOffline } from '../core/advisor';
import type { OfflineAdvice } from '../core/advisor';
import { attentionScore, getAttentionQueue } from '../core/attention';
import type { AgentSnapshot } from '../core/types';
import { createTranslator, type Translator, type MessageKey } from '../i18n/messages';

export interface DecisionCardModel {
  key: string;
  provider: AgentSnapshot['provider'];
  state: AgentSnapshot['state'];
  title: string;
  summary: string;
  reason: string;
  impact: string;
  evidence: string;
  freshness: string;
  stateAge: string;
  advice: OfflineAdvice;
  provenance: {label:string;value:string}[];
  occurrences: number;
}
export function buildDecisionOverview(cards:readonly DecisionCardModel[],native:{entries:readonly {items:readonly unknown[]}[];asyncEntries:readonly unknown[]},confirmed:boolean):{count:number|null;empty:boolean;nativeCount:number}{
 // Count displayed cards, not inferred unique tasks across unrelated status/request identities.
 const nativeCount=confirmed?native.entries.reduce((count,entry)=>count+entry.items.length,0)+native.asyncEntries.length:0;
 const count=confirmed?cards.length+nativeCount:null;
 return {count,empty:count===0,nativeCount};
}
// Exact source identity for grouping and local selection. This contains no pairing credentials.
const identity = (a: AgentSnapshot) => JSON.stringify([a.provider,a.target.hostId,a.target.connectionGeneration ?? null,
  a.target.worktreeId,a.target.terminalId ?? null,a.target.dispatchId ?? null,a.state,a.eventType,
  a.requestId === undefined ? ['row',a.id] : ['request',a.requestId]]);
const reasons: Record<OfflineAdvice['kind'],Extract<MessageKey, `card.reason.${string}`>> = {
  permission:'card.reason.permission', question:'card.reason.question', failure:'card.reason.failure',
  review:'card.reason.review', informational:'card.reason.informational', unconfirmed:'card.reason.unconfirmed',
};

export function buildDecisionCard(agent: AgentSnapshot, confirmed: boolean, now: number, t: Translator = createTranslator('en')): DecisionCardModel {
  const reference = (value?: string) => value ?? t('common.notProvided');
  const current = confirmed && Number.isFinite(now) && agent.state !== 'unknown';
  const advice = adviseOffline(agent,current,t);
  const age = now - Date.parse(agent.updatedAt);
  const stateAge = !Number.isFinite(age) || age < 0 ? t('card.stateAgeUnknown')
    : age < 60_000 ? t('card.stateAgeSeconds', { seconds: Math.floor(age/1000) }) : t('card.stateAgeMinutes', { minutes: Math.floor(age/60_000) });
  const evidence = advice.kind === 'permission'
    ? advice.evidence === 'structured' ? t('card.evidence.structured') : t('card.evidence.signal')
    : current ? t('card.evidence.host') : t('card.evidence.unconfirmed');
  return {
    key:identity(agent),provider:agent.provider,state:current ? agent.state : 'unknown',
    title:agent.title || t('card.noTitle'),summary:agent.summary || t('card.noSummary'),
    reason:t(reasons[advice.kind]),impact:t('card.impact'),evidence,
    freshness:current ? t('card.fresh') : t('card.notFresh'),stateAge,advice,
    provenance:[
      {label:t('field.host'),value:reference(agent.target.hostId)},
      {label:t('field.worktree'),value:agent.target.worktreeId},
      {label:t('field.terminal'),value:reference(agent.target.terminalId)},
      {label:t('field.dispatch'),value:reference(agent.target.dispatchId)},
      {label:t('field.generation'),value:Number.isSafeInteger(agent.target.connectionGeneration) && (agent.target.connectionGeneration ?? -1) >= 0 ? String(agent.target.connectionGeneration) : t('common.unconfirmedValue')},
    ],
    occurrences:1,
  };
}

export function buildDecisionCards(agents: AgentSnapshot[], confirmed: boolean, now: number, t: Translator = createTranslator('en')): DecisionCardModel[] {
  if (!confirmed || !Number.isFinite(now)) return [];
  const groups = new Map<string,{agent:AgentSnapshot;count:number}>();
  for (const agent of getAttentionQueue(agents)) {
    const key = identity(agent);
    const existing = groups.get(key);
    if (!existing) groups.set(key,{agent,count:1});
    else {
      existing.count++;
      // Equal-time conflicting permission evidence must never be upgraded by arrival order.
      if (agent.updatedAt === existing.agent.updatedAt && agent.permissionEvidence !== 'structured_verified') existing.agent = agent;
    }
  }
  return [...groups.values()].map(({agent,count})=>({...buildDecisionCard(agent,true,now,t),occurrences:count}));
}

export type AgentSearchScope='all'|'attention'|'working'|'done'|'unknown';
/** Local literal search only. Retains source objects and exact IDs; never sends owner content anywhere. */
export function filterAgents(agents:readonly AgentSnapshot[],query:string,scope:AgentSearchScope='all'):AgentSnapshot[]{
 const fold=(text:string)=>text.normalize('NFKC').toLowerCase();
 const terms=fold(query).trim().split(/\s+/u).filter(Boolean);
 return agents.filter(agent=>{
  if(scope==='attention'?attentionScore(agent)===0:scope!=='all'&&agent.state!==scope)return false;
  if(terms.length===0)return true;
  const source=fold([agent.provider,agent.title,agent.summary,agent.target.worktreeId,agent.target.hostId,agent.target.terminalId??''].join('\n'));
  return terms.every(term=>source.includes(term));
 });
}
