import type { ActiveConnection, AgentSnapshot, ConnectionState, DeckCommand } from './types';

export interface PolicyVerdict {
  allowed: boolean;
  reason: string;
  requiresConfirmation: boolean;
}

export function checkCommand(
  command: DeckCommand,
  agent: AgentSnapshot,
  connection: ConnectionState,
  now = Date.now(),
  activeConnection?: ActiveConnection,
): PolicyVerdict {
  if (command.kind === 'view') return { allowed: true, reason: 'read_only', requiresConfirmation: false };
  if (!connection.paired || !connection.online) return { allowed: false, reason: 'host_not_connected', requiresConfirmation: false };
  if (!activeConnection || !activeConnection.hostId.trim() ||
      !Number.isSafeInteger(activeConnection.generation) || activeConnection.generation < 0 ||
      connection.hostId !== activeConnection.hostId ||
      agent.target.hostId !== activeConnection.hostId || command.target.hostId !== activeConnection.hostId ||
      connection.generation !== activeConnection.generation ||
      agent.target.connectionGeneration !== activeConnection.generation ||
      command.target.connectionGeneration !== activeConnection.generation) {
    return { allowed: false, reason: 'connection_identity_mismatch', requiresConfirmation: false };
  }
  if (!connection.controlsVerified || !connection.enabledCommands?.includes(command.kind)) {
    return { allowed: false, reason: 'unverified_capability', requiresConfirmation: false };
  }
  // Eligibility only: the action owner obtains new connection and target evidence at hold.
  const confirmedAt = Date.parse(connection.lastConfirmedAt ?? '');
  if (!Number.isFinite(now) || !Number.isFinite(confirmedAt) || confirmedAt < 0) {
    return { allowed: false, reason: 'stale_connection', requiresConfirmation: false };
  }
  if (!agent.target.hostId.trim() || !agent.target.worktreeId.trim()) return { allowed: false, reason: 'missing_target', requiresConfirmation: false };
  if (command.target.hostId !== agent.target.hostId || command.target.worktreeId !== agent.target.worktreeId ||
      command.target.terminalId !== agent.target.terminalId || command.target.dispatchId !== agent.target.dispatchId) {
    return { allowed: false, reason: 'target_mismatch', requiresConfirmation: false };
  }
  const updatedAt = Date.parse(agent.updatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt < 0) {
    return { allowed: false, reason: 'stale_event', requiresConfirmation: false };
  }
  if (command.kind === 'send_prompt') {
    if (agent.state === 'permission' || agent.state === 'question' || agent.state === 'unknown' ||
        agent.eventType === 'permission_request' || agent.eventType === 'user_question' ||
        agent.permissionEvidence === 'structured_verified' || agent.requestId) {
      return { allowed: false, reason: 'prompt_requires_structured_resolution', requiresConfirmation: false };
    }
    return command.text.trim() && Boolean(agent.target.terminalId)
      ? { allowed: true, reason: 'text_allowed', requiresConfirmation: true }
      : { allowed: false, reason: 'missing_prompt_or_terminal', requiresConfirmation: false };
  }
  if (command.kind === 'approve_permission' || command.kind === 'reject_permission') {
    const verified = agent.state === 'permission' && agent.eventType === 'permission_request' && agent.permissionEvidence === 'structured_verified' &&
      agent.requestId === command.requestId && Boolean(command.requestId) && Boolean(agent.target.terminalId);
    return verified
      ? { allowed: true, reason: 'verified_permission', requiresConfirmation: true }
      : { allowed: false, reason: 'unverified_permission_request', requiresConfirmation: false };
  }
  return { allowed: false, reason: 'gate_resolution_not_implemented', requiresConfirmation: false };
}

