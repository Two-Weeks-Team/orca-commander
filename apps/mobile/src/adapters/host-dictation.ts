import {READ_FRESH_MS} from '../core/read-freshness';
import type {ActionChannel} from './action-client';
import {encodeBase64Bytes} from '../upstream/orca-1.4.245/mobile/src/transport/base64-byte-codec';

export interface Microphone {permission():Promise<boolean>;open(onData:(bytes:Uint8Array)=>void,onInterrupt:()=>void):Promise<boolean>;close():void}
export type VoiceAvailability='unknown'|'disabled'|'model_missing'|'model_not_ready'|'ready_local'|'ready_cloud'|'unavailable';
export interface DictationSnapshot {phase:'idle'|'loading'|'starting'|'recording'|'finishing'|'draft'|'error';availability:VoiceAvailability;text:string;audio?:'waiting'|'quiet'|'heard';level?:number;preparing?:boolean;modelLabel?:string;error?:'microphone_denied'|'capture_failed'|'connection_lost'|'host_failed'|'interrupted'|'audio_overflow'}
/** Target-free, transient presentation. It never supplies an action target or cached speech body. */
export type VoiceDisplay=Pick<DictationSnapshot,'phase'|'text'|'level'|'preparing'|'error'>&{targetChangeBlocked?:boolean;elapsedMs?:number};
export interface DictationTiming {now():number;set(fn:()=>void,ms:number):unknown;clear(timer:unknown):void}
const timing:DictationTiming={now:()=>performance.now(),set:(fn,ms)=>{const t=setTimeout(fn,ms);(t as unknown as {unref?:()=>void}).unref?.();return t;},clear:t=>clearTimeout(t as ReturnType<typeof setTimeout>)};
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const MAX_PENDING_BYTES=320_000,CHUNK_BYTES=16_000,MAX_CAPTURE_MS=120_000;
interface Model {availability:VoiceAvailability;modelId?:string;modelLabel?:string}
interface Active {channel:ActionChannel;epoch:number;id?:string;modelId?:string;cancelSent:boolean;startAttempted:boolean;micOpened:boolean;closed:boolean;ready:boolean;stopped:boolean;draining:boolean;seq:number;pending:number;buffer:Uint8Array;startedAt?:number;levelAt:number;timer?:unknown;done:Promise<void>;resolve():void}

