import type {CapturedVoiceDraft} from './ptt-gesture';

// The text ceiling is the existing dictation/typed-send contract (UTF-16 units).
// 32 regular entries is an explicit local policy, not a documented device acceptance result.
export const MAX_VOICE_DRAFT_UNITS=32768,MAX_VOICE_DRAFTS=32;
export interface VoiceDraftInboxEntry {
 readonly id:string;readonly captureId:string|null;
 readonly captured:Readonly<CapturedVoiceDraft>;readonly text:string;readonly overflow:boolean;
}
export interface VoiceDraftInbox {
 readonly entries:readonly VoiceDraftInboxEntry[];readonly overflow:VoiceDraftInboxEntry|null;
 readonly selectedId:string|null;readonly activeCaptureId:string|null;readonly nextSequence:number;
}
export const emptyVoiceDraftInbox=():VoiceDraftInbox=>Object.freeze({entries:Object.freeze([]),overflow:null,selectedId:null,activeCaptureId:null,nextSequence:1});
export function voiceCaptureAvailability(state:VoiceDraftInbox):{available:true}|{available:false;reason:'capturing'|'capacity'|'overflow'} {
 if(state.activeCaptureId!==null)return{available:false,reason:'capturing'};
 if(state.overflow!==null)return{available:false,reason:'overflow'};
 if(state.entries.length>=MAX_VOICE_DRAFTS)return{available:false,reason:'capacity'};
 return{available:true};
}
const localId=(state:VoiceDraftInbox)=>`voice-draft-${state.nextSequence}`;
/** Reserve before starting HostDictation. No two captures can reserve the same free capacity. */
export function beginVoiceCapture(state:VoiceDraftInbox):{state:VoiceDraftInbox;started:true;captureId:string}|{state:VoiceDraftInbox;started:false;reason:'capturing'|'capacity'|'overflow'} {
 const availability=voiceCaptureAvailability(state);
 if(!availability.available)return{state,started:false,reason:availability.reason};
 const captureId=localId(state);
 return{state:Object.freeze({...state,activeCaptureId:captureId,nextSequence:state.nextSequence+1}),started:true,captureId};
}
/** Cancel only the reservation. A subsequent retained partial is still accepted explicitly as a late result. */
export function cancelVoiceCapture(state:VoiceDraftInbox,captureId:string):VoiceDraftInbox {
 return state.activeCaptureId===captureId?Object.freeze({...state,activeCaptureId:null}):state;
}
const allEntries=(state:VoiceDraftInbox)=>state.overflow?[...state.entries,state.overflow]:state.entries;
const sameCapture=(a:CapturedVoiceDraft,b:CapturedVoiceDraft)=>a.text===b.text&&a.targetKey===b.targetKey&&a.generation===b.generation&&a.frameId===b.frameId&&a.ambiguous===b.ambiguous&&a.destinationResolved===b.destinationResolved&&a.targetChanged===b.targetChanged;
export type AppendVoiceDraftResult=
 |{state:VoiceDraftInbox;accepted:true;id:string;overflow:boolean}
 |{state:VoiceDraftInbox;accepted:false;reason:'invalid_text'|'overflow_full';unaccepted:CapturedVoiceDraft};
/**
 * Every arrival is a new entry, never an overwrite of an editable draft. One extra overflow entry
 * preserves a late outcome after a capacity race. No entry is deleted, retargeted or serialized.
 *
 * A fixed bound cannot retain arbitrarily many unreserved arrivals. After the explicit overflow
 * is occupied, return the original unaccepted payload to its caller without changing any state.
 * The caller must retain that result and stop capture; ignoring it is not a successful append.
 */
export function appendVoiceDraft(state:VoiceDraftInbox,draft:CapturedVoiceDraft,captureId?:string):AppendVoiceDraftResult {
 if(typeof draft.text!=='string'||draft.text.length>MAX_VOICE_DRAFT_UNITS)return{state,accepted:false,reason:'invalid_text',unaccepted:draft};
 if(captureId!==undefined){
  const duplicate=allEntries(state).find(entry=>entry.captureId===captureId&&sameCapture(entry.captured,draft));
  if(duplicate)return{state,accepted:true,id:duplicate.id,overflow:duplicate.overflow};
 }
 const reserved=captureId!==undefined&&captureId===state.activeCaptureId;
 const overflow=state.entries.length>=MAX_VOICE_DRAFTS||state.overflow!==null&&!reserved||!reserved&&(captureId!==undefined||state.activeCaptureId!==null);
 if(overflow&&state.overflow!==null)return{state,accepted:false,reason:'overflow_full',unaccepted:draft};
 const id=reserved?captureId:localId(state);
 const entry:VoiceDraftInboxEntry=Object.freeze({id,captureId:captureId??null,captured:Object.freeze({...draft}),text:draft.text,overflow});
 const next=Object.freeze({...state,entries:overflow?state.entries:Object.freeze([...state.entries,entry]),overflow:overflow?entry:state.overflow,selectedId:id,activeCaptureId:reserved?null:state.activeCaptureId,nextSequence:reserved?state.nextSequence:state.nextSequence+1});
 return{state:next,accepted:true,id,overflow};
}
export function selectVoiceDraft(state:VoiceDraftInbox,id:string):VoiceDraftInbox {
 return allEntries(state).some(entry=>entry.id===id)?Object.freeze({...state,selectedId:id}):state;
}
/** Only editable text changes. Captured target, generation, frame and original transcript remain immutable. */
export function editVoiceDraft(state:VoiceDraftInbox,id:string,text:string):{state:VoiceDraftInbox;changed:boolean;reason?:'invalid_text'|'missing'} {
 if(typeof text!=='string'||text.length>MAX_VOICE_DRAFT_UNITS)return{state,changed:false,reason:'invalid_text'};
 const existing=allEntries(state).find(entry=>entry.id===id);
 if(!existing)return{state,changed:false,reason:'missing'};
 if(existing.text===text)return{state,changed:false};
 const edited=Object.freeze({...existing,text});
 return{state:Object.freeze({...state,entries:state.entries.some(entry=>entry.id===id)?Object.freeze(state.entries.map(entry=>entry.id===id?edited:entry)):state.entries,overflow:state.overflow?.id===id?edited:state.overflow}),changed:true};
}

/** Call only after explicit owner confirmation. Capture/arrival/capacity paths never discard drafts. */
export function discardVoiceDraft(state:VoiceDraftInbox,id:string):VoiceDraftInbox {
 if(id===state.activeCaptureId)return state;
 const before=allEntries(state),index=before.findIndex(entry=>entry.id===id);
 if(index<0)return state;
 const entries=state.entries.some(entry=>entry.id===id)?Object.freeze(state.entries.filter(entry=>entry.id!==id)):state.entries;
 const overflow=state.overflow?.id===id?null:state.overflow;
 const after=overflow?[...entries,overflow]:entries;
 const selectedId=state.selectedId===id?(after[Math.min(index,after.length-1)]?.id??null):state.selectedId;
 return Object.freeze({...state,entries,overflow,selectedId});
}
