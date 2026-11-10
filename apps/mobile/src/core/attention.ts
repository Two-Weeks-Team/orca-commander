import type { AgentSnapshot } from './types';

const priority: Record<AgentSnapshot['eventType'], number> = {
  permission_request: 100,
  user_question: 90,
  task_failure: 75,
  review_required: 50,
  informational: 0,
};

export function attentionScore(agent: AgentSnapshot): number {
  const expected: Partial<Record<AgentSnapshot['state'], AgentSnapshot['eventType']>> = {
    permission:'permission_request', question:'user_question', failed:'task_failure', review:'review_required',
  };
  if (expected[agent.state] !== agent.eventType) return 0;
  return priority[agent.eventType];
}

export function getAttentionQueue(agents: AgentSnapshot[]): AgentSnapshot[] {
  return agents.filter(item => attentionScore(item) > 0)
    .sort((a, b) => attentionScore(b) - attentionScore(a) || b.updatedAt.localeCompare(a.updatedAt));
}

export function getOverview(agents: AgentSnapshot[]) {
  return {
    needsYou: getAttentionQueue(agents).length,
    working: agents.filter(a => a.state === 'working').length,
    done: agents.filter(a => a.state === 'done').length,
    unknown: agents.filter(a => a.state === 'unknown').length,
  };
}
