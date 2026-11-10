import {en,type MessageKey} from './en';
import type {LanguagePack} from './pack';

// Explicit classifications from the design's original 65 keys / 22 critical keys.
// Every key added after that table is critical until deliberately classified here.
const nonCritical=new Set<string>([
 "cmd.content",
 "cmd.input",
 "cmd.next",
 "cmd.list",
 "ptt.hold",
 "cache.refreshing",
 "ptt.recording",
 "mode.deck",
 "state.permission",
 "state.question",
 "state.review",
 "state.working",
 "state.done",
 "state.failed",
 "state.idle",
 "state.unknown",
 "link.uncertain",
 "link.unpaired",
 "link.scan",
 "link.reconnect",
 "send.voiceDraft",
 "send.editDraft",
 "field.version",
 "field.generation",
 "status.unresolved",
 "status.inputUnknown",
 "status.inputPartial",
 "status.history",
 "status.guide",
 "list.all",
 "list.search",
 "list.noSlot",
 "key.age",
 "key.slot",
 "key.unresolved",
 "key.clear",
 "key.workingLocked",
 "common.close",
 "set.title",
 "set.language",
 "set.auto",
 "set.layout",
 "set.layoutAuto",
 "set.sound"
] as const);
export const isCriticalMessage=(key:string):boolean=>!nonCritical.has(key);
export interface CriticalReview {format:1;locale:string;key:MessageKey;source:string;translation:string}
const localeOf=(pack:LanguagePack)=>{const parts=pack.lang.split('-');return parts[0]==='zh'&&!parts.includes(pack.script)?[parts[0],pack.script,...parts.slice(1)].join('-'):pack.lang;};
/** Call only after the owner explicitly reviews this English/translated pair side by side. */
export function reviewCriticalMessage(pack:LanguagePack,key:MessageKey):CriticalReview|null {
 const translation=pack.strings[key];
 if(!isCriticalMessage(key)||typeof translation!=='string')return null;
 return Object.freeze({format:1,locale:localeOf(pack),key,source:en[key],translation});
}
export function isCriticalReviewCurrent(pack:LanguagePack,key:MessageKey,review:CriticalReview):boolean {
 return review.format===1&&review.locale===localeOf(pack)&&review.key===key&&review.source===en[key]&&review.translation===pack.strings[key];
}
