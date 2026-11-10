import type {VoiceReplyBinding,ReplyRead} from './voice-reply-service';
import {currentFrontendFocus,type FrontendFocus} from './frontend-focus';
import type {PaneInventoryEvidence} from './orca-read-model';
import type { OrderSnapshot, UsageSnapshot } from './usage';
import type { ActionChannel } from './action-client';
import {sameActionConnection,type ActionConnection} from './transport-capabilities';
import type { AgentSnapshot, ConnectionState } from '../core/types';
import { describeHost, pairedHostFromCode } from './pairing-store';
import type { PairedHost, PairingStore } from './pairing-store';
import { ReadOnlyClientError, ReadOnlyOrcaClient } from './read-only-orca-client';
import type { ReadOnlyClientCode, RpcTransport } from './read-only-orca-client';

/**
 * The read-only live session: load the pairing, connect, refresh on a timer, and reconnect with backoff.
 * It owns the connection lifecycle only; trust decisions stay in the client (state is `unknown` the moment a
 * refresh fails) and in the pairing store (secrets never leave it). The snapshot it publishes holds a host
 * summary and coded errors, never the token, the pinned key or an error message.
 */

/** `loading`: the stored pairing has not been read yet, so nothing is known (not even whether the app is paired). */
export type LivePhase = 'loading' | 'unpaired' | 'connecting' | 'live' | 'reconnecting' | 'stopped';

export type LiveError = ReadOnlyClientCode | 'storage_unavailable';

export interface LiveSnapshot {
  phase: LivePhase;
  agents: AgentSnapshot[];
  host?: { hostId: string; endpointHost: string; pairedAt: string };
  error?: LiveError;
  /** What the policy layer reads: online and paired, never controls (reading proves nothing about writes). */
  connection?: ConnectionState;
  /** Explicit pane coverage only; native-session completeness is separate. */
  inventory?:PaneInventoryEvidence;
  /** Consecutive failed attempts; 0 while live. */
  attempt: number;
  /** Plan usage from the host (Claude/Codex); absent until first read or when the host does not answer it. */
  usage?: UsageSnapshot;
  /** Verified foreground frontend selection only; paired-device session tab selection is not desktop evidence. */
  desktopFocus?: FrontendFocus;
  /** The desktop's sidebar order settings, as last read. */
  order?: OrderSnapshot;
}

export interface LiveSessionOptions {
  store: PairingStore;
  /** Opens a fresh authenticated transport to the paired host. */
  openTransport: (host: PairedHost) => Promise<RpcTransport>;
  delay?: (ms: number) => Promise<void>;
  now?: () => number;
  refreshMs?: number;
}

/** Errors that retrying cannot fix: the token was refused or the host is not the paired one. */
const USER_ACTION: readonly LiveError[] = ['auth_rejected', 'host_mismatch'];

const BACKOFF_START_MS = 1000;
/** Usage changes slowly and each read refreshes provider usage on the host. */
const USAGE_REFRESH_MS = 60_000;
const BACKOFF_MAX_MS = 30_000;

const defaultDelay = (ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms); });
const copyAgents = (agents: readonly AgentSnapshot[]): AgentSnapshot[] => agents.map(agent => ({ ...agent, target: { ...agent.target } }));

export class LiveSession {
  private snapshot: LiveSnapshot = { phase: 'loading', agents: [], attempt: 0 };
  private readonly listeners = new Set<(snapshot: LiveSnapshot) => void>();
  private readonly delay: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly refreshMs: number;
  private runId = 0;
  private readonly inventoryReads=new WeakMap<ReadOnlyOrcaClient,Promise<unknown>>();
  private usageRequested = false;
  private client?: ReadOnlyOrcaClient;
  private transport?: RpcTransport;
  private starting?: Promise<void>;
  /** Bumped by stop() and unpair(): a pair() that was saving while the app stopped must not connect afterwards. */
  private stopEpoch = 0;

  constructor(private readonly options: LiveSessionOptions) {
    this.delay = options.delay ?? defaultDelay;
    this.now = options.now ?? Date.now;
    this.refreshMs = options.refreshMs ?? 5000;
  }