/** Host speech only. PCM stays bounded in memory until the original start is verified. No send/action capability. */
export class HostDictation {
 private snapshot:DictationSnapshot={phase:'idle',availability:'unknown',text:''};
 private listeners=new Set<(s:DictationSnapshot)=>void>();
 private active?:Active;
 private epoch=0;
 private permissionPending?:Active;
 constructor(private readonly channel:()=>ActionChannel|null,private readonly microphone:Microphone,private readonly newId:()=>string,private readonly now=Date.now,private readonly clock:DictationTiming=timing){}
 getSnapshot():DictationSnapshot{return this.snapshot;}
 handleAppState(state:string):void{if(state==='background'||state!=='active'&&(!this.active||this.permissionPending!==this.active))void this.cancel();}
 subscribe(listener:(s:DictationSnapshot)=>void):()=>void{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
 private publish(patch:Partial<DictationSnapshot>):void{this.snapshot={...this.snapshot,...patch};for(const l of this.listeners){try{l(this.snapshot);}catch{/* views do not own capture */}}}
 private live():ActionChannel|null{const c=this.channel();const age=c?this.now()-c.confirmedAt:NaN;return c&&age>=0&&age<=READ_FRESH_MS?c:null;}
 private same(c:ActionChannel):boolean{const n=this.live();return!!n&&n.hostId===c.hostId&&n.generation===c.generation&&n.transport===c.transport;}
 private owned(a:Active):boolean{return this.active===a&&a.epoch===this.epoch;}
 private async model(c:ActionChannel):Promise<Model>{
  const reply=await c.transport.request('speech.models.list');
  if(!record(reply)||!Array.isArray(reply.models))return{availability:'unavailable'};
  if(reply.enabled!==true)return{availability:'disabled'};
  const model=reply.models.find((m:unknown)=>record(m)&&m.id===reply.selectedModelId);
  if(!record(model)||typeof model.id!=='string'||!model.id)return{availability:'model_missing'};
  const modelLabel=typeof model.label==='string'?model.label:model.id;
  if(model.status!=='ready')return{availability:'model_not_ready',modelLabel};
  if(model.provider!=='local'&&model.provider!=='openai')return{availability:'unavailable',modelLabel};
  return{availability:model.provider==='local'?'ready_local':'ready_cloud',modelId:model.id,modelLabel};
 }
 async refresh():Promise<void>{
  if(this.active)return;
  const c=this.live(),epoch=this.epoch;if(!c){this.publish({availability:'unavailable'});return;}
  try{const model=await this.model(c);if(epoch===this.epoch&&!this.active&&this.same(c))this.publish({availability:model.availability,modelLabel:model.modelLabel});}
  catch{if(epoch===this.epoch&&!this.active)this.publish({availability:'unavailable'});}
 }
 private close(a:Active):void{if(a.closed)return;a.closed=true;this.microphone.close();if(a.timer!==undefined){this.clock.clear(a.timer);a.timer=undefined;}}
 private cleanup(a:Active):void{if(a.id&&a.startAttempted&&!a.cancelSent){a.cancelSent=true;void a.channel.transport.request('speech.dictation.cancel',{dictationId:a.id}).catch(()=>undefined);}}
 private end(a:Active,patch:Partial<DictationSnapshot>):void{
  if(!this.owned(a))return;this.active=undefined;this.epoch++;this.close(a);a.buffer=new Uint8Array();a.resolve();this.publish({preparing:false,level:0,...patch});
 }
 private fail(a:Active,error:DictationSnapshot['error']):void{if(!this.owned(a))return;this.end(a,{phase:'error',error});this.cleanup(a);}
 private beginClock(a:Active):boolean{
  const at=this.clock.now();if(!Number.isFinite(at)||a.startedAt!==undefined&&(at<a.startedAt||at-a.startedAt>=MAX_CAPTURE_MS)){this.fail(a,'audio_overflow');return false;}
  if(a.startedAt===undefined){a.startedAt=at;a.timer=this.clock.set(()=>{if(this.owned(a)&&!a.stopped)this.fail(a,'audio_overflow');},MAX_CAPTURE_MS);}
  return true;
 }
 async start():Promise<void>{
  if(this.active)return;
  const c=this.live();if(!c){this.publish({phase:'idle',availability:'unavailable'});return;}
  let resolve!:()=>void;const done=new Promise<void>(r=>{resolve=r;});
  const a:Active={channel:c,epoch:++this.epoch,cancelSent:false,startAttempted:false,micOpened:false,closed:false,ready:false,stopped:false,draining:false,seq:0,pending:0,buffer:new Uint8Array(),levelAt:-Infinity,done,resolve};
  this.active=a;this.publish({phase:'starting',text:'',audio:'waiting',level:0,preparing:true,error:undefined});
  try{
   let granted:boolean;this.permissionPending=a;try{granted=await this.microphone.permission();}finally{if(this.permissionPending===a)this.permissionPending=undefined;}
   if(!this.owned(a))return;
   if(!granted){this.fail(a,'microphone_denied');return;}
   if(!this.same(c)){this.fail(a,'connection_lost');return;}
   const opened=await this.microphone.open(bytes=>this.feed(a,bytes),()=>this.fail(a,'interrupted'));
   if(!this.owned(a))return; // native adapter owns completion of canceled initialization/teardown.
   if(!opened){this.fail(a,'capture_failed');return;}
   a.micOpened=true;if(!this.beginClock(a))return;
   this.publish({phase:'recording'});
   if(!this.owned(a))return; // publish may synchronously request finish or cancel.
   const model=await this.model(c);
   if(!this.owned(a))return;
   if(!this.same(c)){this.fail(a,'connection_lost');return;}
   this.publish({availability:model.availability,modelLabel:model.modelLabel});
   if(!this.owned(a))return;
   if(!model.modelId){this.end(a,{phase:'idle'});return;}
   a.id=this.newId();a.modelId=model.modelId;a.startAttempted=true;
   const started=await c.transport.request('speech.dictation.start',{dictationId:a.id,modelId:a.modelId});
   if(!this.owned(a)){this.cleanup(a);return;}
   if(!this.same(c)){this.fail(a,'connection_lost');return;}
   if(!record(started)||started.dictationId!==a.id||started.modelId!==a.modelId)throw new Error('invalid_start');
   a.ready=true;this.publish({preparing:false});if(this.owned(a))void this.pump(a);
  }catch{if(this.owned(a))this.fail(a,this.same(c)?'host_failed':'connection_lost');else this.cleanup(a);}
 }
 private feed(a:Active,bytes:Uint8Array):void{
  if(!this.owned(a)||a.stopped||a.closed)return;
  if(!this.same(a.channel)){this.fail(a,'connection_lost');return;}
  if(bytes.byteLength%2!==0||bytes.byteLength+a.buffer.length+a.pending>MAX_PENDING_BYTES){this.fail(a,'audio_overflow');return;}
  if(!bytes.length)return;if(!this.beginClock(a))return;
  // One owned copy: native event arrays may be reused after delivery.
  const merged=new Uint8Array(a.buffer.length+bytes.length);merged.set(a.buffer);merged.set(bytes,a.buffer.length);a.buffer=merged;
  let sum=0,heard=false;for(let i=0;i<bytes.length;i+=2){const raw=bytes[i]!|(bytes[i+1]!<<8),sample=raw>=32768?raw-65536:raw;sum+=(sample/32768)**2;if(Math.abs(sample)>128)heard=true;}
  const audio=this.snapshot.audio==='heard'||heard?'heard':'quiet',at=this.clock.now();
  if(at-a.levelAt>=100){a.levelAt=at;const rms=Math.sqrt(sum/(bytes.length/2)),level=Math.max(0,Math.min(1,((20*Math.log10(Math.max(rms,1e-5))+80)/80)))**2;this.publish({audio,level});}
  else if(audio!==this.snapshot.audio)this.publish({audio});
  if(this.owned(a)&&a.ready)void this.pump(a);
 }
 private async pump(a:Active):Promise<void>{
  if(!this.owned(a)||!a.ready||a.draining)return;a.draining=true;
  try{
   while(this.owned(a)&&(a.buffer.length>=CHUNK_BYTES||a.stopped&&a.buffer.length>0)){
    if(!this.same(a.channel)){this.fail(a,'connection_lost');return;}
    const size=Math.min(CHUNK_BYTES,a.buffer.length),bytes=a.buffer.slice(0,size);a.buffer=a.buffer.slice(size);a.pending=size;
    const seq=a.seq++;
    const reply=await a.channel.transport.request('speech.dictation.chunk',{dictationId:a.id,audioBase64:encodeBase64Bytes(bytes),sampleRate:16000,seq});
    a.pending=0;
    if(!this.owned(a))return;
    if(!this.same(a.channel)){this.fail(a,'connection_lost');return;}
    if(!record(reply)||reply.dictationId!==a.id)throw new Error('invalid_chunk');
    if(typeof reply.text==='string'&&reply.text.length<=32768)this.publish({text:reply.text});
   }
   if(this.owned(a)&&a.stopped){
    if(!this.same(a.channel)){this.fail(a,'connection_lost');return;}
    const reply=await a.channel.transport.request('speech.dictation.finish',{dictationId:a.id});
    if(!this.owned(a))return;
    if(!this.same(a.channel)){this.fail(a,'connection_lost');return;}
    if(!record(reply)||reply.dictationId!==a.id||typeof reply.text!=='string'||reply.text.length>32768)throw new Error('invalid_final');
    this.end(a,{phase:'draft',text:reply.text,error:undefined});
   }
  }catch{if(this.owned(a))this.fail(a,this.same(a.channel)?'host_failed':'connection_lost');}
  finally{a.draining=false;}
 }
 async finish():Promise<void>{
  const a=this.active;if(!a)return;
  if(!a.micOpened){await this.cancel();return;}
  if(!a.stopped){a.stopped=true;this.close(a);this.publish({phase:'finishing',level:0});}
  if(this.owned(a)&&a.ready)void this.pump(a);await a.done;
 }
 /** No replay/background capture. Only verified partial text survives cancellation. */
 async cancel():Promise<void>{
  const a=this.active;if(!a){this.microphone.close();return;}
  this.end(a,{phase:this.snapshot.text?'draft':'idle'});this.cleanup(a);
 }
}
