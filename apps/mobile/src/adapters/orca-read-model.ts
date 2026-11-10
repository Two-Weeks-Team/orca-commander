import type { AgentSnapshot, AttentionType } from '../core/types';
import {AGENT_STATUS_STALE_AFTER_MS} from '../core/agent-display';

/**
 * Pure normalization of original Orca read RPC results into Deck snapshots.
 * It never contacts a host and never produces structured permission proof:
 * worktree.ps reports an agent state, not a verified permission request.
 */

export interface NormalizeContext {
  hostId: string;
  generation: number;
  /** Conservative freshness basis: when the request was issued, never when the response arrived. */
  observedAt: number;
  /** Phone time compared with host row timestamps for clock skew; defaults to observedAt. */
  skewReference?: number;
}

export type NormalizeFailure = 'malformed' | 'truncated_listing' | 'duplicate_identity';

export interface PaneInventoryEvidence {hostId:string;generation:number;observedAt:number;worktreeIds:readonly string[];complete:boolean;scopeIdentity?:string;ambiguousPanes?:readonly string[];/** The desktop's active worktree, also when it has no agent rows. */activeWorktreeId?:string}

export type NormalizeResult =
  | { ok: true; agents: AgentSnapshot[]; inventory:PaneInventoryEvidence }
  | { ok: false; reason: NormalizeFailure };

type Rec = Record<string, unknown>;
type Mapped = { state: AgentSnapshot['state']; eventType: AttentionType };

const MAX_DATE_MS = 8.64e15;
/** Host and phone clocks cannot be compared exactly; a few seconds ahead keeps the state, more fails closed. */
const SKEW_TOLERANCE_MS = 5_000;

const isRec = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value : undefined);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Agent-controlled text: drop terminal escapes and non-layout controls; retain LF/TAB and whole received fields. */
function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  const stripped = value
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '');
  return stripped;
}

const SORT_FIELDS=['hostId','isMainWorktree','lastActivityAt','createdAt','sortOrder','manualOrder','smartTier','smartAt','sortedByStamps','unread','isPinned','status','sidebarStatus','hasHostSidebarActivity','liveTerminalCount'] as const;
/** Copies only bounded scalar ordering inputs; no titles, paths or bodies. */
function sortInputs(worktree: Record<string, unknown>): Record<string, number | boolean | string | null> {
  const out: Record<string, number | boolean | string | null> = {};
  for (const key of SORT_FIELDS) {
    const value = worktree[key];
    if (typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean' || value === null) out[key] = value;
    else if (typeof value === 'string' && value.length <= 64) out[key] = value;
  }
  return out;
}

function firstClean(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const value = clean(candidate);
    if (value.trim()) return value;
  }
  return '';
}

function provider(agentType: unknown): AgentSnapshot['provider'] {
  const name = typeof agentType === 'string' ? agentType.toLowerCase() : '';
  return name === 'claude' || name === 'codex' ? name : 'other';
}

const UNKNOWN: Mapped = { state: 'unknown', eventType: 'informational' };
const OUTCOMES = new Set(['success', 'failure', 'cancellation', 'superseded', 'interruption', 'unconfirmed']);

/**
 * The finished-turn verdict, following the original host (agent-main-agent-verdict.ts):
 * a live lead has none; an explicit outcome wins; legacy interrupted-on-done means cancellation.
 */
function turnVerdict(agent: Rec): string | null | 'unrecognized' {
  const main = agent.mainAgent;
  if (main !== undefined && !isRec(main)) return 'unrecognized';
  if (main && main.state !== 'done') return null;
  const outcome = main?.outcome;
  if (outcome !== undefined) return typeof outcome === 'string' && OUTCOMES.has(outcome) ? outcome : 'unrecognized';
  return agent.state === 'done' && agent.interrupted === true ? 'cancellation' : null;
}

