import {sha256} from '@noble/hashes/sha256';

export const PACK_STORE_MAX_BYTES=2*1024*1024;
const POINTER='deck.language-packs.file-pointer.v1';
const VALUE='deck.language-packs.v1';
type Slot=0|1;
interface Pointer {format:1;slot:Slot;bytes:number;digest:string}
interface Ports {
 pointer:{get(key:string):Promise<string|null>;set(key:string,value:string):Promise<void>};
 files:{read(slot:Slot,limit:number):Promise<Uint8Array>;write(slot:Slot,bytes:Uint8Array):Promise<void>};
}
const digest=(bytes:Uint8Array)=>Array.from(sha256(bytes),v=>v.toString(16).padStart(2,'0')).join('');
function decodePointer(raw:string):Pointer {
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('pack_storage_unavailable');}
 const p=value as Partial<Pointer>|null;
 if(!p||typeof p!=='object'||Object.keys(p).sort().join()!=='bytes,digest,format,slot'||p.format!==1||p.slot!==0&&p.slot!==1||!Number.isSafeInteger(p.bytes)||p.bytes!<0||p.bytes!>PACK_STORE_MAX_BYTES||typeof p.digest!=='string'||!/^[a-f0-9]{64}$/.test(p.digest))throw new Error('pack_storage_unavailable');
 return p as Pointer;
}
/** Non-secret catalog files use two app-private slots. Only the small checked pointer uses protected storage.
 * The inactive slot is verified before pointer publication. No owner file is opened or removed.
 * A failed/ambiguous pointer write must be reconciled by a new read, never a retry write.
 */
export function createPackFileValueStore(ports:Ports){
 let loaded=false,expected:string|null=null,queue:Promise<unknown>=Promise.resolve();
 const serial=<T>(work:()=>Promise<T>):Promise<T>=>{const next=queue.then(work,work);queue=next.catch(()=>undefined);return next;};
 return {
  get(key:string):Promise<string|null>{return serial(async()=>{
   if(key!==VALUE)throw new Error('pack_storage_key');loaded=false;
   const raw=await ports.pointer.get(POINTER);
   if(raw===null){expected=null;loaded=true;return null;}
   const p=decodePointer(raw),bytes=await ports.files.read(p.slot,PACK_STORE_MAX_BYTES+1);
   if(bytes.length!==p.bytes||bytes.length>PACK_STORE_MAX_BYTES||digest(bytes)!==p.digest)throw new Error('pack_storage_unavailable');
   const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
   expected=raw;loaded=true;return text;
  });},
  set(key:string,value:string):Promise<void>{return serial(async()=>{
   if(key!==VALUE||!loaded)throw new Error('pack_storage_unavailable');
   const bytes=new TextEncoder().encode(value);if(bytes.length>PACK_STORE_MAX_BYTES)throw new Error('pack_storage_limit');
   loaded=false;
   if(await ports.pointer.get(POINTER)!==expected)throw new Error('pack_storage_changed');
   const slot:Slot=expected===null?0:decodePointer(expected).slot===0?1:0;
   await ports.files.write(slot,bytes);
   const readback=await ports.files.read(slot,PACK_STORE_MAX_BYTES+1);
   if(readback.length!==bytes.length||digest(readback)!==digest(bytes))throw new Error('pack_storage_unavailable');
   const pointer=JSON.stringify({format:1,slot,bytes:bytes.length,digest:digest(bytes)});
   await ports.pointer.set(POINTER,pointer);
   if(await ports.pointer.get(POINTER)!==pointer)throw new Error('pack_storage_unavailable');
   expected=pointer;loaded=true;
  });},
 };
}
