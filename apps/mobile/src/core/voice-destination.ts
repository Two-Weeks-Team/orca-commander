import {bindKey,type DeckItem} from './deck-model';
import type {CapturedVoiceDraft} from './ptt-gesture';
interface Context {live:boolean;hostId?:string;generation:number|null;agents:readonly DeckItem[];present:ReadonlySet<string>;selected:string|null}
/** A proposal only: the owner must prepare, read its identity/content, and obtain explicit confirmation. */
export function resolveVoiceDestination(draft:CapturedVoiceDraft,completed:boolean,context:Context):{key:string;generation:number;source:'captured'}|null{
 if(!completed||!draft.text.trim()||!context.live||!context.hostId||context.generation===null||!Number.isSafeInteger(context.generation)||context.generation<0)return null;
 const structured=(key:string|null)=>context.agents.some(a=>!!a.nativeRequest&&bindKey(a)===key&&a.target.hostId===context.hostId&&a.target.connectionGeneration===context.generation&&context.present.has(bindKey(a)));
 // A selected structured question/permission belongs to its existing reply gate, never a fallback prompt.
 if(draft.generation===context.generation&&structured(draft.targetKey))return null;
 const rows=context.agents.filter(a=>!a.nativeRequest&&a.target.hostId===context.hostId&&a.target.connectionGeneration===context.generation&&!!a.target.terminalId&&context.present.has(bindKey(a)));
 const unique=(key:string|null)=>key!==null&&rows.filter(a=>bindKey(a)===key).length===1?key:null;
 if(draft.ambiguous||!draft.destinationResolved||draft.targetChanged||draft.generation!==context.generation||draft.targetKey!==context.selected)return null;
 const captured=unique(draft.targetKey);
 if(captured)return{key:captured,generation:context.generation,source:'captured'};
 return null;
}
