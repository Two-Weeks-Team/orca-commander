export type ConfirmationGesturePhase='idle'|'holding'|'ready'|'consumed'|'cancelled';
export type ConfirmationCancellationReason='continuity'|'disabled'|'clock'|'touch-cancel'|'lifecycle'|'context'|'explicit';
const cancellationReasons:ReadonlySet<string>=new Set(['continuity','disabled','clock','touch-cancel','lifecycle','context','explicit']);
export interface ConfirmationGestureClock {now:number;wallNow:number;preparedAt:number}
const HOLD=800;
/**
 * Local gesture authority only. The existing action client revalidates its own ticket and target.
 * Finger continuity comes from native touch events: press-in/press-out timestamps and touch-cancel.
 * A late JS timer is not evidence that the finger lifted (a real 1.15 s hold was cancelled by a 119 ms
 * JS gap on iPhone 13), so timer gaps are recorded as diagnostics only. Release still needs at least
 * 800 ms of both native touch time and foreground monotonic time.
 */
export function createConfirmationGesture(clock:ConfirmationGestureClock){
 let phase:ConfirmationGesturePhase=Number.isFinite(clock.now)?'idle':'cancelled';
 let cancellationReason:ConfirmationCancellationReason|null=phase==='cancelled'?'clock':null;
 let maxGapMs=0;
 let lastNow=clock.now,readEnd=false,disabled=false,downAt=0,nativeDownAt=0;
 const terminal=()=>phase==='consumed'||phase==='cancelled';
 const update=(now:number,_wallNow:number)=>{
  if(terminal())return false;
  if(!Number.isFinite(now)||now<lastNow){phase='cancelled';cancellationReason='clock';return false;}
  if(phase==='holding'){
   const gap=now-lastNow;
   // Timing diagnostics only: whole milliseconds, rounded up and bounded; never authority.
   maxGapMs=Math.min(60000,Math.max(maxGapMs,Math.ceil(gap)));
  }
  lastNow=now;
  return !disabled&&readEnd;
 };
 return {
  snapshot:()=>({phase,readEnd,holdMs:phase==='holding'?Math.max(0,lastNow-downAt):0,cancellationReason,maxGapMs}),
  setReadEnd(value:boolean){readEnd=value;if(!value&&!terminal())phase='idle';},
  setDisabled(value:boolean){disabled=value;if(value&&(phase==='holding'||phase==='ready')){phase='cancelled';cancellationReason='disabled';}},
  cancel(reason:ConfirmationCancellationReason='explicit'){if(!terminal()){phase='cancelled';cancellationReason=cancellationReasons.has(reason)?reason:'explicit';}},
  pulse(now:number,wallNow:number){update(now,wallNow);},
  startHold(now:number,wallNow:number,nativeTimestamp:number){
   if(!update(now,wallNow)||!Number.isFinite(nativeTimestamp)||nativeTimestamp<0)return;
   maxGapMs=0;
   phase='holding';downAt=now;nativeDownAt=nativeTimestamp;
  },
  releaseHold(now:number,wallNow:number,nativeTimestamp:number){
   if(!update(now,wallNow)||phase!=='holding')return false;
   const nativeDuration=nativeTimestamp-nativeDownAt;
   if(!Number.isFinite(nativeDuration)||nativeDuration<0){phase='cancelled';cancellationReason='clock';return false;}
   if(now-downAt<HOLD||nativeDuration<HOLD){phase='idle';return false;}
   phase='consumed';return true;
  },
  accessibleActivate(now:number,wallNow:number){
   if(!update(now,wallNow))return false;
   if(phase==='ready'){phase='consumed';return true;}
   phase='ready';return false;
  },
 };
}
