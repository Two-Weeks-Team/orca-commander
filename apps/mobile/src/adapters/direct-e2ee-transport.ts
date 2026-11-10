import { decodeCanonicalBase64Bytes } from '../upstream/orca-1.4.245/mobile/src/transport/base64-byte-codec';
import {
  createDirectSocketFraming,
  type DirectSocketFraming,
} from '../upstream/orca-1.4.245/mobile/src/transport/direct-socket-framing';
import { buildDirectRpcWireRequest } from '../upstream/orca-1.4.245/mobile/src/transport/rpc-envelope-fields';
import type { RpcTransport, TerminalInputLease } from './read-only-orca-client';

/**
 * Direct E2EE transport to a paired Orca desktop: a WebSocket carrying the ORIGINAL v2 paired-E2EE
 * framing (vendored byte for byte, see docs/upstream-installed-lock.json). This file only adds the socket
 * lifecycle and request/response correlation around it. There is no cryptography here.
 *
 * Deliberately stricter than the original app: v2 only. The original may fall back to legacy framing for
 * a host that has never spoken v2; Deck refuses (`mayUseLegacy` is always false), so a host that cannot
 * do v2 simply cannot be connected. The owner of this object decides what to send.
 *
 * Secrets: the device token and the host key live in `#private` fields and the framing's closure only, so
 * serializing or inspecting a transport shows neither. Errors carry a code and nothing else, and log details
 * (which the framing may fill) are never forwarded.
 */

import {DirectTransportError,type DirectTransportCode} from './read-only-orca-client';
export {DirectTransportError,type DirectTransportCode} from './read-only-orca-client';

/** The part of WebSocket this adapter needs; RN's, Node's and test fakes all satisfy it. */
export interface SocketLike {
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener?(type: string, listener: (event: any) => void): void;
  send(data: string): void;
  close(): void;
}

export interface DirectTransportOptions {
  /** `ws://` or `wss://` endpoint from the pairing offer. */
  endpoint: string;
  /** Host public key pinned by the pairing offer (canonical base64 of 32 bytes). */
  hostPublicKeyB64: string;
  deviceToken: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  /** Larger replies close the transport instead of being parsed. */
  maxReplyChars?: number;
  /** Fixed, secret-free messages only. */
  onLog?: (level: string, message: string) => void;
  createSocket?: (url: string) => SocketLike;
  createFraming?: typeof createDirectSocketFraming;
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; structuredSnapshot?: true };
type Phase = 'connecting' | 'ready' | 'closed';
type InputLeaseState={requestId:string;terminal:string;active:boolean;released:boolean};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const RPC_CODE = /^[A-Za-z0-9_.:-]{1,64}$/;
const MAX_TIMER_MS = 2_147_483_647;
/** The handshake messages are a few hundred bytes; anything larger before authentication is hostile. */
const PRE_AUTH_FRAME_CHARS = 64 * 1024;
const FRAME_SLACK_CHARS = 64 * 1024;
const noop = () => undefined;
/** Unary reads own no server lease; a late reply is authenticated by the original framing then ignored by id. */
const ISOLATED_READ_TIMEOUTS=new Set(['status.get','frontend.focus.get','worktree.ps','session.tabs.list','terminal.list','terminal.agentStatus','accounts.list','ui.get','mobileRelay.projectSections','settings.getAgentLaunch','speech.models.list','agentSession.history','agentSession.currentRequests']);

/** A timeout that is not a positive finite number would fire at once (or never): use the default instead. */
const positive = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(value, MAX_TIMER_MS) : fallback;

/** Size of an inbound frame before anything parses it: characters for text, bytes for binary or blobs. */
function frameSize(data: unknown): number {
  if (typeof data === 'string') return data.length;
  if (typeof data === 'object' && data !== null) {
    const { byteLength, size } = data as { byteLength?: unknown; size?: unknown };
    if (typeof byteLength === 'number') return byteLength;
    if (typeof size === 'number') return size;
  }
  return 0;
}

function defaultCreateSocket(url: string): SocketLike {
  if (typeof WebSocket === 'undefined') throw new Error('no WebSocket');
  return new WebSocket(url) as unknown as SocketLike;
}

function validEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    // No credentials, fragment or query: those would end up in the socket URL and in network logs.
    return (url.protocol === 'ws:' || url.protocol === 'wss:') && !url.username && !url.password && !url.hash && !url.search && url.hostname !== '';
  } catch {
    return false;
  }
}

