import {parseTerminalReply,type TerminalReplyTarget,type TerminalReplyEvidence} from './terminal-reply-evidence';
import {parseFrontendFocus,type FrontendFocus} from './frontend-focus';
import type { AgentSnapshot, ConnectionState, DeckCommand } from '../core/types';
import { parseAccountsUsage, parseOrderSettings, type OrderSnapshot, type UsageSnapshot } from './usage';
import {
  acceptHostSnapshot, beginHostSync, createHostSessionState, disconnectHost, type HostSessionState,
} from '../core/session-state';
import type { OrcaClient } from './orca-client';
import {
  comparePublication, normalizeWorktreePs, terminalAgentCandidates, parseStatus, parseTabsSnapshot,
  type TabsPublication, type TabsSnapshot, type PaneInventoryEvidence,
} from './orca-read-model';
import { inspectProtocolVersion } from './upstream-contract';

/**
 * Read-only Orca client. It issues original read methods (including terminal identity/status
 * to cover desktop panes without hook rows) through an injected transport and never sends a write. The transport is
 * where the original paired E2EE channel plugs in once G0 verifies it; nothing here
 * establishes trust, pairs a device, or enables live controls.
 */
export interface TerminalInputLease { isActive():boolean; release():Promise<void> }
export interface RpcTransport {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  /** Original input-only mobile presence; no terminal output or viewport. Readers never call this. */
  acquireTerminalInput?(terminal:string):Promise<TerminalInputLease>;
  /** Original one-shot structured opening snapshot with exact stream cleanup. Readers do not call it. */
  readStructuredSnapshot?(sessionId:string):Promise<unknown>;
  /** Present on transports that hold a socket; the client closes only the ones it created. */
  close?(): void;
}

export type DirectTransportCode =
  | 'connect_failed' | 'handshake_timeout' | 'auth_rejected' | 'host_mismatch' | 'protocol_error'
  | 'closed' | 'not_connected' | 'request_timeout' | 'rpc_error';

export class DirectTransportError extends Error {
  constructor(readonly code: DirectTransportCode, readonly rpcCode?: string) {
    super(code);
    this.name = 'DirectTransportError';
  }
}

/** Only the correlated runtime admission code proves a missing method before dispatch. */
export function isMethodNotFound(error:unknown):boolean{return error instanceof DirectTransportError&&error.code==='rpc_error'&&error.rpcCode==='method_not_found';}

export type ReadOnlyClientCode =
  | 'not_connected' | 'transport_failed' | 'request_timeout' | 'malformed_response' | 'incompatible_protocol'
  | 'host_not_ready' | 'host_identity_mismatch' | 'truncated_listing' | 'duplicate_identity'
  | 'snapshot_rejected' | 'stale_tabs_snapshot' | 'connect_superseded' | 'writes_disabled'
  /** The host refused the device token (revoked or unknown): retrying cannot help, the user must pair again. */
  | 'auth_rejected'
  /** The host did not present the pinned key: it changed or is not the paired one. Retrying cannot help either. */
  | 'host_mismatch'
  /** Kinds of connection failure, passed on so the screen can say what happened. All transient: the owner retries. */
  | 'connect_failed' | 'handshake_timeout' | 'protocol_error';

/**
 * The only transport error codes that cross the factory boundary. All are fixed, secret-free names: the two that need the user
 * (a refused token, a host with another key) and the three kinds of failed connection. Anything else, free text included, is
 * a plain `transport_failed`.
 */
const PASSED_CODES: readonly ReadOnlyClientCode[] = ['auth_rejected', 'host_mismatch', 'connect_failed', 'handshake_timeout', 'protocol_error'];
function passedCode(error: unknown): ReadOnlyClientCode | undefined {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return PASSED_CODES.find(candidate => candidate === code);
}

