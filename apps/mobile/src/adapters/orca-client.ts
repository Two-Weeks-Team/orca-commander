import type { AgentSnapshot, DeckCommand } from '../core/types';

/** Contract only. G0 must verify independent app pairing, E2EE and mobile RPC support. */
export interface OrcaClient {
  connect(): Promise<void>;
  listAgents(): Promise<AgentSnapshot[]>;
  send(command: DeckCommand): Promise<void>;
  disconnect(): Promise<void>;
}

export class UnimplementedOrcaClient implements OrcaClient {
  async connect(): Promise<void> { throw new Error('G0: relay compatibility not verified'); }
  async listAgents(): Promise<AgentSnapshot[]> { throw new Error('G0: no real RPC adapter'); }
  async send(_command: DeckCommand): Promise<void> { throw new Error('G4: actions intentionally disabled'); }
  async disconnect(): Promise<void> { /* no connection */ }
}
