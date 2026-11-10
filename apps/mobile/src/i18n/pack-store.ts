import {en,type MessageKey} from './en';
import {parseLanguagePack,languagePackLocale,installLanguagePack,MAX_LANGUAGE_PACKS,MAX_PACK_CODE_POINTS,packCodePoints,type LanguagePack,type PackEntryIssue,type PackParseResult} from './pack';
import {isCriticalMessage,isCriticalReviewCurrent,reviewCriticalMessage,type CriticalReview} from './critical-review';

/** The adapter owns atomic/durable persistence. This store never assumes large Keychain values work. */
export interface PackValueStore {get(key:string):Promise<string|null>;set(key:string,value:string):Promise<void>}
export const PACK_STORE_KEY='deck.language-packs.v1';
export const PACK_STORE_MAX_BYTES=2*1024*1024;
export type PackStoreFailure='not_ready'|'read_only'|'invalid_pack'|'pack_limit'|'missing_pack'|'review_changed'|'not_reviewable'|'storage_limit'|'read_failed'|'invalid_store'|'write_failed'|'write_unverified';
export type PackMutationResult={ok:true}|{ok:false;reason:PackStoreFailure};
type ParseFailure=Extract<PackParseResult,{ok:false}>['reason'];
export type PackImportResult={ok:true;locale:string;issues:readonly PackEntryIssue[]}|{ok:false;reason:PackStoreFailure;parseReason?:ParseFailure};
export interface PackStoreSnapshot {
 readonly phase:'loading'|'ready'|'blocked';readonly writable:boolean;readonly busy:boolean;
 readonly packs:readonly LanguagePack[];readonly locales:readonly string[];readonly reviews:readonly CriticalReview[];
 readonly status:'idle'|'loaded'|'imported'|'reviewed'|'unreviewed'|'removed'|'rejected'|'failed';
 readonly error:PackStoreFailure|null;readonly revision:number;
}
export interface PackStore {
 getSnapshot():PackStoreSnapshot;subscribe(listener:()=>void):()=>void;
 load():Promise<PackMutationResult>;retry():Promise<PackMutationResult>;
 importPack(raw:string):Promise<PackImportResult>;
 /** Call only for an explicit review of the exact English/translated pair shown to the owner. */
 review(locale:string,key:MessageKey,expectedSource:string,expectedTranslation:string):Promise<PackMutationResult>;
 /** UI callers bind withdrawal to the immutable pack displayed before their confirmation. */
 unreview(locale:string,key:MessageKey,expectedPack?:LanguagePack):Promise<PackMutationResult>;
 /** Explicit owner action only. Loading, importing and retrying never remove a pack. */
 removePack(locale:string,expectedPack?:LanguagePack):Promise<PackMutationResult>;
}
interface StoredData {packs:readonly LanguagePack[];reviews:readonly CriticalReview[]}
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fields=(value:Record<string,unknown>,expected:readonly string[])=>Object.keys(value).length===expected.length&&Object.keys(value).every(key=>expected.includes(key));
const bytes=(value:string)=>{let count=0;for(const char of value){const cp=char.codePointAt(0)!;count+=cp<=127?1:cp<=2047?2:cp<=65535?3:4;}return count;};
const currentReviews=(packs:readonly LanguagePack[],reviews:readonly CriticalReview[])=>{
 const byLocale=new Map(packs.map(pack=>[languagePackLocale(pack),pack]));
 return reviews.filter(review=>{const pack=byLocale.get(review.locale);return !!pack&&Object.hasOwn(en,review.key)&&isCriticalMessage(review.key)&&isCriticalReviewCurrent(pack,review.key,review);});
};
/** JSON.parse alone silently accepts duplicate keys; local canonical records never contain them. */
function duplicateKeys(raw:string):boolean {
 const stack:(Set<string>|null)[]=[];
 for(let index=0;index<raw.length;index++){
  const char=raw[index];
  if(char==='"'){
   const start=index++;
   while(index<raw.length){if(raw[index]==='\\'){index+=2;continue;}if(raw[index]==='"')break;index++;}
   let next=index+1;while(/\s/.test(raw[next]??''))next++;
   if(raw[next]===':'){
    const key=JSON.parse(raw.slice(start,index+1)) as string,object=stack.at(-1);
    if(object?.has(key))return true;object?.add(key);
   }
  }else if(char==='{')stack.push(new Set());else if(char==='[')stack.push(null);else if(char==='}'||char===']')stack.pop();
 }
 return false;
}
function decode(raw:string,maxBytes:number):StoredData|null {
 if(raw.length>maxBytes||bytes(raw)>maxBytes)return null;
 let value:unknown;try{value=JSON.parse(raw);}catch{return null;}
 if(!record(value)||!fields(value,['format','packs','reviews'])||value.format!==1||!Array.isArray(value.packs)||value.packs.length>MAX_LANGUAGE_PACKS||!Array.isArray(value.reviews)||value.reviews.length>MAX_LANGUAGE_PACKS*Object.keys(en).length||duplicateKeys(raw))return null;
 const packs:LanguagePack[]=[],locales=new Set<string>();
 for(const candidate of value.packs){
  if(!record(candidate)||!fields(candidate,['format','lang','script','name','sourceVersion','strings']))return null;
  const parsed=parseLanguagePack(JSON.stringify(candidate));if(!parsed.ok)return null;
  const locale=languagePackLocale(parsed.pack);if(locales.has(locale))return null;locales.add(locale);packs.push(parsed.pack);
 }
 const reviews:CriticalReview[]=[],identities=new Set<string>();
 for(const candidate of value.reviews){
  if(!record(candidate)||!fields(candidate,['format','locale','key','source','translation'])||candidate.format!==1||typeof candidate.locale!=='string'||candidate.locale.length>35||typeof candidate.key!=='string'||candidate.key.length>256||typeof candidate.source!=='string'||packCodePoints(candidate.source)>MAX_PACK_CODE_POINTS||typeof candidate.translation!=='string'||packCodePoints(candidate.translation)>MAX_PACK_CODE_POINTS)return null;
  const identity=JSON.stringify([candidate.locale,candidate.key]);if(identities.has(identity))return null;identities.add(identity);
  reviews.push(Object.freeze({format:1,locale:candidate.locale,key:candidate.key as MessageKey,source:candidate.source,translation:candidate.translation}));
 }
 return {packs:Object.freeze(packs),reviews:Object.freeze(currentReviews(packs,reviews))};
}
const encode=(data:StoredData)=>JSON.stringify({format:1,packs:data.packs.map(pack=>({format:1,lang:pack.lang,script:pack.script,name:pack.name,sourceVersion:pack.sourceVersion,strings:pack.strings})),reviews:data.reviews.map(review=>({format:1,locale:review.locale,key:review.key,source:review.source,translation:review.translation}))});

