import type {HostDictation} from './host-dictation';
type Voice=Pick<HostDictation,'getSnapshot'|'subscribe'|'start'|'finish'|'cancel'>;
interface Timers<H> {set(fn:()=>void,ms:number):H;clear(id:H):void}
export type VoiceAnswerPhase='preparing'|'recording'|'finishing'|'idle';
export type VoiceAnswer={kind:'final';text:string}|{kind:'timeout'}|{kind:'canceled'};
/** Separate from editable dictation: partials never leave this short, scoped answer capture. */
export function createScopedVoiceAnswer<H>(voice:Voice,timers:Timers<H>){
 type Run={settled:boolean;finishScheduled:boolean;deadline?:H;finishTimer?:H;off?:()=>void;onPhase?:(phase:VoiceAnswerPhase)=>void;phase?:VoiceAnswerPhase;resolve:(result:VoiceAnswer)=>void};
 let active:Run|undefined;
 const publishPhase=(run:Run,phase:VoiceAnswerPhase)=>{if(run.phase===phase)return;run.phase=phase;try{run.onPhase?.(phase);}catch{/* Display observers never control answer capture. */}};
 const settle=(run:Run,result:VoiceAnswer)=>{
  if(active!==run||run.settled)return;
  run.settled=true;active=undefined;publishPhase(run,'idle');
  run.off?.();
  if(run.deadline!==undefined)timers.clear(run.deadline);
  if(run.finishTimer!==undefined)timers.clear(run.finishTimer);
  // Detach and settle ownership before cancel() publishes a retained partial draft.
  if(result.kind!=='final')void voice.cancel().catch(()=>undefined);
  run.resolve(result);
 };
 return {
  listen(onPhase?:(phase:VoiceAnswerPhase)=>void):Promise<VoiceAnswer>{
   if(active)return Promise.resolve({kind:'canceled'});
   return new Promise(resolve=>{
    const run:Run={settled:false,finishScheduled:false,resolve,onPhase};active=run;publishPhase(run,'preparing');
    run.off=voice.subscribe(snapshot=>{
     if(active!==run)return;
     if(snapshot.phase==='recording'&&!run.finishScheduled){
      run.finishScheduled=true;publishPhase(run,'recording');
      run.finishTimer=timers.set(()=>{
       if(active===run){publishPhase(run,'finishing');void voice.finish().catch(()=>settle(run,{kind:'canceled'}));}
      },3500);
     }
     if(snapshot.phase==='finishing')publishPhase(run,'finishing');
     if(snapshot.phase==='draft'||snapshot.phase==='error')void Promise.resolve().then(()=>{
      if(active!==run)return;
      const latest=voice.getSnapshot();
      settle(run,latest.phase==='draft'&&!latest.error?{kind:'final',text:latest.text}:{kind:'canceled'});
     });
    });
    run.deadline=timers.set(()=>settle(run,{kind:'timeout'}),8000);
    void voice.start().then(()=>{
     if(active===run&&!['loading','starting','recording','finishing'].includes(voice.getSnapshot().phase))settle(run,{kind:'canceled'});
    },()=>settle(run,{kind:'canceled'}));
   });
  },
  cancel(){if(active)settle(active,{kind:'canceled'});},
 };
}