  getSnapshot(): LiveSnapshot { return this.snapshot; }

  /** Separate capability boundary: obtaining a channel does not mark G0 or any write as verified. */
  actionChannel(): ActionChannel | null {
    const s=this.snapshot; const connection=this.client?.connectionState();
    if(s.phase!=='live'||!s.host||!this.transport||!connection?.online||!connection.paired||connection.generation!==s.connection?.generation)return null;
    const confirmedAt=Date.parse(connection.lastConfirmedAt??'');
    if(!Number.isFinite(confirmedAt)||connection.generation===undefined)return null;
    if(!this.client?.runtimeId)return null;
    return{runtimeId:this.client.runtimeId,hostVersion:this.client.hostVersion,hostId:s.host.hostId,generation:connection.generation,confirmedAt,agents:copyAgents(s.agents),transport:this.transport};
  }

  /** Serialize producers, never share their result: a hold queued behind a poll issues its own RPCs. */
  private readInventory(client:ReadOnlyOrcaClient,run:number):Promise<AgentSnapshot[]>{
    const generation=client.getState().generation;
    const read=(this.inventoryReads.get(client)??Promise.resolve()).catch(()=>undefined).then(()=>{
      if(this.runId!==run||this.client!==client||client.getState().generation!==generation)throw new ReadOnlyClientError('connect_superseded');
      return client.listAgents();
    });
    this.inventoryReads.set(client,read.then(()=>undefined,()=>undefined));
    return read;
  }

  /** Each preparation/hold issues new reads on the exact captured authenticated connection. */
  async refreshActionChannel(expected:ActionConnection):Promise<ActionChannel|null>{
    expected={transport:expected.transport,hostId:expected.hostId,runtimeId:expected.runtimeId,generation:expected.generation};
    const initial=this.actionChannel(),client=this.client,run=this.runId;
    if(!initial||!client||!sameActionConnection(expected,initial))return null;
    const bound=()=>{const current=this.actionChannel();return this.runId===run&&this.client===client&&!!current&&sameActionConnection(expected,current);};
    try{
      await client.verifyActionRuntime();if(!bound())return null;
      const agents=await this.readInventory(client,run);if(!bound())return null;
      this.publish({...this.snapshot,agents,connection:client.connectionState(),inventory:client.inventoryEvidence()});
      const result=this.actionChannel();return bound()&&result?{...result}:null;
    }catch{return null;}
  }

  /** Read-only response context on the existing paired channel; never returns cached or cross-generation text. */
  async readTerminalReply(binding:VoiceReplyBinding):Promise<ReplyRead|undefined>{
    const client=this.client,channel=this.actionChannel();
    if(!client||!channel||channel.hostId!==binding.hostId||channel.generation!==binding.generation||channel.agents.filter(a=>a.target.worktreeId===binding.worktreeId&&a.target.terminalId===binding.paneKey).length!==1)return;
    try{
      const read=await client.readTerminalReply(binding),after=this.actionChannel();
      if(this.client!==client||!after||after.hostId!==binding.hostId||after.generation!==binding.generation)return;
      return read;
    }catch{return;}
  }