/** Checked serialized writes, with no optimistic publication and no implicit reset after uncertain I/O. */
export function createPackStore(storage:PackValueStore,{maxValueBytes}:{maxValueBytes:number}):PackStore {
 if(!Number.isSafeInteger(maxValueBytes)||maxValueBytes<1||maxValueBytes>PACK_STORE_MAX_BYTES)throw new Error('invalid_pack_storage_limit');
 const listeners=new Set<()=>void>();let queued=0,queue=Promise.resolve();
 let snapshot:PackStoreSnapshot=Object.freeze({phase:'loading',writable:false,busy:false,packs:Object.freeze([]),locales:Object.freeze([]),reviews:Object.freeze([]),status:'idle',error:null,revision:0});
 const publish=(patch:Partial<Omit<PackStoreSnapshot,'revision'|'busy'>>={})=>{
  snapshot=Object.freeze({...snapshot,...patch,busy:queued>0,revision:snapshot.revision+1});
  for(const listener of listeners){try{listener();}catch{/* Observers never own persistence or review authority. */}}
 };
 const enqueue=<T>(operation:()=>Promise<T>):Promise<T>=>{
  queued++;const running=queue.then(operation,operation);queue=running.then(()=>undefined,()=>undefined);publish();
  return running.finally(()=>{queued--;publish();});
 };
 const unavailable=():PackMutationResult|null=>snapshot.writable?null:{ok:false,reason:snapshot.phase==='loading'?'not_ready':'read_only'};
 const rejected=(reason:PackStoreFailure):{ok:false;reason:PackStoreFailure}=>{publish({status:'rejected',error:reason});return {ok:false,reason};};
 const failed=(reason:PackStoreFailure):{ok:false;reason:PackStoreFailure}=>{
  // Keep the last checked in-memory data. The adapter may have committed before throwing.
  publish({phase:'blocked',writable:false,status:'failed',error:reason});return {ok:false,reason};
 };
 const persist=async(data:StoredData,status:PackStoreSnapshot['status']):Promise<PackMutationResult>=>{
  const raw=encode(data);if(raw.length>maxValueBytes||bytes(raw)>maxValueBytes)return rejected('storage_limit');
  try{await storage.set(PACK_STORE_KEY,raw);}catch{return failed('write_failed');}
  let readback:string|null;try{readback=await storage.get(PACK_STORE_KEY);}catch{return failed('write_unverified');}
  if(readback!==raw)return failed('write_unverified');
  const checked=decode(readback,maxValueBytes);if(!checked)return failed('write_unverified');
  publish({phase:'ready',writable:true,packs:checked.packs,locales:Object.freeze(checked.packs.map(languagePackLocale)),reviews:checked.reviews,status,error:null});return {ok:true};
 };
 const load=()=>enqueue(async():Promise<PackMutationResult>=>{
  publish({phase:'loading',writable:false,status:'idle',error:null});
  let raw:string|null;try{raw=await storage.get(PACK_STORE_KEY);}catch{return failed('read_failed');}
  const data=raw===null?{packs:Object.freeze([]),reviews:Object.freeze([])}:typeof raw==='string'?decode(raw,maxValueBytes):null;
  if(!data)return failed('invalid_store');
  publish({phase:'ready',writable:true,packs:data.packs,locales:Object.freeze(data.packs.map(languagePackLocale)),reviews:data.reviews,status:'loaded',error:null});return {ok:true};
 });
 const mutate=(status:PackStoreSnapshot['status'],change:(data:StoredData)=>StoredData|{ok:false;reason:PackStoreFailure}):Promise<PackMutationResult>=>{
  const blocked=unavailable();if(blocked)return Promise.resolve(blocked);
  return enqueue(async()=>{
   const currentBlock=unavailable();if(currentBlock)return currentBlock;
   const candidate=change({packs:snapshot.packs,reviews:snapshot.reviews});if('ok' in candidate)return rejected(candidate.reason);
   return persist({packs:candidate.packs,reviews:currentReviews(candidate.packs,candidate.reviews)},status);
  });
 };
 return {
  getSnapshot:()=>snapshot,subscribe:listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},load,retry:load,
  importPack(raw){
   const blocked=unavailable();if(blocked&&!blocked.ok)return Promise.resolve(blocked);
   return enqueue(async():Promise<PackImportResult>=>{
    const currentBlock=unavailable();if(currentBlock&&!currentBlock.ok)return currentBlock;
    const parsed=parseLanguagePack(raw);if(!parsed.ok){rejected('invalid_pack');return {ok:false,reason:'invalid_pack',parseReason:parsed.reason};}
    const installed=installLanguagePack(snapshot.packs,parsed.pack);if(!installed.ok)return rejected(installed.reason);
    const saved=await persist({packs:installed.packs,reviews:currentReviews(installed.packs,snapshot.reviews)},'imported');
    return saved.ok?{ok:true,locale:languagePackLocale(parsed.pack),issues:parsed.issues}:saved;
   });
  },
  review(locale,key,expectedSource,expectedTranslation){return mutate('reviewed',data=>{
   const pack=data.packs.find(item=>languagePackLocale(item)===locale);if(!pack)return {ok:false,reason:'missing_pack'};
   if(!Object.hasOwn(en,key)||!isCriticalMessage(key))return {ok:false,reason:'not_reviewable'};
   if(en[key]!==expectedSource||pack.strings[key]!==expectedTranslation)return {ok:false,reason:'review_changed'};
   const review=reviewCriticalMessage(pack,key);if(!review)return {ok:false,reason:'not_reviewable'};
   return {packs:data.packs,reviews:[...data.reviews.filter(item=>item.locale!==locale||item.key!==key),review]};
  });},
  unreview(locale,key,expectedPack){return mutate('unreviewed',data=>{
   const pack=data.packs.find(pack=>languagePackLocale(pack)===locale);
   if(expectedPack!==undefined&&pack!==expectedPack)return {ok:false,reason:'review_changed'};
   if(!pack)return {ok:false,reason:'missing_pack'};
   return {packs:data.packs,reviews:data.reviews.filter(review=>review.locale!==locale||review.key!==key)};
  });},
  removePack(locale,expectedPack){return mutate('removed',data=>{
   const pack=data.packs.find(pack=>languagePackLocale(pack)===locale);
   if(expectedPack!==undefined&&pack!==expectedPack)return {ok:false,reason:'review_changed'};
   if(!pack)return {ok:false,reason:'missing_pack'};
   return {packs:data.packs.filter(pack=>languagePackLocale(pack)!==locale),reviews:data.reviews.filter(review=>review.locale!==locale)};
  });},
 };
}
