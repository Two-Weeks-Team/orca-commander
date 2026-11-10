import type {SecureValueStore} from './pairing-store';
import {DEFAULT_DECK_PHRASE,validDeckPhrase,type DeckPhrase} from '../core/phrase-command';
export const PHRASE_STORE_KEY='deck.phrase.v1';
export interface PhraseSnapshot {phase:'loading'|'ready'|'saving'|'blocked';value:Readonly<DeckPhrase>;error:boolean}
export function createPhrasePreferences(store:SecureValueStore){
 let snapshot:Readonly<PhraseSnapshot>=Object.freeze({phase:'loading',value:DEFAULT_DECK_PHRASE,error:false});
 let loaded=false,loading:Promise<void>|undefined,queue:Promise<unknown>=Promise.resolve();
 const listeners=new Set<()=>void>();
 const publish=(phase:PhraseSnapshot['phase'],value=snapshot.value,error=false)=>{snapshot=Object.freeze({phase,value:Object.freeze({...value}),error});for(const fn of listeners){try{fn();}catch{/* observers do not own storage */}}};
 const enqueue=<T>(fn:()=>Promise<T>):Promise<T>=>{const next=queue.then(fn);queue=next.catch(()=>undefined);return next;};
 const read=():Promise<void>=>{
  if(loading)return loading;
  const next=enqueue(async()=>{
   publish('loading');
   try{
    const raw=await store.get(PHRASE_STORE_KEY);let value:DeckPhrase=DEFAULT_DECK_PHRASE;
    if(raw!==null){if(raw.length>262144)throw Error('invalid_phrase');const data:unknown=JSON.parse(raw);if(!validDeckPhrase(data)||JSON.stringify({name:data.name,text:data.text})!==raw)throw Error('invalid_phrase');value=data;}
    loaded=true;publish('ready',value);
   }catch{loaded=true;publish('blocked',snapshot.value,true);}
  });
  const finished=next.finally(()=>{if(loading===finished)loading=undefined;});loading=finished;return finished;
 };
 return{
  getSnapshot:()=>snapshot,
  subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
  load:()=>loading??(loaded?Promise.resolve():read()),retry:read,
  save(value:Readonly<DeckPhrase>):Promise<boolean>{
   if(!validDeckPhrase(value))return Promise.resolve(false);
   const captured=Object.freeze({name:value.name,text:value.text});
   return enqueue(async()=>{
    if(snapshot.phase!=='ready')return false;
    publish('saving');
    try{await store.set(PHRASE_STORE_KEY,JSON.stringify(captured));publish('ready',captured);return true;}
    catch{publish('blocked',snapshot.value,true);return false;}
   });
  },
 };
}
const native=():SecureValueStore=>(require('./secure-store') as {expoSecureValueStore:SecureValueStore}).expoSecureValueStore;
/** A separate device-only key; it never reads pairing data or contacts the host. */
export const phrasePreferences=createPhrasePreferences({get:key=>native().get(key),set:(key,value)=>native().set(key,value),remove:key=>native().remove(key)});