export class ReadOnlyClientError extends Error {
  constructor(readonly code: ReadOnlyClientCode) {
    // Transport errors may carry credentials (URLs, tokens): only the code is exposed, never a cause.
    super(code);
    this.name = 'ReadOnlyClientError';
  }
}

export interface ReadOnlyClientOptions {
  hostId: string;
  /** A transport owned by the caller; the client never closes it. Use `connectTransport` to allow reconnecting. */
  transport?: RpcTransport;
  /** Creates a fresh transport for every `connect()`; the client owns and closes what it creates. */
  connectTransport?: () => Promise<RpcTransport>;
  /** Runtime id pinned by the pairing layer, if it knows one. Otherwise the first connect pins it. */
  expectedRuntimeId?: string;
  /** Claimed by the pairing layer; a bare client does not assert it. */
  paired?: boolean;
  now?: () => number;
  limit?: number;
  requestTimeoutMs?: number;
}

export class ReadOnlyOrcaClient implements OrcaClient {
  private state: HostSessionState;
  private revision = 0;
  private connectAttempt = 0;
  private pinnedRuntimeId?: string;
  hostVersion?: string;
  private frontendFocusSupported=false;
  private lastConfirmedAt?: number;
  private inventory?:PaneInventoryEvidence;
  private readonly publications = new Map<string, TabsPublication>();
  private readonly now: () => number;
  private readonly limit: number;
  private readonly timeoutMs: number;
  private created?: RpcTransport;

  constructor(private readonly options: ReadOnlyClientOptions) {
    if (!options.transport && !options.connectTransport) throw new Error('A transport or a transport factory is required');
    // With both, closing the owned transport would silently fall back to the caller's: refuse the ambiguity.
    if (options.transport && options.connectTransport) throw new Error('Give a transport or a transport factory, not both');
    this.state = createHostSessionState(options.hostId);
    this.pinnedRuntimeId = options.expectedRuntimeId;
    this.now = options.now ?? Date.now;
    this.limit = options.limit ?? 200;
    this.timeoutMs = options.requestTimeoutMs ?? 15_000;
  }

  get runtimeId(): string | undefined { return this.pinnedRuntimeId; }

  getState(): HostSessionState { return this.state; }

  inventoryEvidence():PaneInventoryEvidence|undefined {
    const v=this.inventory;
    return this.state.phase==='ready'&&v&&v.generation===this.state.generation&&v.observedAt===this.lastConfirmedAt?{...v,worktreeIds:[...v.worktreeIds]}:undefined;
  }

  /**
   * The pin guards one connection against another runtime answering. A restarted desktop is a new runtime (its id is
   * generated at start-up), so after a lost connection, when every agent is already unknown, the owner may accept the
   * next one. Per-runtime tab ordering is dropped with the pin.
   */
  forgetRuntime(): void {
    this.pinnedRuntimeId = undefined;
    this.publications.clear();
  }

  connectionState(): ConnectionState {
    return {
      hostId: this.options.hostId,
      generation: this.state.generation,
      // Only a confirmed snapshot counts as online; a failed refresh or a first sync does not.
      online: this.state.phase === 'ready',
      paired: this.options.paired === true,
      lastConfirmedAt: this.lastConfirmedAt === undefined ? undefined : new Date(this.lastConfirmedAt).toISOString(),
      // Reading proves nothing about write capability; G4 must verify it separately.
      controlsVerified: false,
      enabledCommands: [],
    };
  }