function validHostKey(key: string): boolean {
  try {
    return decodeCanonicalBase64Bytes(key)?.length === 32;
  } catch {
    return false;
  }
}

export class DirectE2EETransport implements RpcTransport {
  #phase: Phase = 'connecting';
  #opened = false;
  #readyAccepted = false;
  #counter = 0;
  /** Delivered raw frames not yet classified by an original framing success callback; no payload retained. */
  #unclassifiedInbound = 0;
  readonly #pending = new Map<string, Pending>();
  readonly #inputLeases = new Map<string,InputLeaseState>();
  #framing?: DirectSocketFraming;
  #connect?: { resolve: (transport: DirectE2EETransport) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
  readonly #listeners: Array<[string, (event: any) => void]> = [];
  readonly #socket: SocketLike;
  readonly #options: DirectTransportOptions;
  readonly #connectTimeoutMs: number;
  readonly #requestTimeoutMs: number;
  readonly #maxReplyChars: number;
  readonly #maxFrameChars: number;

  private constructor(socket: SocketLike, options: DirectTransportOptions) {
    this.#socket = socket;
    this.#options = options;
    this.#connectTimeoutMs = positive(options.connectTimeoutMs, 10_000);
    this.#requestTimeoutMs = positive(options.requestTimeoutMs, 15_000);
    this.#maxReplyChars = positive(options.maxReplyChars, 8 * 1024 * 1024);
    // Ciphertext is base64 text, about 4/3 of the plaintext it carries.
    this.#maxFrameChars = Math.ceil((this.#maxReplyChars * 4) / 3) + FRAME_SLACK_CHARS;
  }

  static open(options: DirectTransportOptions): Promise<DirectE2EETransport> {
    if (!validEndpoint(options.endpoint) || !validHostKey(options.hostPublicKeyB64)) {
      return Promise.reject(new DirectTransportError('connect_failed'));
    }
    let socket: SocketLike;
    try {
      socket = (options.createSocket ?? defaultCreateSocket)(options.endpoint);
    } catch {
      // The original error can include the URL and, in some stacks, credentials: keep none of it.
      return Promise.reject(new DirectTransportError('connect_failed'));
    }
    return new DirectE2EETransport(socket, options).#start();
  }

  get state(): Phase { return this.#phase; }

  request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return this.#request(method,params);
  }