function mapState(agent: Rec): Mapped {
  // A row restored after a host restart has not been confirmed, whatever its state says.
  if (agent.restoredUnconfirmed === true) return UNKNOWN;
  // The host only keeps `interrupted` on done rows; elsewhere the row contradicts itself.
  if (agent.interrupted === true && agent.state !== 'done') return UNKNOWN;
  const verdict = turnVerdict(agent);
  if (verdict === 'unrecognized') return UNKNOWN;
  // Faults outrank the combined state, as in the host's own display.
  if (verdict === 'failure' || verdict === 'interruption') return { state: 'failed', eventType: 'task_failure' };
  if(agent.agentType==='claude'&&(agent.state==='waiting'||agent.state==='blocked'))
    return isRec(agent.programStatus)&&agent.programStatus.kind==='permission'?{state:'permission',eventType:'permission_request'}:{state:'question',eventType:'user_question'};
  switch (agent.state) {
    // Original terminal.agentStatus has an explicit idle value even without a hook row.
    case 'idle': return { state: 'idle', eventType: 'informational' };
    case 'working': return { state: 'working', eventType: 'informational' };
    // Both mean the agent needs the human; neither is a structured permission request.
    case 'blocked': return { state: 'permission', eventType: 'permission_request' };
    case 'waiting': return { state: 'question', eventType: 'user_question' };
    case 'done':
      if (verdict === 'cancellation' || verdict === 'superseded') return { state: 'idle', eventType: 'informational' };
      if (verdict === 'unconfirmed') return UNKNOWN;
      return { state: 'done', eventType: 'informational' };
    default: return UNKNOWN;
  }
}

export interface TerminalAgentRow {
  handle:string;worktreeId:string;tabId:string;leafId:string;agentIdentity:string;title:string;
}
export interface TerminalAgentEvidence {catalog:unknown;statuses:ReadonlyMap<string,unknown>;ui?:unknown}
/** Original terminal.list identity only; never infer an agent from owner-controlled title text. */
export function terminalAgentCandidates(catalog:unknown):TerminalAgentRow[] {
  if(!isRec(catalog)||!Array.isArray(catalog.terminals))return [];
  const rows:TerminalAgentRow[]=[];
  for(const raw of catalog.terminals){
    if(!isRec(raw)||raw.connected!==true||raw.orphaned!==false)continue;
    const handle=text(raw.handle),worktreeId=text(raw.worktreeId),tabId=text(raw.tabId),leafId=text(raw.leafId),agentIdentity=text(raw.agentIdentity);
    if(!handle||!worktreeId||!tabId||!leafId||!agentIdentity)continue;
    rows.push({handle,worktreeId,tabId,leafId,agentIdentity,title:clean(raw.title)});
  }
  return rows;
}
function terminalCatalogComplete(catalog:unknown):boolean {
  if(!isRec(catalog)||!Array.isArray(catalog.terminals)||catalog.truncated!==false||catalog.totalCount!==catalog.terminals.length)return false;
  const scope=catalog.hostScope;
  return isRec(scope)&&Array.isArray(scope.hostIds)&&scope.hostIds.every(id=>typeof id==='string')&&Array.isArray(scope.omittedHostIds)&&scope.omittedHostIds.length===0;
}