  async connect(): Promise<void> {
    // A newer connect or a disconnect supersedes this attempt; a reconnect also fences everything in flight.
    const attempt = ++this.connectAttempt;
    if (this.state.phase !== 'disconnected') this.state = disconnectHost(this.state);
    this.lastConfirmedAt = undefined;
    this.frontendFocusSupported=false;
    try {
      if (this.options.connectTransport) await this.createTransport(attempt);
      const issuedAt = this.now();
      const parsed = parseStatus(await this.call('status.get'));
      if (attempt !== this.connectAttempt) throw new ReadOnlyClientError('connect_superseded');
      if (!parsed.ok) throw new ReadOnlyClientError('malformed_response');
      const { status } = parsed;
      this.hostVersion=status.appVersion;
      this.frontendFocusSupported=status.capabilities.includes('frontend.focus.read.v1');
      if (inspectProtocolVersion(status.protocolVersion, status.minCompatibleMobileVersion).kind !== 'ok') {
        throw new ReadOnlyClientError('incompatible_protocol');
      }
      if (!status.ready) throw new ReadOnlyClientError('host_not_ready');
      if (this.pinnedRuntimeId !== undefined && this.pinnedRuntimeId !== status.runtimeId) {
        throw new ReadOnlyClientError('host_identity_mismatch');
      }
      this.pinnedRuntimeId = status.runtimeId;
      this.state = beginHostSync(this.state);
      this.revision = 0;
      this.lastConfirmedAt = issuedAt;
    } catch (error) {
      // A superseded attempt is over whatever its own failure was (closing its transport rejects what it was
      // waiting for), and it must not touch the newer connection's state.
      if (attempt !== this.connectAttempt) throw new ReadOnlyClientError('connect_superseded');
      if (this.state.phase !== 'disconnected') this.state = disconnectHost(this.state);
      this.closeCreated();
      throw error;
    }
  }

  /** Verify this connection's original runtime without reconnecting or borrowing a cached status. */
  async verifyActionRuntime():Promise<void>{
    const generation=this.requireConnected(),runtimeId=this.pinnedRuntimeId;
    const parsed=parseStatus(await this.call('status.get'));
    this.requireSameGeneration(generation);
    if(!parsed.ok)throw new ReadOnlyClientError('malformed_response');
    if(!runtimeId||parsed.status.runtimeId!==runtimeId)throw new ReadOnlyClientError('host_identity_mismatch');
    if(!parsed.status.ready)throw new ReadOnlyClientError('host_not_ready');
    if(inspectProtocolVersion(parsed.status.protocolVersion,parsed.status.minCompatibleMobileVersion).kind!=='ok')throw new ReadOnlyClientError('incompatible_protocol');
  }

