import type {SecureValueStore} from './pairing-store';
import {restoreDeck,serializeDeck,type DeckState} from '../core/deck-model';

export const DECK_SLOT_STORE_KEY='deck.slot-bindings.v1';
/** Pass the same persistent-commit-verified protected store used by action journals; never a cache or plain preferences. */
export function createDeckSlotStore(store:SecureValueStore){
 let queue:Promise<unknown>=Promise.resolve();
 const enqueue=<T>(operation:()=>Promise<T>):Promise<T>=>{const result=queue.then(operation);queue=result.catch(()=>undefined);return result;};
 return {
  load(now:number):Promise<DeckState>{return enqueue(async()=>{try{return restoreDeck(await store.get(DECK_SLOT_STORE_KEY),now);}catch{return {...restoreDeck(null,now),restore:'blocked'};}});},
  save(state:DeckState,now:number):Promise<boolean>{
   // Capture only the allowed metadata before an asynchronous queue wait. Failed encodes leave existing storage intact.
   let encoded:string;try{encoded=serializeDeck(state,now);}catch{return Promise.resolve(false);}
   return enqueue(async()=>{try{await store.set(DECK_SLOT_STORE_KEY,encoded);return true;}catch{return false;}});
  },
 };
}
