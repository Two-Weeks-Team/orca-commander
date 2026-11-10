import {strict as assert} from 'node:assert';
import {createPackFileValueStore,PACK_STORE_MAX_BYTES} from '../src/i18n/pack-file-store-core';
async function main(){
 let pointer:string|null=null,writes=0,failPointer=false,corrupt=false;
 const files=new Map<number,Uint8Array>();
 const ports={pointer:{get:async()=>pointer,set:async(_key:string,value:string)=>{if(failPointer)throw Error('disk');pointer=value;}},files:{read:async(slot:number,limit:number)=>{const bytes=files.get(slot);if(!bytes)throw Error('missing');return corrupt?new Uint8Array([0]):bytes.slice(0,limit);},write:async(slot:number,bytes:Uint8Array)=>{writes++;files.set(slot,bytes.slice());}}};
 const store=createPackFileValueStore(ports),key='deck.language-packs.v1';
 await assert.rejects(()=>store.set(key,'before load'));assert.equal(writes,0);
 assert.equal(await store.get(key),null);await store.set(key,'first');assert.equal(await store.get(key),'first');
 const original=pointer;failPointer=true;await assert.rejects(()=>store.set(key,'second'));assert.equal(pointer,original);
 await assert.rejects(()=>store.set(key,'blind retry'));assert.equal(writes,2);
 failPointer=false;assert.equal(await store.get(key),'first');await store.set(key,'third');assert.equal(await store.get(key),'third');
 assert.equal(files.get(0)&&new TextDecoder().decode(files.get(0)),'first');
 corrupt=true;await assert.rejects(()=>store.get(key));await assert.rejects(()=>store.set(key,'overwrite corrupted'));corrupt=false;
 assert.equal(await store.get(key),'third');await assert.rejects(()=>store.set(key,'x'.repeat(PACK_STORE_MAX_BYTES+1)));assert.equal(writes,3);
 pointer='{"format":99}';await assert.rejects(()=>store.get(key));await assert.rejects(()=>store.set(key,'overwrite newer format'));
 pointer=original;assert.equal(await store.get(key),'first');pointer=null;await assert.rejects(()=>store.set(key,'changed pointer'));assert.equal(writes,3);
 await assert.rejects(()=>store.get('another-owner-key'));
 // A catalog store serializes its callers, and the underlying file value store must
 // also preserve invocation order rather than reopening a checked pointer mid-write.
 let committed:string|null=null,release:()=>void=()=>undefined,started:()=>void=()=>undefined;
 const gate=new Promise<void>(resolve=>{release=resolve;}),entered=new Promise<void>(resolve=>{started=resolve;});
 const slots=new Map<number,Uint8Array>();let pause=false;
 const concurrent=createPackFileValueStore({pointer:{get:async()=>committed,set:async(_key,value)=>{committed=value;}},files:{read:async(slot,limit)=>slots.get(slot)!.slice(0,limit),write:async(slot,bytes)=>{if(pause){pause=false;started();await gate;}slots.set(slot,bytes.slice());}}});
 await concurrent.get(key);await concurrent.set(key,'A');pause=true;
 const earlier=concurrent.set(key,'B');await entered;
 let readResolved=false;const during=concurrent.get(key).then(value=>{readResolved=true;return value;});
 for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(readResolved,false,'a read cannot reopen the pointer while a write is incomplete');
 const later=concurrent.set(key,'C');release();await earlier;assert.equal(await during,'B');await later;assert.equal(await concurrent.get(key),'C');
 console.log('pack-file-store: checked publication and concurrent invocation order passed');
}
void main();
