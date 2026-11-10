import {MAX_PACK_BYTES} from './pack';

/** Empty bytes mean EOF. Metadata is deliberately absent from this read-only port. */
export interface PackFileByteReader {readBytes(length:number):Uint8Array;close():void}
export class PackFileBytesError extends Error {
 constructor(readonly code:'too_large'|'invalid_utf8'|'read_failed'){super(code);this.name='PackFileBytesError';}
}

/** Count bytes from bounded reads, including one sentinel, and close even on a rejected import. */
export function readBoundedPackBytes(reader:PackFileByteReader):Uint8Array {
 try{
  try{
   const bytes=new Uint8Array(MAX_PACK_BYTES+1);
   let total=0;
   while(total<bytes.length){
    const requested=Math.min(8192,bytes.length-total),chunk=reader.readBytes(requested);
    if(!(chunk instanceof Uint8Array)||chunk.byteLength>requested)throw new PackFileBytesError('read_failed');
    if(chunk.byteLength===0)return bytes.subarray(0,total);
    bytes.set(chunk,total);total+=chunk.byteLength;
    if(total>MAX_PACK_BYTES)throw new PackFileBytesError('too_large');
   }
   throw new PackFileBytesError('too_large');
  }finally{reader.close();}
 }catch(error){
  if(error instanceof PackFileBytesError)throw error;
  throw new PackFileBytesError('read_failed');
 }
}

/** Decode only bounded UTF-8; never trim, normalize, guess another encoding, or replace invalid bytes. */
export function decodeUtf8PackBytes(bytes:Uint8Array):string {
 if(bytes.byteLength>MAX_PACK_BYTES)throw new PackFileBytesError('too_large');
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
 catch{throw new PackFileBytesError('invalid_utf8');}
}
