import { createTranslator, type Translator } from '../i18n/messages';
import type { AgentSnapshot } from './types';

// Synthetic examples only. Never pass fixtures to real Orca actions.
const now = '2026-11-01T14:00:00.000Z';
const target = (id: string) => ({ hostId: 'demo-host', worktreeId: 'demo-worktree-' + id, terminalId: 'demo-terminal-' + id });
export function createMockAgents(t: Translator = createTranslator('en')): AgentSnapshot[] {
  return [
  { id: '1', provider: 'claude', title: t('demo.database.title'), summary: t('demo.database.summary'), state: 'permission', eventType: 'permission_request', target: target('1'), updatedAt: now, requestId: 'demo-request-1', permissionEvidence: 'missing' },
  { id: '2', provider: 'codex', title: t('demo.apiFailure.title'), summary: t('demo.apiFailure.summary'), state: 'failed', eventType: 'task_failure', target: target('2'), updatedAt: now },
  { id: '3', provider: 'claude', title: t('demo.review.title'), summary: t('demo.review.summary'), state: 'review', eventType: 'review_required', target: target('3'), updatedAt: now },
  { id: '4', provider: 'codex', title: t('demo.refactor.title'), summary: t('demo.refactor.summary'), state: 'working', eventType: 'informational', target: target('4'), updatedAt: now },
  { id: '5', provider: 'claude', title: t('demo.components.title'), summary: t('demo.components.summary'), state: 'working', eventType: 'informational', target: target('5'), updatedAt: now },
  { id: '6', provider: 'codex', title: t('demo.tests.title'), summary: t('demo.tests.summary'), state: 'done', eventType: 'informational', target: target('6'), updatedAt: now },
];
}

export const mockAgents = createMockAgents();
