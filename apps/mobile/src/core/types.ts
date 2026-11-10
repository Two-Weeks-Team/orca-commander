export type AgentState =
  | 'working' | 'permission' | 'question' | 'failed' | 'review' | 'done' | 'idle' | 'unknown';

export type AttentionType =
  | 'permission_request' | 'user_question' | 'task_failure' | 'review_required' | 'informational';

export interface OrcaTarget {
  hostId: string;
  connectionGeneration?: number;
  worktreeId: string;
  terminalId?: string;
  dispatchId?: string;
}

/** Where Orca shows this agent: its project (repo), worktree and the host's own row order. Read-only context. */
export interface AgentPlace {
  repoId: string;
  repo: string;
  worktreeName: string;
  /** The desktop's active worktree (`worktree.ps` isActive). */
  worktreeActive: boolean;
  /** Position of the worktree and of this agent row in the host's answer. */
  worktreeRank: number;
  agentRank: number;
  /** The host's lineage parent pane, when this row is a child agent. */
  parentPaneKey?: string;
  /** Raw host ordering inputs for the original mobile sidebar order. */
  sort?: Readonly<Record<string, number | boolean | string | null>>;
}

export interface AgentSnapshot {
  id: string;
  provider: 'codex' | 'claude' | 'other';
  title: string;
  summary: string;
  state: AgentState;
  eventType: AttentionType;
  target: OrcaTarget;
  updatedAt: string;
  requestId?: string;
  permissionEvidence?: 'structured_verified' | 'missing';
  place?: AgentPlace;
  /** Original desktop dashboard projection, kept separate from inventory/action authority. */
  dashboard?: {bucket:'attention'|'working'|'done'|'idle';visible:boolean;stateChangedAt:number|null};
  /** D25 presentation facts from terminal.list + the hook's original state event. Never write authority. */
  terminalActivity?: {present:boolean;lastOutputAt:number|null;stateStartedAt:number|null};
  /** Original waiting facet; screen content is fetched on demand and is never stored here. */
  terminalPrompt?: {state:'waiting'|'blocked';kind:'permission'|'question';toolName?:string};
  /**
   * Orca's `workingMode: 'monitoring'`: the agent's turn finished but a background monitor it started is still alive
   * and may wake it again (the desktop's pulse mark). The state stays `working`; nothing needs the owner.
   */
  monitoring?: true;
  /** When the shown state began (the host's stateStartedAt; the main agent's for a failed turn). Ages count from it. */
  stateSince?: string;
  /** The owner pressed Stop and the turn is ending (mainAgent.stopping). */
  stopping?: true;
  /** The turn ended without a proven outcome (verdict `unconfirmed`); the state stays `unknown`. */
  unconfirmed?: true;
  /** A structured host owns the provider child, so age alone never stales it. */
  hostOwned?: true;
  /** A connected PTY backs the row: a stale row reads "no update in …" rather than idle. */
  livePty?: true;
}

export type DeckCommand =
  | { kind: 'view'; target: OrcaTarget }
  | { kind: 'send_prompt'; target: OrcaTarget; text: string }
  | { kind: 'approve_permission'; target: OrcaTarget; requestId: string }
  | { kind: 'reject_permission'; target: OrcaTarget; requestId: string }
  | { kind: 'resolve_gate'; target: OrcaTarget; gateId: string; resolution: string };

export interface ConnectionState {
  hostId?: string;
  generation?: number;
  online: boolean;
  lastConfirmedAt?: string;
  paired: boolean;
  controlsVerified?: boolean;
  enabledCommands?: readonly DeckCommand['kind'][];
}

/** Current coordinator state, supplied independently of cached connection evidence. */
export interface ActiveConnection {
  hostId: string;
  generation: number;
}

