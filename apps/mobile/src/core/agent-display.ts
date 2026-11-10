import type {AgentSnapshot,AgentState} from './types';

/** Orca's freshness bound (agent-status-freshness.ts): a non-done row silent this long no longer proves its state. */
export const AGENT_STATUS_STALE_AFTER_MS=30*60*1000;
export type AgentDisplayKind=AgentState|'monitoring'|'stopping'|'stale'|'unconfirmed';

/**
 * What the desktop row shows, after Orca's agent-row-display and decay rules: an unproven end, a silent non-done row
 * (stale with a live terminal, idle without), a stopping turn, a monitoring turn, otherwise the state. `since` is the
 * moment the age counts from: the last update for a stale row, else when the state began.
 */
export type AgentDisplayFacts=Pick<AgentSnapshot,'state'|'updatedAt'|'stateSince'|'unconfirmed'|'hostOwned'|'livePty'|'stopping'|'monitoring'|'dashboard'>;
export function agentDisplay(agent:AgentDisplayFacts,now:number):{kind:AgentDisplayKind;since:number|null}{
 const updated=Date.parse(agent.updatedAt),began=agent.stateSince?Date.parse(agent.stateSince):NaN;
 const since=agent.dashboard?.stateChangedAt===null?null:Number.isFinite(began)?began:Number.isFinite(updated)?updated:null;
 if(agent.unconfirmed)return{kind:'unconfirmed',since};
 const silent=Number.isFinite(updated)&&now-updated>AGENT_STATUS_STALE_AFTER_MS;
 if(silent&&agent.state!=='done'&&agent.state!=='failed'&&agent.state!=='unknown'&&agent.state!=='review'&&!agent.hostOwned)
  return agent.livePty?{kind:'stale',since:updated}:{kind:'idle',since:updated};
 if(agent.state==='working'&&agent.stopping)return{kind:'stopping',since};
 if(agent.state==='working'&&agent.monitoring)return{kind:'monitoring',since};
 return{kind:agent.state,since};
}

/** "12s" / "5m" / "3h" / "4d" since `since`; null when unknown or in the future. */
export function formatAge(since:number|null|undefined,now:number):string|null{
 const seconds=since===null||since===undefined?NaN:(now-since)/1000;
 if(!Number.isFinite(seconds)||seconds<0)return null;
 return seconds<60?`${Math.floor(seconds)}s`:seconds<3600?`${Math.floor(seconds/60)}m`:seconds<172800?`${Math.floor(seconds/3600)}h`:`${Math.floor(seconds/86400)}d`;
}