  async listAgents(): Promise<AgentSnapshot[]> {
    const generation = this.requireConnected();
    // Order is fixed when the request is issued, so a slow earlier response cannot overwrite a later one.
    const revision = ++this.revision;
    // Freshness counts from issue time: the host answered some time after it was asked.
    const issuedAt = this.now();
    let result: unknown;
    try {
      result = await this.call('worktree.ps', { limit: this.limit });
    } catch (error) {
      this.invalidateIfNewest(generation, revision);
      throw error;
    }
    // The desktop also shows process-identified panes without a hook entry. Read only identity
    // metadata; the normalizer never accesses previews (some pins ignore includePreview:false); failure is partial coverage, not an empty complete catalog.
    this.requireSameGeneration(generation);
    const [catalog,ui]=await Promise.all([
      this.call('terminal.list',{limit:500,includeVisualLayouts:false,includePreview:false}).catch(()=>undefined),
      this.call('ui.get').catch(()=>undefined),
    ]);
    this.requireSameGeneration(generation);
    const hooks=new Set<string>();
    if(result&&typeof result==='object'&&Array.isArray((result as {worktrees?:unknown}).worktrees)){
      for(const w of (result as {worktrees:unknown[]}).worktrees){
        if(!w||typeof w!=='object')continue;const wt=w as {worktreeId?:unknown;agents?:unknown};
        if(typeof wt.worktreeId!=='string'||!Array.isArray(wt.agents))continue;
        for(const a of wt.agents)if(a&&typeof a==='object'&&typeof a.paneKey==='string')hooks.add(JSON.stringify([wt.worktreeId,a.paneKey]));
      }
    }
    const candidates=terminalAgentCandidates(catalog).filter(row=>!hooks.has(JSON.stringify([row.worktreeId,`${row.tabId}:${row.leafId}`])));
    const handles=[...new Set(candidates.map(row=>row.handle))],statuses=new Map<string,unknown>();let cursor=0;
    // Bounded fan-out: a large catalog cannot flood the phone's shared channel.
    await Promise.all(Array.from({length:Math.min(8,handles.length)},async()=>{
      while(cursor<handles.length){if(this.state.generation!==generation||this.state.phase==='disconnected')break;const handle=handles[cursor++];try{statuses.set(handle,await this.call('terminal.agentStatus',{terminal:handle}));}catch{/* unknown row, never authority */}}
    }));
    const receivedAt = this.now();
    this.requireSameGeneration(generation);
    const normalized = normalizeWorktreePs(result, {
      hostId: this.options.hostId, generation, observedAt: issuedAt, skewReference: receivedAt,
    },{catalog,statuses,ui});
    if (!normalized.ok) {
      this.invalidateIfNewest(generation, revision);
      throw new ReadOnlyClientError(normalized.reason === 'malformed' ? 'malformed_response' : normalized.reason);
    }
    const next = acceptHostSnapshot(this.state, { generation, revision, observedAt: issuedAt, agents: normalized.agents }, receivedAt);
    if (next === this.state) {
      // Superseded by a newer accepted snapshot: keep it. Otherwise this answer was too old to trust.
      this.invalidateIfNewest(generation, revision);
      throw new ReadOnlyClientError('snapshot_rejected');
    }
    this.state = next;
    this.inventory={...normalized.inventory,worktreeIds:[...normalized.inventory.worktreeIds]};
    this.lastConfirmedAt = issuedAt;
    return next.agents.map(agent => ({ ...agent, target: { ...agent.target } }));
  }

  /** Plan usage from the host's accounts snapshot; refreshes provider usage first, like the original mobile client. */
  async readUsage(): Promise<UsageSnapshot | null> {
    const generation = this.requireConnected();
    const issuedAt = this.now();
    const result = await this.call('accounts.list', { refreshUsage: true });
    this.requireSameGeneration(generation);
    return parseAccountsUsage(result, issuedAt);
  }

  /** The desktop's sidebar order settings; each part is optional (older hosts or an unpublished catalog). */
  async readOrder(): Promise<OrderSnapshot> {
    const generation = this.requireConnected();
    const issuedAt = this.now();
    const [ui, sections] = await Promise.all([
      this.call('ui.get').catch(() => undefined),
      this.call('mobileRelay.projectSections').catch(() => undefined),
    ]);
    this.requireSameGeneration(generation);
    if(ui===undefined&&sections===undefined)throw new ReadOnlyClientError('transport_failed');
    return {...parseOrderSettings(ui, sections),observedAt:issuedAt};
  }

  /** Optional host extension: never probe old hosts or use paired-device selection as a substitute. */
  async readFrontendFocus():Promise<FrontendFocus|undefined>{
    const generation=this.requireConnected();if(!this.frontendFocusSupported)return;
    const issuedAt=this.now();
    const result=await this.call('frontend.focus.get');
    this.requireSameGeneration(generation);
    return parseFrontendFocus(result,issuedAt,this.now());
  }

  /** Existing tab RPC, exact terminal identity and the same epoch/version gate; no preview/focus fallback. */
  async readTerminalReply(target:TerminalReplyTarget):Promise<{reply:TerminalReplyEvidence|undefined;issuedAt:number;epochChanged:boolean}>{
    const read=await this.readTabsProjection(target.worktreeId);
    return{reply:parseTerminalReply(read.raw,target),issuedAt:read.issuedAt,epochChanged:read.epochChanged};
  }

  async readTabs(worktreeId: string): Promise<{ snapshot: TabsSnapshot; epochChanged: boolean }> {
    const {snapshot,epochChanged}=await this.readTabsProjection(worktreeId);return{snapshot,epochChanged};
  }