/** Host names win; remove only an exact workspace suffix from a fallback terminal label. */
function conversationTitle(worktree:Rec,agent:Rec):string {
  const title=firstClean(agent.conversationName,agent.taskTitle,agent.displayName,worktree.displayName)||clean(worktree.worktreeId);
  const suffix=` | ${clean(worktree.displayName)}`;
  return suffix.length>3&&title.endsWith(suffix)?title.slice(0,-suffix.length).trimEnd():title;
}
/** 1.4.247 dashboard-row-bucket: read done -> idle; monitoring remains working; no output-clock recency. */
function dashboardProjection(agent:Rec,worktree:Rec,ui:unknown,now:number):NonNullable<AgentSnapshot['dashboard']>{
  const state=agent.state,started=agent.stateStartedAt;
  const changed=typeof started==='number'&&Number.isFinite(started)&&started>0&&started<=MAX_DATE_MS?started:null;
  const persisted=isRec(ui)&&isRec(ui.ui)?ui.ui:undefined;
  const acknowledgments=persisted&&isRec(persisted.acknowledgedAgentsByPaneKey)?persisted.acknowledgedAgentsByPaneKey:undefined;
  const acknowledgment=typeof agent.paneKey==='string'?acknowledgments?.[agent.paneKey]:undefined;
  const ack=typeof acknowledgment==='number'&&Number.isFinite(acknowledgment)?acknowledgment:0;
  const unread=agent.titleDerived!==true&&changed!==null&&ack<changed;
  const stale=state!=='done'&&agent.structuredHostOwned!==true&&typeof agent.updatedAt==='number'&&now-agent.updatedAt>AGENT_STATUS_STALE_AFTER_MS;
  const bucket=stale||agent.restoredUnconfirmed===true?'idle':state==='blocked'||state==='waiting'?'attention':state==='working'?'working':state==='done'&&unread?'done':'idle';
  // The paired settings projection does not expose showIdle. Deck uses the original default (hidden idle).
  return{bucket,visible:bucket!=='idle'&&worktree.isArchived!==true,stateChangedAt:agent.titleDerived===true?null:changed};
}

