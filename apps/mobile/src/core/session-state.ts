import {READ_FRESH_MS} from './read-freshness';
import type { AgentSnapshot, OrcaTarget } from './types';

export interface HostSessionState {
  hostId: string;
  generation: number;
  phase: 'disconnected' | 'syncing' | 'ready';
  agents: readonly AgentSnapshot[];
  observedAt?: number;
  revision?: number;
}

export function sessionIdentity(target: OrcaTarget): string {
  return JSON.stringify([target.hostId, target.worktreeId, target.terminalId ?? null, target.dispatchId ?? null]);
}

export function createHostSessionState(hostId: string): HostSessionState {
  if (!hostId.trim()) throw new Error('Host identity is required');
  return { hostId, generation: 0, phase: 'disconnected', agents: [] };
}

function unknownAgents(agents: readonly AgentSnapshot[]): AgentSnapshot[] {
  return agents.map(agent => ({
    ...agent, target: {...agent.target}, state: 'unknown', eventType: 'informational',
    requestId: undefined, permissionEvidence: 'missing',
  }));
}

export function beginHostSync(state: HostSessionState): HostSessionState {
  return {...state, generation: state.generation + 1, phase: 'syncing', observedAt: undefined, revision: undefined, agents: unknownAgents(state.agents)};
}

export function disconnectHost(state: HostSessionState): HostSessionState {
  return {...state, generation: state.generation + 1, phase: 'disconnected', observedAt: undefined, revision: undefined, agents: unknownAgents(state.agents)};
}

// Call only after an authenticated read; this reducer does not establish transport trust.
export function acceptHostSnapshot(
  state: HostSessionState,
  snapshot: {generation: number; revision: number; observedAt: number; agents: readonly AgentSnapshot[]},
  now = Date.now(),
): HostSessionState {
  if (state.phase === 'disconnected' || snapshot.generation !== state.generation ||
      !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 ||
      (state.revision !== undefined && snapshot.revision <= state.revision) ||
      !Number.isFinite(now) || !Number.isFinite(snapshot.observedAt) ||
      snapshot.observedAt > now || now - snapshot.observedAt > READ_FRESH_MS) return state;
  const identities = new Set<string>();
  const ids = new Set<string>();
  for (const agent of snapshot.agents) {
    const updatedAt = Date.parse(agent.updatedAt);
    const key = sessionIdentity(agent.target);
    if (agent.target.hostId !== state.hostId || !agent.target.worktreeId.trim() ||
        !agent.id.trim() || ids.has(agent.id) || identities.has(key) ||
        !Number.isFinite(updatedAt) || updatedAt > snapshot.observedAt) return state;
    ids.add(agent.id);
    identities.add(key);
  }
  return {...state, phase:'ready', observedAt:snapshot.observedAt, revision:snapshot.revision,
    agents:snapshot.agents.map(agent => ({...agent,target:{...agent.target}}))};
}
