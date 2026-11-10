import assert from 'node:assert/strict';
import {readBoundedPackBytes,decodeUtf8PackBytes,PackFileBytesError,type PackFileByteReader} from '../src/i18n/pack-file-bytes';
import {MAX_PACK_BYTES,parseLanguagePack,englishSourceVersion} from '../src/i18n/pack';
let count=0;
const same=(actual:unknown,expected:unknown)=>{count++;assert.deepEqual(actual,expected);};
const refuses=(run:()=>unknown,code:PackFileBytesError['code'])=>{count++;assert.throws(run,error=>error instanceof PackFileBytesError&&error.code===code&&error.message===code);};
function stream(total:number,chunkSize=8192){
 let offset=0,closed=0;
 const requests:number[]=[],reads:number[]=[];
 const reader:PackFileByteReader={readBytes(length){
  assert.ok(Number.isInteger(length)&&length>0&&length<=MAX_PACK_BYTES+1);
  requests.push(length);
  const size=Math.min(length,chunkSize,total-offset);offset+=size;reads.push(size);
  return new Uint8Array(size).fill(32);
 },close(){closed++;}};
 return{reader,requests,reads,get closed(){return closed;},get consumed(){return offset;}};
}
// A lying provider can be arbitrarily large. Only the byte count from reads is authoritative.
const huge=stream(1_000_000_000);
refuses(()=>readBoundedPackBytes(huge.reader),'too_large');
same(huge.consumed,MAX_PACK_BYTES+1);same(huge.closed,1);
same(Math.max(...huge.requests)<=8192,true);
const exact=stream(MAX_PACK_BYTES);
same(readBoundedPackBytes(exact.reader).byteLength,MAX_PACK_BYTES);
same(exact.requests.at(-1),1);same(exact.reads.at(-1),0);same(exact.closed,1);
const short=stream(23,2);
same(Array.from(readBoundedPackBytes(short.reader)),Array(23).fill(32));same(short.closed,1);
const empty=stream(0);same(readBoundedPackBytes(empty.reader).length,0);same(empty.closed,1);
let closedAfterFailure=0;
refuses(()=>readBoundedPackBytes({readBytes(){throw new Error('private provider URI must not escape');},close(){closedAfterFailure++;}}),'read_failed');
same(closedAfterFailure,1);
let closedAfterBadChunk=0;
refuses(()=>readBoundedPackBytes({readBytes(length){return new Uint8Array(length+1);},close(){closedAfterBadChunk++;}}),'read_failed');
same(closedAfterBadChunk,1);
refuses(()=>readBoundedPackBytes({readBytes(){return null as unknown as Uint8Array;},close(){}}),'read_failed');
refuses(()=>readBoundedPackBytes({readBytes(){return new Uint8Array();},close(){throw new Error('private close error');}}),'read_failed');
const encoder=new TextEncoder();
for(const text of ['', '  한국어 e\u0301 😀.\n', '😀'.repeat(MAX_PACK_BYTES/4)])same(decodeUtf8PackBytes(encoder.encode(text)),text);
const splitText='  한국어 e\u0301 😀.\n',splitBytes=encoder.encode(splitText);
let splitAt=0,splitClosed=0;
same(decodeUtf8PackBytes(readBoundedPackBytes({readBytes(){return splitBytes.subarray(splitAt,++splitAt);},close(){splitClosed++;}})),splitText);
same(splitClosed,1);
for(const bytes of [[0xc0,0xaf],[0xe2,0x82],[0xff,0xfe,0x41,0],[0xe9]])refuses(()=>decodeUtf8PackBytes(new Uint8Array(bytes)),'invalid_utf8');
refuses(()=>decodeUtf8PackBytes(new Uint8Array(MAX_PACK_BYTES+1)),'too_large');
// A UTF-8 BOM still counts against the byte cap before the decoder consumes it.
const oversizedBom=new Uint8Array(MAX_PACK_BYTES+1).fill(32);oversizedBom.set([0xef,0xbb,0xbf]);
refuses(()=>decodeUtf8PackBytes(oversizedBom),'too_large');
const json=JSON.stringify({format:1,lang:'ja',script:'Jpan',name:'Japanese',sourceVersion:englishSourceVersion(),strings:{'cmd.content':'Contents'}});
const padded=json+' '.repeat(MAX_PACK_BYTES-encoder.encode(json).length);
same(parseLanguagePack(decodeUtf8PackBytes(encoder.encode(padded))).ok,true);
console.log(`PASS: ${count} bounded pack-file byte assertions (synthetic readers; no filesystem or device)`);
