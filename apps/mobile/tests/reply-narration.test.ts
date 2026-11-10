import assert from 'node:assert/strict';
import {buildReplySpeechSegments,createReplyNarrator} from '../src/core/reply-narration';
import type {NativeSpeech,SpeechResult} from '../src/adapters/native-speech';
const body='원문 🎙️ '+('확인할 응답 본문입니다. '.repeat(30));
const segments=buildReplySpeechSegments('Tab response',body,'More on screen');
assert.equal(segments.body.join(''),Array.from(body).slice(0,120).join(''),'the spoken body is an exact prefix, never a summary');
assert.equal(segments.continuation,'More on screen');
assert.ok(segments.body.every(text=>Array.from(text).length<=32));
assert.equal(buildReplySpeechSegments('Reply','short text','More on screen').continuation,null);
assert.equal(buildReplySpeechSegments('Reply','short text','More on screen').body.join(''),'short text');
assert.equal(buildReplySpeechSegments('Reply','😀'.repeat(130),'More on screen').body.join(''),'😀'.repeat(120));
async function main(){
 const calls:string[]=[];let canceled=0,finish:((r:SpeechResult)=>void)|undefined;
 const speech:NativeSpeech={speak:async(text)=>{calls.push(text);return 'finished';},cancel:()=>{canceled++;},getSnapshot:()=>({phase:'idle'}),subscribe:()=>()=>{}};
 const narrator=createReplyNarrator(speech);
 const request={id:'reply-1',segments:['intro','body','tail'],language:'ko-KR' as const,rate:()=>1,isCurrent:()=>true};
 assert.equal(await narrator.read(request),'finished');assert.deepEqual(calls,['intro','body','tail']);
 assert.equal(await narrator.read(request),'already_read');assert.equal(calls.length,3,'a duplicate observation cannot repeat the response');
 let current=true;speech.speak=async(text)=>{calls.push(text);current=false;return 'finished';};
 assert.equal(await narrator.read({...request,id:'reply-2',isCurrent:()=>current}),'interrupted');assert.equal(calls.at(-1),'intro','a changed target never receives the remaining chunks');
 speech.speak=()=>new Promise(resolve=>{finish=resolve;});
 const reading=narrator.read({...request,id:'reply-3'});await Promise.resolve();
 assert.equal(await narrator.read({...request,id:'reply-4'}),'busy','concurrent replies are not queued or overlapped');
 narrator.cancel();finish!('finished');assert.equal(await reading,'interrupted');assert.ok(canceled>0);
 speech.speak=async()=> 'uncertain';assert.equal(await narrator.read({...request,id:'reply-5'}),'uncertain','native uncertainty must not continue the tail or report success');
 assert.equal(await narrator.read({...request,id:'reply-5'}),'already_read','uncertain playback is never retried automatically');
 console.log('PASS: reply prefix/chunk fidelity, duplicate/busy/cancellation/current-target and uncertain playback boundaries (synthetic audio port)');
}
void main();