  /** Original native-chat input-only lease. Credentials and subscription slot stay private. */
  async acquireTerminalInput(terminal:string):Promise<TerminalInputLease>{
    const state:InputLeaseState={requestId:'',terminal,active:false,released:false};
    try{
      await this.#request('terminal.subscribe',{terminal,capabilities:{terminalBinaryStream:1,mobileInputLeaseOnly:1}},state);
      if(!state.active||state.released)throw new DirectTransportError('closed');
    }catch(error){this.#inputLeases.delete(state.requestId);state.active=false;this.#fail('closed');throw error;}
    return Object.freeze({
      isActive:()=>state.active&&!state.released&&this.#phase==='ready',
      release:async()=>{
        if(state.released)return;
        state.released=true;state.active=false;this.#inputLeases.delete(state.requestId);
        if(this.#phase!=='ready')return;
        try{
          const result=await this.request('terminal.unsubscribe',{subscriptionId:`${state.terminal}:${this.#options.deviceToken}`,requestId:state.requestId});
          if(!isRecord(result)||result.unsubscribed!==true)this.#fail('closed');
        }catch{this.#fail('closed');} // Closing releases uncertain server registration; never retry a write.
      },
    });
  }

  /** Read one original opening snapshot, then release only this frame's stream before returning. */
  async readStructuredSnapshot(sessionId:string):Promise<unknown>{
    const address={requestId:''};let result:unknown;let failed=false;let failure:unknown;
    try{result=await this.#request('agentSession.subscribe',{sessionId},undefined,address);}
    catch(error){failed=true;failure=error;}
    if(this.#phase==='ready'&&address.requestId){
      try{
        const end=await this.#request('agentSession.unsubscribe',{sessionId,subscriptionId:address.requestId});
        if(!isRecord(end)||end.unsubscribed!==true)throw new DirectTransportError('closed');
      }catch{this.#fail('closed');throw new DirectTransportError('closed');}
    }else if(!failed){
      // A valid opening frame is insufficient if the connection ended before its cleanup.
      throw new DirectTransportError('closed');
    }
    if(failed)throw failure;
    return result;
  }

  #request(method:string,params?:Record<string,unknown>,lease?:InputLeaseState,address?:{requestId:string}):Promise<unknown>{
    if (this.#phase !== 'ready') return Promise.reject(new DirectTransportError(this.#phase === 'closed' ? 'closed' : 'not_connected'));
    return new Promise((resolve, reject) => {
      const id = `deck-${++this.#counter}`;
      if(address)address.requestId=id;
      if(lease){lease.requestId=id;this.#inputLeases.set(id,lease);}
      const timer = setTimeout(() => {
        if (!this.#pending.delete(id)) return;
        reject(new DirectTransportError('request_timeout'));
        // A unary deadline is not a framing error. Keep other reads and the channel alive;
        // the unchanged decoder still authenticates late frames before correlation drops them.
        // A delivered frame without a decoder callback is not pure request silence: close on deadline,
        // preserving the prior conservative recovery for dropped/desynchronized frames. This can also
        // close on a legitimate decode still pending at the deadline; it never claims authentication failed.
        // Stateful subscriptions/writes retain their conservative uncertain-cleanup behavior.
        if(!ISOLATED_READ_TIMEOUTS.has(method)||this.#unclassifiedInbound>0)this.#fail('closed');
      }, this.#requestTimeoutMs);
      this.#pending.set(id, { resolve, reject, timer, ...(address?{structuredSnapshot:true as const}:{}) });
      let sent: boolean;
      try {
        // Original mobile terminal input uses the authenticated device identity for input-floor
        // ownership. Keep that credential in this boundary; callers cannot impersonate desktop input.
        const wireParams=['terminal.send','terminal.subscribe','terminal.unsubscribe'].includes(method)
          ? {...params,client:{id:this.#options.deviceToken,type:'mobile'}}
          : params;
        sent = this.#framing!.sendText(JSON.stringify(buildDirectRpcWireRequest({ id, method, params:wireParams }, this.#options.deviceToken)));
      } catch {
        this.#settle(id)?.reject(new DirectTransportError('protocol_error'));
        this.#fail('protocol_error');
        return;
      }
      if (!sent) this.#settle(id)?.reject(new DirectTransportError('not_connected'));
    });
  }

  close(): void {
    this.#fail('closed');
  }

  #start(): Promise<DirectE2EETransport> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.#fail(this.#opened ? 'handshake_timeout' : 'connect_failed'), this.#connectTimeoutMs);
      this.#connect = { resolve, reject, timer };
      const log = (level: string, message: string) => this.#options.onLog?.(level, message);
      try {
        this.#framing = (this.#options.createFraming ?? createDirectSocketFraming)({
          framing: 'v2',
          mayUseLegacy: () => false,
          socket: this.#socket as unknown as WebSocket,
          serverPublicKeyB64: this.#options.hostPublicKeyB64,
          deviceToken: this.#options.deviceToken,
          // The framing may pass a detail string; it is dropped on purpose.
          emitLog: (level, message) => log(level, message),
          events: {
            onReadyAccepted: () => { this.#classifiedInbound(); this.#readyAccepted = true; log('info', 'ready accepted'); },
            onAuthenticated: () => {this.#classifiedInbound();this.#authenticated();},
            onText: (text) => {this.#classifiedInbound();this.#reply(text);},
            onBinary: () => this.#classifiedInbound(),
            // Before the host's ready was accepted the pinned key did not match: not a rejected token.
            onAuthRejected: () => this.#fail(this.#readyAccepted ? 'auth_rejected' : 'host_mismatch'),
            onProtocolError: () => this.#fail('protocol_error'),
          },
        });
        this.#listen('open', () => {
          // A socket without removeEventListener can still deliver events after the transport ended.
          if (this.#phase !== 'connecting' || this.#opened) return;
          this.#opened = true;
          try { this.#framing!.start(); } catch { this.#fail('connect_failed'); }
        });
        this.#listen('message', (event) => {
          if (this.#phase === 'closed') return;
          const data = event?.data;
          // Bounded before anything parses it, with a much tighter bound until the host is authenticated.
          if (frameSize(data) > (this.#phase === 'ready' ? this.#maxFrameChars : PRE_AUTH_FRAME_CHARS)) { this.#fail('protocol_error'); return; }
          this.#unclassifiedInbound++;
          try { this.#framing!.handleInbound(data); } catch { this.#fail('protocol_error'); }
        });
        this.#listen('error', () => this.#fail(this.#phase === 'ready' ? 'closed' : 'connect_failed'));
        this.#listen('close', () => this.#fail(this.#phase === 'ready' ? 'closed' : 'connect_failed'));
      } catch {
        // A throwing framing factory or socket carries key material or the token in its message: only a code survives.
        this.#fail('connect_failed');
      }
    });
  }

  #classifiedInbound():void {
    // Only delivered frames create observations; control notifications must never underflow the balance.
    this.#unclassifiedInbound=Math.max(0,this.#unclassifiedInbound-1);
  }

  #listen(type: string, listener: (event: any) => void): void {
    this.#socket.addEventListener(type, listener);
    this.#listeners.push([type, listener]);
  }

  #authenticated(): void {
    if (this.#phase !== 'connecting' || !this.#connect) return;
    this.#phase = 'ready';
    clearTimeout(this.#connect.timer);
    this.#connect.resolve(this);
    this.#connect = undefined;
  }

  #reply(text: string): void {
    if (this.#phase !== 'ready') return;
    // Oversized or unparseable input is never trusted; a frame that is not ours is simply ignored.
    if (text.length > this.#maxReplyChars) { this.#fail('protocol_error'); return; }
    let message: unknown;
    try { message = JSON.parse(text); } catch { return; }
    if (!isRecord(message) || typeof message.id !== 'string' || typeof message.type === 'string') return;
    const lease=this.#inputLeases.get(message.id);
    if(lease&&message.ok===true&&message.streaming===true){
      const event=message.result;
      if(isRecord(event)&&event.type==='subscribed'&&event.streamId===null&&Array.isArray(event.lines)&&event.lines.length===0&&event.truncated===false&&!lease.active){
        lease.active=true;this.#settle(message.id)?.resolve(event);return;
      }
      if(isRecord(event)&&event.type==='end'){
        lease.active=false;this.#inputLeases.delete(message.id);this.#settle(message.id)?.reject(new DirectTransportError('closed'));return;
      }
      this.#fail('protocol_error');return;
    }
    if(lease){lease.active=false;this.#inputLeases.delete(message.id);if(message.ok===true){this.#fail('protocol_error');return;}}
    const entry = this.#settle(message.id);
    if (!entry) return;
    if (message.ok === true) {
      if(entry.structuredSnapshot&&!(message.streaming===true&&isRecord(message.result)&&message.result.type==='snapshot')){
        entry.reject(new DirectTransportError('protocol_error'));this.#fail('protocol_error');return;
      }
      entry.resolve(message.result);
    } else if (message.ok === false) {
      const code = isRecord(message.error) && typeof message.error.code === 'string' && RPC_CODE.test(message.error.code) ? message.error.code : undefined;
      entry.reject(new DirectTransportError('rpc_error', code));
    } else {
      entry.reject(new DirectTransportError('protocol_error'));
    }
  }

  #settle(id: string): Pending | undefined {
    const entry = this.#pending.get(id);
    if (!entry) return undefined;
    this.#pending.delete(id);
    clearTimeout(entry.timer);
    return entry;
  }

  /** The single exit: reject everything waiting, release the framing and the socket, once. */
  #fail(code: DirectTransportCode): void {
    if (this.#phase === 'closed') return;
    this.#phase = 'closed';
    for(const lease of this.#inputLeases.values())lease.active=false;
    this.#inputLeases.clear();
    const error = () => new DirectTransportError(code);
    if (this.#connect) {
      clearTimeout(this.#connect.timer);
      this.#connect.reject(error());
      this.#connect = undefined;
    }
    // Deleting the current entry while iterating a Map is well defined.
    for (const id of this.#pending.keys()) this.#settle(id)?.reject(error());
    for (const [type, listener] of this.#listeners) {
      try { this.#socket.removeEventListener?.(type, listener); } catch { /* the socket is being dropped */ }
    }
    // Closing a socket that is still CONNECTING can report an 'error' later; with no listener that would be uncaught.
    try { this.#socket.addEventListener('error', noop); } catch { /* the socket is being dropped */ }
    try { this.#framing?.dispose(); } catch { /* nothing left to release */ }
    try { this.#socket.close(); } catch { /* already closed */ }
  }
}

export function connectDirectTransport(options: DirectTransportOptions): Promise<DirectE2EETransport> {
  return DirectE2EETransport.open(options);
}