export function normalizeWorktreePs(result: unknown, ctx: NormalizeContext, terminals?:TerminalAgentEvidence): NormalizeResult {
  if (!isRec(result) || !Array.isArray(result.worktrees)) return { ok: false, reason: 'malformed' };
  // Completeness evidence is required: both fields are part of the original result type.
  if (typeof result.truncated !== 'boolean' || !isCount(result.totalCount)) return { ok: false, reason: 'malformed' };
  if (result.hostScope !== undefined) {
    const scope = result.hostScope;
    if (!isRec(scope) || !Array.isArray(scope.omittedHostIds) || !scope.omittedHostIds.every(id => typeof id === 'string')) {
      return { ok: false, reason: 'malformed' };
    }
    // Only paired runtime peers own their control planes; any other omitted host is a gap.
    if (!scope.omittedHostIds.every(id => (id as string).startsWith('runtime:'))) return { ok: false, reason: 'truncated_listing' };
  }
  if (result.truncated || result.totalCount !== result.worktrees.length) return { ok: false, reason: 'truncated_listing' };

  const skewReference = ctx.skewReference ?? ctx.observedAt;
  const agents: AgentSnapshot[] = [];
  const identities = new Set<string>(),ambiguous=new Set<string>(),worktrees=new Set<string>();
  const scope=result.hostScope;
  const scopeIdentity=isRec(scope)&&Array.isArray(scope.hostIds)&&scope.hostIds.every(id=>typeof id==='string')&&Array.isArray(scope.omittedHostIds)?JSON.stringify([[...scope.hostIds].sort(),[...scope.omittedHostIds].sort()]):undefined;
  let complete=isRec(scope)&&Array.isArray(scope.hostIds)&&scope.hostIds.every(id=>typeof id==='string')&&new Set(scope.hostIds).size===scope.hostIds.length&&Array.isArray(scope.omittedHostIds)&&scope.omittedHostIds.length===0;
  const candidates=terminalAgentCandidates(terminals?.catalog);
  const terminalPanes=new Map<string,Rec[]>();
  if(isRec(terminals?.catalog)&&Array.isArray(terminals.catalog.terminals))for(const raw of terminals.catalog.terminals){
    if(!isRec(raw)||!text(raw.worktreeId)||!text(raw.tabId)||!text(raw.leafId))continue;
    const identity=JSON.stringify([raw.worktreeId,`${raw.tabId}:${raw.leafId}`]);
    terminalPanes.set(identity,[...(terminalPanes.get(identity)??[]),raw]);
  }
  if(terminals)complete=complete&&terminalCatalogComplete(terminals.catalog);
  const handleCounts=new Map<string,number>(),paneCounts=new Map<string,number>();
  for(const row of candidates){const pane=JSON.stringify([row.worktreeId,`${row.tabId}:${row.leafId}`]);handleCounts.set(row.handle,(handleCounts.get(row.handle)??0)+1);paneCounts.set(pane,(paneCounts.get(pane)??0)+1);}
  let worktreeRank=-1;let activeWorktreeId:string|undefined;
  for (const worktree of result.worktrees) {
    if (!isRec(worktree)) return { ok: false, reason: 'malformed' };
    worktreeRank++;let agentRank=-1;
    if(worktree.isActive===true&&activeWorktreeId===undefined)activeWorktreeId=text(worktree.worktreeId);
    const worktreeId = text(worktree.worktreeId);
    if (!worktreeId || !Array.isArray(worktree.agents)) return { ok: false, reason: 'malformed' };
    if(worktrees.has(worktreeId))return{ok:false,reason:'duplicate_identity'};worktrees.add(worktreeId);
    complete=complete&&worktree.unverifiableTerminalCount===0&&typeof worktree.hostId==='string'&&isRec(scope)&&Array.isArray(scope.hostIds)&&scope.hostIds.includes(worktree.hostId);
    // worktree.hostId is Orca's execution-host id ('local', 'ssh:<id>', 'runtime:<id>'), not Deck's host id.

    const worktreeAgents=[...worktree.agents];
    const hookPanes=new Set(worktreeAgents.flatMap(agent=>isRec(agent)&&typeof agent.paneKey==='string'?[agent.paneKey]:[]));
    for(const row of candidates){
      if(row.worktreeId!==worktreeId)continue;
      const paneKey=`${row.tabId}:${row.leafId}`;if(hookPanes.has(paneKey))continue;
      const identity=JSON.stringify([worktreeId,paneKey]);
      const raw=terminals?.statuses.get(row.handle),status=isRec(raw)&&isRec(raw.agentStatus)?raw.agentStatus:undefined;
      const valid=status?.handle===row.handle&&typeof status.isRunningAgent==='boolean'&&(status.status===null||status.status==='idle'||status.status==='working'||status.status==='permission');
      const duplicate=(handleCounts.get(row.handle)??0)>1||(paneCounts.get(identity)??0)>1;
      if(valid&&status.isRunningAgent===false&&!duplicate)continue;
      const known=valid&&status.isRunningAgent===true&&!duplicate;
      if(!known)complete=false;
      if(duplicate)ambiguous.add(identity);
      worktreeAgents.push({paneKey,agentType:row.agentIdentity,conversationName:row.title||worktree.displayName,lastAssistantMessage:'',updatedAt:ctx.observedAt,titleDerived:true,hasLivePty:true,state:known?(status.status==='permission'?'waiting':status.status??'idle'):'unknown'});
    }
    for (const agent of worktreeAgents) {
      if (!isRec(agent)) return { ok: false, reason: 'malformed' };
      agentRank++;
      const paneKey = text(agent.paneKey);
      const updated = agent.updatedAt;
      if (!paneKey || typeof updated !== 'number' || !Number.isFinite(updated) || Math.abs(updated) > MAX_DATE_MS) {
        return { ok: false, reason: 'malformed' };
      }
      const identity = JSON.stringify([worktreeId, paneKey]);
      if (identities.has(identity)) { ambiguous.add(identity);complete=false; }
      identities.add(identity);
      const paneRows=terminalPanes.get(identity)??[],terminal=paneRows.length===1?paneRows[0]:undefined;
      const hostTime=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=MAX_DATE_MS?value:null;
      const terminalActivity=terminals?{present:terminal?.connected===true&&terminal.orphaned===false,lastOutputAt:hostTime(terminal?.lastOutputAt),stateStartedAt:agent.titleDerived===true?null:hostTime(agent.stateStartedAt)}:undefined;

      const skewed = updated - skewReference > SKEW_TOLERANCE_MS;
      const mapped = skewed ? UNKNOWN : mapState(agent);
      // The reducer requires event time <= observation time, so a small skew is clamped.
      const eventAt = skewed ? ctx.observedAt : Math.min(updated, ctx.observedAt);
      // Desktop row facts beyond the state: when it began, a stop in progress, an unproven end, who owns the child.
      const main = isRec(agent.mainAgent) ? agent.mainAgent : undefined;
      const began = mapped.state === 'failed' && main ? main.stateStartedAt : agent.stateStartedAt;
      const facts = skewed ? {} : {
        ...(agent.agentType==='claude'&&(agent.state==='waiting'||agent.state==='blocked')?{terminalPrompt:{state:agent.state as 'waiting'|'blocked',kind:mapped.state==='permission'?'permission' as const:'question' as const,...(typeof agent.toolName==='string'&&agent.toolName.length<=128&&clean(agent.toolName)?{toolName:clean(agent.toolName)}:{})}}:{}),
        ...(typeof began === 'number' && Number.isFinite(began) && Math.abs(began) <= MAX_DATE_MS ? { stateSince: new Date(Math.min(began, ctx.observedAt)).toISOString() } : {}),
        ...(mapped.state === 'working' && main?.stopping === true ? { stopping: true as const } : {}),
        ...(mapped.state === 'unknown' && turnVerdict(agent) === 'unconfirmed' && agent.restoredUnconfirmed !== true ? { unconfirmed: true as const } : {}),
        ...(agent.structuredHostOwned === true ? { hostOwned: true as const } : {}),
        ...(agent.hasLivePty === true ? { livePty: true as const } : {}),
      };
      agents.push({
        id: `${worktreeId}::${paneKey}`,
        provider: provider(agent.agentType),
        // 1.4.246 hosts publish the desktop row name (rename, chat or live title) as conversationName.
        title: conversationTitle(worktree,agent),
        dashboard: dashboardProjection(agent,worktree,terminals?.ui,skewReference),
        ...(terminalActivity?{terminalActivity}:{}),
        summary: clean(agent.lastAssistantMessage ?? worktree.preview),
        state: mapped.state,
        eventType: mapped.eventType,
        target: { hostId: ctx.hostId, connectionGeneration: ctx.generation, worktreeId, terminalId: paneKey },
        updatedAt: new Date(eventAt).toISOString(),
        permissionEvidence: 'missing',
        ...(mapped.state === 'working' && agent.workingMode === 'monitoring' ? { monitoring: true as const } : {}),
        ...facts,
        place: {
          repoId: text(worktree.repoId) ?? '', repo: clean(worktree.repo), worktreeName: clean(worktree.displayName) || clean(worktreeId),
          worktreeActive: worktree.isActive === true, worktreeRank, agentRank, sort: sortInputs(worktree), parentPaneKey: text(agent.parentPaneKey),
        },
      });
    }
  }
  if(candidates.some(row=>!worktrees.has(row.worktreeId)))complete=false;
  // Preserve one inert unknown row for other read surfaces; no arbitrary duplicate wins authority.
  const seen=new Set<string>();
  const reconciled=agents.filter(agent=>{const key=JSON.stringify([agent.target.worktreeId,agent.target.terminalId]);if(seen.has(key))return false;seen.add(key);return true;}).map(agent=>ambiguous.has(JSON.stringify([agent.target.worktreeId,agent.target.terminalId]))?{...agent,state:'unknown' as const,eventType:'informational' as const,requestId:undefined,permissionEvidence:'missing' as const}:agent);
  return { ok: true, agents:reconciled, inventory:{hostId:ctx.hostId,generation:ctx.generation,observedAt:ctx.observedAt,worktreeIds:[...worktrees],complete,scopeIdentity,ambiguousPanes:[...ambiguous],activeWorktreeId} };
}