  subscribe(listener: (snapshot: LiveSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Loads the stored pairing and connects. Calling it again while running does nothing; after `stop()` it resumes. */
  start(): Promise<void> {
    if (!this.starting) this.starting = this.load();
    return this.starting;
  }

  /**
   * For the OS lifecycle (the app is active again). A session that stopped because the user must act, or because the
   * user's disconnect could not be completed, is not restarted by an OS event: that would present a refused token at every
   * foreground, system dialog or control-centre swipe. Use `start()` for an explicit retry.
   */
  resume(): Promise<void> {
    if (this.snapshot.phase === 'stopped' && this.snapshot.error !== undefined) return Promise.resolve();
    return this.start();
  }

  async pair(code: string): Promise<'paired' | 'invalid_code' | 'storage_unavailable'> {
    const host = pairedHostFromCode(code, this.now());
    if (!host) return 'invalid_code';
    const epoch = this.stopEpoch;
    try {
      await this.options.store.save(host);
    } catch {
      // A pairing that could not be saved is not a pairing: leave whatever is running untouched.
      return 'storage_unavailable';
    }
    // The app may have been stopped while the pairing was being saved: it is stored, and resume() will connect.
    if (this.stopEpoch === epoch) this.begin(host);
    return 'paired';
  }

  async unpair(): Promise<'unpaired' | 'storage_unavailable'> {
    const agents = this.end();
    this.stopEpoch++;
    // Holds start(): a start() or resume() that races the removal must not reconnect from the value still stored.
    this.starting = Promise.resolve();
    try {
      await this.options.store.clear();
    } catch {
      // The secret is still stored, so the session must not claim to be unpaired.
      this.starting = undefined;
      this.publish({ phase: 'stopped', agents, host: this.snapshot.host, error: 'storage_unavailable', attempt: 0 });
      return 'storage_unavailable';
    }
    this.publish({ phase: 'unpaired', agents: [], attempt: 0 });
    return 'unpaired';
  }

  /** Ends the connection. The pairing stays; `start()` resumes it. */
  /** Ask the host for fresh plan usage on the next read cycle (the desktop status bar's refresh button). */
  refreshUsage(): void {
    this.usageRequested = true;
  }

  stop(): void {
    const agents = this.end();
    this.stopEpoch++;
    this.starting = undefined;
    if (this.snapshot.phase === 'loading' || this.snapshot.phase === 'unpaired' || this.snapshot.phase === 'stopped') return;
    this.publish({ ...this.snapshot,phase: 'stopped', agents, desktopFocus:undefined, connection:undefined,inventory:undefined,error:undefined,attempt: 0 });
  }

  private async load(): Promise<void> {
    const run = this.runId;
    let host: PairedHost | null;
    try {
      host = await this.options.store.load();
    } catch {
      if (this.runId === run) {
        this.starting = undefined;
        this.publish({ phase: 'unpaired', agents: [], error: 'storage_unavailable', attempt: 0 });
      }
      return;
    }
    // A pair(), unpair() or stop() that happened while the store was being read has the last word.
    if (this.runId !== run) return;
    if (host) this.begin(host);
    else this.publish({ phase: 'unpaired', agents: [], attempt: 0 });
  }

  private begin(host: PairedHost): void {
    const previous=this.snapshot;const ended=this.end();
    const run = ++this.runId;
    const summary = describeHost(host),sameHost=previous.host?.hostId===summary.hostId;
    const agents=sameHost?(ended.length?ended:copyAgents(previous.agents).map(a=>({...a,state:'unknown' as const,eventType:'informational' as const,requestId:undefined,permissionEvidence:'missing' as const}))):[];
    this.publish({ phase:'connecting',agents,host:summary,attempt:0,...(sameHost?{usage:previous.usage,order:previous.order,desktopFocus:undefined}:{}) });
    void this.run(host, run, summary).catch(() => undefined);
  }

  /** Stops the current run and closes its connection; returns what the client then knew, all `unknown`. */
  private end(): AgentSnapshot[] {
    this.runId++;
    const client = this.client;
    this.client = undefined;
    this.transport = undefined;
    if (!client) return [];
    void client.disconnect();
    return copyAgents(client.getState().agents);
  }

  private async run(host: PairedHost, run: number, summary: LiveSnapshot['host']): Promise<void> {
    const client = new ReadOnlyOrcaClient({
      hostId: host.hostId,
      paired: true,
      connectTransport: async () => {
        const transport=await this.options.openTransport(host);
        if(this.runId===run)this.transport=transport;
        return transport;
      },
      now: this.now,
    });
    this.client = client;
    let connected = false;
    let attempt = 0;
    let usage: UsageSnapshot | undefined=this.snapshot.usage;
    let usageAt = 0;
    let order: OrderSnapshot | undefined=this.snapshot.order;
    let desktopFocus: LiveSnapshot['desktopFocus'];
    let orderAt=0;
    let auxiliary:{generation:number;usage:boolean;order:boolean;focus:boolean}|undefined;
    const current=(generation:number)=>this.runId===run&&client.getState().generation===generation&&this.snapshot.phase==='live'&&this.snapshot.connection?.generation===generation;
    const publishContext=(generation:number)=>{if(current(generation))this.publish({...this.snapshot,usage,order,desktopFocus:currentFrontendFocus(desktopFocus,this.now())});};
    while (this.runId === run) {
      try {
        if (!connected) await client.connect();
        connected = true;
        const agents = await this.readInventory(client,run);
        if (this.runId !== run) return;
        attempt = 0;
        const inventory = client.inventoryEvidence();
        desktopFocus=currentFrontendFocus(desktopFocus,this.now());
        // Publish tabs first. Optional provider/order reads never hold the tab refresh loop.
        this.publish({phase:'live',agents,host:summary,connection:client.connectionState(),inventory,attempt,usage,desktopFocus,order});
        const generation=client.getState().generation;
        if(auxiliary?.generation!==generation)auxiliary={generation,usage:false,order:false,focus:false};
        const jobs=auxiliary;
        if(!jobs.usage&&(usageAt===0||this.usageRequested||this.now()-usageAt>=USAGE_REFRESH_MS)){
          jobs.usage=true;usageAt=this.now();this.usageRequested=false;
          void(async()=>{try{const read=await client.readUsage();if(read&&current(generation)){usage=read;publishContext(generation);}}catch{/* keep previous */}finally{jobs.usage=false;}})();
        }
        if(!jobs.order&&(orderAt===0||this.now()-orderAt>=USAGE_REFRESH_MS)){
          jobs.order=true;orderAt=this.now();
          void(async()=>{try{const read=await client.readOrder();if(current(generation)){order=read;publishContext(generation);}}catch{/* keep previous */}finally{jobs.order=false;}})();
        }
        // Only the negotiated foreground frontend projection can supply desktop focus.
        if(!jobs.focus){
          jobs.focus=true;
          void(async()=>{try{const read=await client.readFrontendFocus();if(current(generation)){desktopFocus=read;publishContext(generation);}}catch{if(current(generation)){desktopFocus=undefined;publishContext(generation);}}finally{jobs.focus=false;}})();
        }
        await this.delay(this.refreshMs);
      } catch (error) {
        if (this.runId !== run) return;
        if(error instanceof ReadOnlyClientError&&(error.code==='snapshot_rejected'||error.code==='connect_superseded')){
          // A newer revision/generation supersedes this read; never close its current connection.
          await this.delay(this.refreshMs);continue;
        }
        connected = false;
        desktopFocus=undefined;
        this.transport = undefined;
        attempt++;
        const code = error instanceof ReadOnlyClientError ? error.code : 'transport_failed';
        // Closes the failed connection at once; there is no await here, so nothing can interleave before publishing.
        void client.disconnect();
        // The client already degraded whatever it knew to `unknown`.
        const agents = copyAgents(client.getState().agents);
        // A restarted desktop has a new runtime id: after a lost connection that is the same paired host. Report it
        // once, drop the pin, and the next attempt pins the new runtime.
        if (code === 'host_identity_mismatch') client.forgetRuntime();
        if (USER_ACTION.includes(code)) {
          // Presenting a refused token again, or dialing a changed host, cannot help: stop and let the user act.
          // `start()` (or a new pairing) tries again.
          this.starting = undefined;
          this.client = undefined;
          this.publish({ phase: 'stopped', agents, host: summary, error: code, attempt: 0 });
          return;
        }
        this.publish({
          phase: 'reconnecting',
          agents,
          host: summary,
          error: code,
          connection: client.connectionState(),
          usage,order,desktopFocus,
          attempt,
        });
        await this.delay(Math.min(BACKOFF_START_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS));
      }
    }
  }

  private publish(next: LiveSnapshot): void {
    this.snapshot = next;
    // A snapshot, so a listener that unsubscribes (or subscribes) while being notified cannot disturb this round.
    for (const listener of Array.from(this.listeners)) {
      try { listener(next); } catch { /* a faulty listener must not stop the session */ }
    }
  }
}
