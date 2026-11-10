import type {SecureValueStore} from './pairing-store';
import {decodeDisplayCache,encodeDisplayCache,type DeckDisplayCache} from '../core/deck-display-cache';
export const DISPLAY_CACHE_KEY='deck.display-cache.v1';
/** Independent protected display storage; it is never a pairing, journal or action source. */
export function createDeckDisplayCacheStore(store:SecureValueStore){
 let queue:Promise<unknown>=Promise.resolve();
 const enqueue=<T>(operation:()=>Promise<T>):Promise<T>=>{const next=queue.then(operation);queue=next.catch(()=>undefined);return next;};
 return {
  load(now:number):Promise<DeckDisplayCache|null>{return enqueue(async()=>{try{const raw=await store.get(DISPLAY_CACHE_KEY),cache=decodeDisplayCache(raw,now);if(raw&&!cache)await store.remove(DISPLAY_CACHE_KEY);return cache;}catch{return null;}});},
  save(cache:DeckDisplayCache):Promise<boolean>{const encoded=encodeDisplayCache(cache);if(!encoded)return Promise.resolve(false);return enqueue(async()=>{try{await store.set(DISPLAY_CACHE_KEY,encoded);return true;}catch{return false;}});},
  clear():Promise<void>{return enqueue(async()=>{try{await store.remove(DISPLAY_CACHE_KEY);}catch{/* display-only */}});},
 };
}