export interface RuntimeStatus {
  appVersion?: string;
  runtimeId: string;
  protocolVersion: number;
  minCompatibleMobileVersion: number;
  capabilities: readonly string[];
  ready: boolean;
}

export function parseStatus(result: unknown): { ok: true; status: RuntimeStatus } | { ok: false } {
  if (!isRec(result)) return { ok: false };
  const runtimeId = text(result.runtimeId);
  const { protocolVersion, minCompatibleMobileVersion } = result;
  if (!runtimeId || !isCount(protocolVersion) || !isCount(minCompatibleMobileVersion)) return { ok: false };
  const capabilities = result.capabilities ?? [];
  if (!Array.isArray(capabilities) || !capabilities.every(item => typeof item === 'string')) return { ok: false };
  return { ok: true, status: { appVersion: typeof result.appVersion==='string'&&result.appVersion.length>0&&result.appVersion.length<=128?result.appVersion:undefined, runtimeId, protocolVersion, minCompatibleMobileVersion, capabilities, ready: result.graphStatus === 'ready' } };
}

export interface TabsPublication { epoch: string; version: number }
export interface TabSummary { id: string; type: string; title?: string; status?: string; terminal?: string; isActive?: boolean; /** Terminal tabs: the desktop tab and split leaf, i.e. the agent row's paneKey `${parentTabId}:${leafId}`. */ parentTabId?: string; leafId?: string }
export interface TabsSnapshot {
  worktree: string;
  publication: TabsPublication;
  tabs: TabSummary[];
  /** False for the host's "ask later" placeholder epoch; an empty tab list then is not evidence that tabs closed. */
  published: boolean;
  /** False when the host says some rows are unreconciled or unverifiable, so absence proves nothing. */
  complete: boolean;
  /** The host's active tab for this worktree (follows the desktop until this device activates a tab itself). */
  activeTabId?: string;
}

