import type { AgentSnapshot } from '../core/types';

/** Recommendations only. Long-lived OpenAI API keys stay off mobile. */
export interface DecisionRecommendation {
  agentId: string;
  priority: 'low' | 'medium' | 'high';
  suggestedAction: 'inspect' | 'delegate' | 'wait' | 'retry';
  rationale?: string;
  advisoryOnly: true;
}
export interface DecisionClient {
  recommend(agents: AgentSnapshot[]): Promise<DecisionRecommendation[]>;
}
export class RulesOnlyDecisions implements DecisionClient {
  async recommend(agents: AgentSnapshot[]): Promise<DecisionRecommendation[]> {
    return agents.map(agent => ({
      agentId: agent.id,
      priority: agent.eventType === 'permission_request' ? 'high' : agent.eventType === 'task_failure' ? 'medium' : 'low',
      suggestedAction: agent.eventType === 'task_failure' ? 'inspect' : 'wait',
      advisoryOnly: true as const,
    }));
  }
}
