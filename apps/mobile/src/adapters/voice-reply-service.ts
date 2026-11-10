import {READ_FRESH_MS} from '../core/read-freshness';
import {buildReplySpeechSegments,createReplyNarrator} from '../core/reply-narration';
import {observeVoiceReply} from '../core/voice-reply-observation';
import type {TerminalReplyTarget,TerminalReplyEvidence} from './terminal-reply-evidence';
import type {NativeSpeech,SpeechLanguage} from './native-speech';
import type {AudioArbiter} from './audio-arbiter';
import type {ReplySpeechSnapshot} from './reply-speech-preferences';
export interface VoiceReplyBinding extends TerminalReplyTarget {id:string;hostId:string;generation:number;title:string;place:string}
export interface ReplyRead {reply:TerminalReplyEvidence|undefined;issuedAt:number;epochChanged:boolean}
interface Options {
 read(binding:VoiceReplyBinding):Promise<ReplyRead|undefined>;speech:NativeSpeech;audio:AudioArbiter;
 preferences():ReplySpeechSnapshot;now():number;foreground():boolean;isCurrent(binding:VoiceReplyBinding):boolean;
 language():SpeechLanguage;intro(binding:VoiceReplyBinding):string;remainder():string;waitingNotice():string;
}
interface Watch {binding:VoiceReplyBinding;baseline:TerminalReplyEvidence;last:ReplyRead;reading:boolean;canceled:boolean;body?:string}
export type VoiceReplyPhase='idle'|'waiting'|'speaking'|'uncertain';
/** Wait for real ownership release, never release a microphone or speech lease on behalf of its owner. */
export function waitForAudioIdle(audio:AudioArbiter,foreground:()=>boolean,timeoutMs=2000):Promise<boolean>{
 if(!foreground())return Promise.resolve(false);if(audio.getSnapshot().kind===null)return Promise.resolve(true);
 return new Promise(resolve=>{let ended=false,off=()=>{};const finish=(value:boolean)=>{if(ended)return;ended=true;clearTimeout(timer);off();resolve(value);};const timer=setTimeout(()=>finish(false),timeoutMs);off=audio.subscribe(()=>{if(!foreground())finish(false);else if(audio.getSnapshot().kind===null)finish(true);});if(audio.getSnapshot().kind===null)finish(foreground());});
}
/** Accepted-voice notifications only. Request bodies/replies stay in memory and grant no send authority. */
export function createVoiceReplyService(options:Options){
 const narrator=createReplyNarrator(options.speech),pending=new Map<string,Watch>(),acceptedIds=new Set<string>(),listeners=new Set<()=>void>();
 let active:Watch|undefined,readingLoop=false,disposed=false,epoch=0;
 let snapshot:Readonly<{phase:VoiceReplyPhase}>=Object.freeze({phase:'idle'});
 const enabled=()=>{const p=options.preferences();return !disposed&&options.foreground()&&p.phase==='ready'&&!p.error&&p.enabled;};
 const fresh=(read:ReplyRead|undefined)=>!!read&&Number.isFinite(read.issuedAt)&&options.now()>=read.issuedAt&&options.now()-read.issuedAt<=READ_FRESH_MS;
 const owned=(watch:Watch)=>enabled()&&!watch.canceled&&pending.get(watch.binding.id)===watch&&options.isCurrent(watch.binding);
 const publish=()=>{
  const phase:VoiceReplyPhase=options.speech.getSnapshot().phase==='uncertain'?'uncertain':active?'speaking':pending.size?'waiting':'idle';
  if(snapshot.phase===phase)return;snapshot=Object.freeze({phase});for(const fn of listeners){try{fn();}catch{/* observers own no audio */}}
 };
 const discard=(watch:Watch)=>{watch.canceled=true;if(active===watch){narrator.cancel();active=undefined;}if(pending.get(watch.binding.id)===watch)pending.delete(watch.binding.id);publish();};
 const cancel=()=>{epoch++;for(const watch of [...pending.values()])discard(watch);narrator.cancel();publish();};
 return{
  getSnapshot:()=>snapshot,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},cancel,
  async beforeCapture(){cancel();return waitForAudioIdle(options.audio,options.foreground);},
  async capture(binding:VoiceReplyBinding):Promise<(()=>boolean)|undefined>{
   if(!enabled()||!options.isCurrent(binding)||acceptedIds.has(binding.id))return;
   const b:VoiceReplyBinding={id:binding.id,hostId:binding.hostId,generation:binding.generation,worktreeId:binding.worktreeId,paneKey:binding.paneKey,handle:binding.handle,incarnationId:binding.incarnationId,title:binding.title,place:binding.place};
   const scope=epoch;let read:ReplyRead|undefined;try{read=await options.read(b);}catch{return;}
   if(scope!==epoch||!read?.reply||!fresh(read)||!enabled()||!options.isCurrent(b)||!['idle','done'].includes(read.reply.state)||read.reply.interrupted||read.reply.sessionBoundary||read.reply.unconfirmed||read.reply.stopping)return;
   const baseline=read.reply;let consumed=false;
   return()=>{
    if(consumed)return false;consumed=true;
    if(scope!==epoch||!enabled()||!options.isCurrent(b)||acceptedIds.has(b.id)||acceptedIds.size>=256)return false;
    acceptedIds.add(b.id);
    for(const old of [...pending.values()])if(old.binding.hostId===b.hostId&&old.binding.worktreeId===b.worktreeId&&old.binding.paneKey===b.paneKey)discard(old);
    if(pending.size<16){pending.set(b.id,{binding:b,baseline,last:read!,reading:false,canceled:false});publish();return true;}publish();return false;
   };
  },
  async tick():Promise<void>{
   if(readingLoop||disposed)return;readingLoop=true;
   try{
    if(!enabled()){cancel();return;}
    for(const watch of [...pending.values()]){
     if(!owned(watch)){discard(watch);continue;}
     let read:ReplyRead|undefined;try{read=await options.read(watch.binding);}catch{/* optional read only */}
     if(!owned(watch)){discard(watch);continue;}
     if(read&&!read.reply){discard(watch);continue;}
     if(!read?.reply||!fresh(read)){if(watch.reading&&!fresh(watch.last))discard(watch);continue;}
     watch.last=read;
     const found=observeVoiceReply(watch.baseline,read.reply,read.issuedAt,options.now());
     if(found==='replaced'||typeof found==='object'&&found.kind==='stopped'){discard(watch);continue;}
     if(watch.reading){if(read.reply.stopping||found==='wait'&&read.reply.state==='working')discard(watch);continue;}
     if(found==='wait'||active||options.audio.getSnapshot().kind!==null)continue;
     const parts=buildReplySpeechSegments(options.intro(watch.binding),found.body,options.remainder());
     const segments=[...parts.intro,...parts.body,...(parts.continuation?[parts.continuation]:[]),...(found.kind==='waiting'?[options.waitingNotice()]:[])];
     watch.reading=true;active=watch;publish();
     void narrator.read({id:watch.binding.id,segments,language:options.language(),rate:()=>options.preferences().rate,isCurrent:()=>owned(watch)&&fresh(watch.last)}).then(()=>{if(pending.get(watch.binding.id)===watch)discard(watch);publish();});
    }
   }finally{readingLoop=false;publish();}
  },
  dispose(){cancel();disposed=true;listeners.clear();},
 };
}
