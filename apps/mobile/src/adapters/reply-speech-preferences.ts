import type {SecureValueStore} from './pairing-store';

export const REPLY_SPEECH_PREFERENCES_KEY='deck.reply-speech.v1';
export interface ReplySpeechSnapshot {readonly phase:'loading'|'ready'|'blocked';readonly enabled:boolean;readonly rate:number;readonly error:boolean}
export interface ReplySpeechPatch {enabled?:boolean;rate?:number}
const rateValid=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0.5&&value<=2&&Number.isInteger(value*4);
function parse(raw:string|null):{enabled:boolean;rate:number}{
 if(raw===null)return{enabled:true,rate:1};
 if(typeof raw!=='string'||raw.length>256)throw Error('invalid_reply_speech_preferences');
 const value:unknown=JSON.parse(raw);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid_reply_speech_preferences');
 const record=value as Record<string,unknown>;
 if(Object.keys(record).sort().join(',')!=='enabled,rate'||typeof record.enabled!=='boolean'||!rateValid(record.rate)||Array.from(raw.matchAll(/"(?:[^"\\]|\\.)*"\s*:/g)).length!==2)throw Error('invalid_reply_speech_preferences');
 return{enabled:record.enabled,rate:record.rate};
}
function checked(patch:ReplySpeechPatch):void{
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.getOwnPropertySymbols(patch).length||!Object.keys(patch).every(key=>key==='enabled'||key==='rate')||Object.hasOwn(patch,'enabled')&&typeof patch.enabled!=='boolean'||Object.hasOwn(patch,'rate')&&!rateValid(patch.rate))throw Error('invalid_reply_speech_preferences');
}
/** Independent reply-reading preferences; send-confirmation speech never uses this setting. */
export function createReplySpeechPreferences(store:SecureValueStore){
 let snapshot:ReplySpeechSnapshot=Object.freeze({phase:'loading',enabled:true,rate:1,error:false});
 let loaded=false,readable=false,epoch=0,pendingOff=false;
 let acknowledged:{enabled:boolean;rate:number}|undefined;
 let queue:Promise<void>=Promise.resolve(),loading:Promise<void>|null=null;
 const listeners=new Set<()=>void>();
 const publish=(next:ReplySpeechSnapshot)=>{
  if(next.phase===snapshot.phase&&next.enabled===snapshot.enabled&&next.rate===snapshot.rate&&next.error===snapshot.error)return;
  snapshot=Object.freeze(next);
  for(const listener of listeners){try{listener();}catch{/* observers do not own storage */}}
 };
 const enqueue=(operation:()=>Promise<void>)=>{const result=queue.then(operation);queue=result.catch(()=>undefined);return result;};
 const persist=async(value:{enabled:boolean;rate:number},scope:number)=>{
  if(scope!==epoch||!readable||snapshot.phase!=='ready')return;
  try{
   await store.set(REPLY_SPEECH_PREFERENCES_KEY,JSON.stringify({enabled:value.enabled,rate:value.rate}));
   if(scope!==epoch)return;
   acknowledged=value;
   if(!value.enabled&&!snapshot.enabled)pendingOff=false;
  }catch{
   if(scope!==epoch)return;
   readable=false;publish({...snapshot,phase:'blocked',error:true});
  }
 };
 const read=():Promise<void>=>{
  if(loading)return loading;
  const scope=++epoch;readable=false;publish({...snapshot,phase:'loading',error:false});
  const operation=enqueue(async()=>{
   try{
    const value=parse(await store.get(REPLY_SPEECH_PREFERENCES_KEY));
    if(scope!==epoch)return;
    loaded=true;readable=true;acknowledged=value;
    const next={enabled:pendingOff?false:value.enabled,rate:value.rate};
    const saveOff=pendingOff&&value.enabled;
    publish({...next,phase:'ready',error:false});
    if(saveOff)await persist(next,scope);
    else if(!value.enabled)pendingOff=false;
   }catch{
    if(scope!==epoch)return;
    loaded=true;readable=false;publish({...snapshot,phase:'blocked',error:true});
   }
  });
  const finished=operation.finally(()=>{if(loading===finished)loading=null;});loading=finished;
  return finished;
 };
 const load=():Promise<void>=>loading??(loaded?Promise.resolve():read());
 const update=(patch:ReplySpeechPatch):Promise<void>=>{
  try{checked(patch);}catch{return Promise.reject(Error('invalid_reply_speech_preferences'));}
  if(patch.enabled===false){pendingOff=true;publish({...snapshot,enabled:false});}
  if(snapshot.phase!=='ready'||!readable)return patch.enabled===false?(loading??(!loaded?load():Promise.resolve())):Promise.resolve();
  const next={enabled:patch.enabled??snapshot.enabled,rate:patch.rate??snapshot.rate};
  if(patch.enabled===true)pendingOff=false;
  const unchanged=next.enabled===snapshot.enabled&&next.rate===snapshot.rate;
  const committed=acknowledged?.enabled===next.enabled&&acknowledged?.rate===next.rate;
  if(unchanged&&committed){if(!next.enabled)pendingOff=false;return Promise.resolve();}
  publish({...next,phase:'ready',error:false});
  const scope=epoch;return enqueue(()=>persist(next,scope));
 };
 return{
  getSnapshot:()=>snapshot,
  subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  load,reload:read,update,
 };
}

const nativeStore=():SecureValueStore=>(require('./secure-store') as {expoSecureValueStore:SecureValueStore}).expoSecureValueStore;
/** Requiring this module never initializes native storage. */
export const replySpeechPreferences=createReplySpeechPreferences({get:key=>nativeStore().get(key),set:(key,value)=>nativeStore().set(key,value),remove:key=>nativeStore().remove(key)});
