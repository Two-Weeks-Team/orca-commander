import {ko} from '../i18n/ko';

export interface DeckPhrase {name:string;text:string}
export const DEFAULT_DECK_PHRASE:Readonly<DeckPhrase>=Object.freeze({name:ko['phrase.button'],text:ko['phrase.defaultText']});
export const PHRASE_EDIT_MS=3000;
export function validDeckPhrase(value:unknown):value is DeckPhrase{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const p=value as Record<string,unknown>;
 return typeof p.name==='string'&&!!p.name.trim()&&Array.from(p.name).length<=6&&!/[\r\n\u0000-\u001f\u007f]/.test(p.name)&&typeof p.text==='string'&&!!p.text.trim()&&p.text.length<=32768&&p.text.split(/\r\n|\r|\n/).length<=200&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(p.text);
}
/** One physical press can open review OR edit. Neither result is a send operation. */
export function createPhraseGesture(){
 let press:{scope:string;at:number}|null=null;
 const age=(scope:string|null,now:number)=>press&&scope===press.scope&&Number.isFinite(now)&&now>=press.at?now-press.at:null;
 return{
  begin(scope:string|null,now:number){press=scope!==null&&Number.isFinite(now)?{scope,at:now}:null;},
  cancel(){press=null;},
  progress(now:number){return press&&Number.isFinite(now)&&now>=press.at?Math.min(1,(now-press.at)/PHRASE_EDIT_MS):0;},
  long(scope:string|null,now:number):'edit'|null{const elapsed=age(scope,now);if(elapsed===null){press=null;return null;}if(elapsed<PHRASE_EDIT_MS)return null;press=null;return'edit';},
  release(scope:string|null,now:number):'confirm'|'edit'|null{const elapsed=age(scope,now);press=null;return elapsed===null?null:elapsed>=PHRASE_EDIT_MS?'edit':'confirm';},
 };
}