  private async readTabsProjection(worktreeId:string):Promise<{snapshot:TabsSnapshot;epochChanged:boolean;raw:unknown;issuedAt:number}>{
    const generation = this.requireConnected(),issuedAt=this.now();
    const result = await this.call('session.tabs.list', { worktree: `id:${worktreeId}` });
    this.requireSameGeneration(generation);
    const parsed = parseTabsSnapshot(result);
    if (!parsed.ok || parsed.snapshot.worktree !== worktreeId) throw new ReadOnlyClientError('malformed_response');
    // The "ask later" placeholder is not a publication and must not become an order floor.
    if (!parsed.snapshot.published) return { snapshot: parsed.snapshot, epochChanged: false,raw:result,issuedAt };
    const verdict = comparePublication(this.publications.get(worktreeId), parsed.snapshot.publication);
    if (verdict === 'stale') throw new ReadOnlyClientError('stale_tabs_snapshot');
    this.publications.set(worktreeId, parsed.snapshot.publication);
    return { snapshot: parsed.snapshot, epochChanged: verdict === 'new_epoch',raw:result,issuedAt };
  }

  async send(_command: DeckCommand): Promise<void> {
    throw new ReadOnlyClientError('writes_disabled');
  }

  async disconnect(): Promise<void> {
    // Also cancels a connect that is still waiting for the host.
    this.connectAttempt++;
    if (this.state.phase !== 'disconnected') this.state = disconnectHost(this.state);
    this.lastConfirmedAt = undefined;
    this.closeCreated();
  }

  /** Replace the transport this client owns: the old one is closed first, a late one is closed if superseded. */
  private async createTransport(attempt: number): Promise<void> {
    this.closeCreated();
    let next: RpcTransport;
    try {
      next = await this.options.connectTransport!();
    } catch (error) {
      // The original error can carry endpoints or credentials: only a code survives.
      throw new ReadOnlyClientError(passedCode(error) ?? 'transport_failed');
    }
    if (attempt !== this.connectAttempt) {
      try { next.close?.(); } catch { /* nothing left to release */ }
      throw new ReadOnlyClientError('connect_superseded');
    }
    this.created = next;
  }

  private closeCreated(): void {
    const owned = this.created;
    this.created = undefined;
    try { owned?.close?.(); } catch { /* already closed */ }
  }

  /** A failed refresh means current state is unknown: restart the sync unless a newer snapshot already stands. */
  private invalidateIfNewest(generation: number, revision: number): void {
    if (this.state.phase === 'disconnected' || this.state.generation !== generation) return;
    if (this.state.revision !== undefined && revision <= this.state.revision) return;
    this.state = beginHostSync(this.state);
    this.revision = 0;
    this.lastConfirmedAt = undefined;
  }

  private requireConnected(): number {
    if (this.state.phase === 'disconnected') throw new ReadOnlyClientError('not_connected');
    return this.state.generation;
  }

  private requireSameGeneration(generation: number): void {
    if (this.state.phase === 'disconnected' || this.state.generation !== generation) {
      throw new ReadOnlyClientError('snapshot_rejected');
    }
  }

  private call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const transport = this.created ?? this.options.transport;
      if (!transport) { reject(new ReadOnlyClientError('not_connected')); return; }
      const timer = setTimeout(() => reject(new ReadOnlyClientError('request_timeout')), this.timeoutMs);
      let pending: Promise<unknown>;
      try {
        pending = transport.request(method, params);
      } catch {
        clearTimeout(timer);
        reject(new ReadOnlyClientError('transport_failed'));
        return;
      }
      pending.then(
        value => { clearTimeout(timer); resolve(value); },
        () => { clearTimeout(timer); reject(new ReadOnlyClientError('transport_failed')); },
      );
    });
  }
}
