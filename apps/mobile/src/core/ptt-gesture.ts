import {classifyNavigation,type NavigationIntent} from './voice-navigation';

export const PTT_HOLD_MS=350;
interface PttPort {
 now():number;enabled():boolean;phase():string;
 start():void;finish():void;cancel():void;
}
/** Gesture time belongs to the press, independently of asynchronous microphone startup. */
export function createPttGesture(port:PttPort){
 let pressedAt:number|null=null,active=false,finishRequested=false,finishIssued=false;
 const requestFinish=()=>{
  if(!active)return;finishRequested=true;
  if(!finishIssued){finishIssued=true;port.finish();}
 };
 return{
  pressIn(){
   if(!port.enabled())return;
   if(active){if(pressedAt===null)requestFinish();return;}
   const now=port.now();if(!Number.isFinite(now))return;
   active=true;pressedAt=now;finishRequested=false;finishIssued=false;port.start();
  },
  pressOut(){
   if(pressedAt===null||!active)return;
   const elapsed=port.now()-pressedAt;pressedAt=null;
   if(!Number.isFinite(elapsed)||elapsed<0){this.cancel();return;}
   if(elapsed>=PTT_HOLD_MS)requestFinish();
  },
  observe(phase:string){
   if(phase==='recording'&&finishRequested)requestFinish();
   if(['idle','draft','error'].includes(phase)){active=false;pressedAt=null;finishRequested=false;finishIssued=false;}
  },
  cancel(){
   const owned=active;active=false;pressedAt=null;finishRequested=false;finishIssued=false;
   if(owned)port.cancel();
  }
 };
}
export interface CapturedVoiceContext {key:string|null;generation:number|null;labels:readonly{key:string;label:string}[];frameId?:string}
export type VoiceNavigationAction=Exclude<NavigationIntent,{kind:'dictation'}|{kind:'ambiguous'}>;
export interface CapturedVoiceDraft {text:string;targetKey:string|null;generation:number|null;ambiguous:boolean;destinationResolved:boolean;frameId?:string;targetChanged?:true}
/** Matching never alters the transcript or its starting-target provenance. Canceled speech cannot navigate. */
export function routeCapturedVoice(text:string,context:CapturedVoiceContext,canceled:boolean,currentLabels?:CapturedVoiceContext['labels']):{kind:'navigate';intent:VoiceNavigationAction}|{kind:'draft';draft:CapturedVoiceDraft}{
 const intent=classifyNavigation(text,'both',currentLabels??context.labels);
 if(!canceled&&intent.kind!=='dictation'&&intent.kind!=='ambiguous')return{kind:'navigate',intent};
 const ambiguous=intent.kind==='ambiguous';
 return{kind:'draft',draft:{text,targetKey:context.key,generation:context.generation,frameId:context.frameId,ambiguous,destinationResolved:!canceled&&!ambiguous&&context.key!==null&&(currentLabels===undefined||currentLabels.some(label=>label.key===context.key))}};
}