export function parseTabsSnapshot(result: unknown): { ok: true; snapshot: TabsSnapshot } | { ok: false } {
  if (!isRec(result)) return { ok: false };
  const worktree = text(result.worktree);
  const epoch = text(result.publicationEpoch);
  const version = result.snapshotVersion;
  if (!worktree || !epoch || !isCount(version) || !Array.isArray(result.tabs)) return { ok: false };
  const tabs: TabSummary[] = [];
  for (const tab of result.tabs) {
    if (!isRec(tab)) return { ok: false };
    const id = text(tab.id);
    const type = text(tab.type);
    if (!id || !type) return { ok: false };
    tabs.push({ id, type, title: text(tab.title), status: text(tab.status), terminal: text(tab.terminal), isActive: tab.isActive === true ? true : undefined, parentTabId: text(tab.parentTabId), leafId: text(tab.leafId) });
  }
  const published = epoch !== 'none' && !epoch.startsWith('none:');
  const complete = published && result.clientHostedPagesUnreconciled !== true && result.agentSessionsUnverifiable !== true;
  return { ok: true, snapshot: { worktree, publication: { epoch, version }, tabs, published, complete, activeTabId: text(result.activeTabId) } };
}

/**
 * The host's own ordering, matching the original client's gate (session-tab-snapshot-gate.ts):
 * only an older version in the same epoch is stale. An equal version is the same publication
 * re-read (the host does not mint a new version for unchanged content) and is processed again.
 * A new epoch means the publisher restarted and resets the floor.
 */
export function comparePublication(previous: TabsPublication | undefined, next: TabsPublication): 'accept' | 'stale' | 'new_epoch' {
  if (!previous) return 'accept';
  if (previous.epoch !== next.epoch) return 'new_epoch';
  return next.version >= previous.version ? 'accept' : 'stale';
}

/** The pane key of the worktree's active tab: activeTabId names the mobile tab; its parentTabId:leafId is the pane. */
export function activePaneKey(snapshot: TabsSnapshot): string | undefined {
  const tab = snapshot.activeTabId ? snapshot.tabs.find(t => t.id === snapshot.activeTabId) : undefined;
  return tab?.parentTabId && tab.leafId ? `${tab.parentTabId}:${tab.leafId}` : undefined;
}
