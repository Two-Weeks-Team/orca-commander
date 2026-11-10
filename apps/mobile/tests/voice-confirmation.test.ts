import assert from 'node:assert/strict';
import {classifyVoiceConfirmation,createVoiceConfirmation} from '../src/core/voice-confirmation';

let count=0;
const same=(a:unknown,b:unknown)=>{count++;assert.deepEqual(a,b);};
for(const text of ['yes','send','send it','confirm','YES.','전송','보내','응','네.'])same(classifyVoiceConfirmation(text,'both'),'yes');
for(const text of ['no','cancel','stop','취소','아니','아니요.'])same(classifyVoiceConfirmation(text,'both'),'no');
for(const text of ['','yes no','yes, send','do not send','not yes','전송하지 마','응 아니','send and approve','next','yes?','yes..','yes\n','y\u200bes'])same(classifyVoiceConfirmation(text,'both'),'unknown');
same(classifyVoiceConfirmation('네','en'),'unknown');
same(classifyVoiceConfirmation('yes','ko'),'unknown');

const deferred=<T>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
async function main(){
 const ticket={id:'fixture-only'};
 let current=true,clock=0,reads=0,confirms=0,cancels=0;
 let spoken=deferred<'finished'|'interrupted'|'unavailable'|'uncertain'>();
 let heard=deferred<{kind:'final';text:string}|{kind:'timeout'}|{kind:'canceled'}>();
 const flow=createVoiceConfirmation({now:()=>clock,isCurrent:(t:object)=>current&&t===ticket,
  speak:async()=>spoken.promise,listen:async()=>{reads++;return heard.promise;},
  cancelAudio:()=>{cancels++;},confirm:async(t:object)=>{same(t,ticket);confirms++;}});
 const first=flow.start(ticket,'both');await flush();same(flow.getSnapshot(),'speaking');same(reads,0);
 same(await flow.start(ticket,'both'),'ignored');same(confirms,0);
 spoken.resolve('finished');await flush();same(reads,1);same(flow.getSnapshot(),'listening');
 heard.resolve({kind:'final',text:'yes'});same(await first,'confirmed');same(confirms,1);
 same(await flow.start(ticket,'both'),'ignored');same(confirms,1);

 // A context transition while speaking prevents microphone opening or delayed confirmation.
 const secondTicket={id:'new-fixture'};let exact=secondTicket;
 spoken=deferred();heard=deferred();current=true;
 const other=createVoiceConfirmation({now:()=>clock,isCurrent:(t:object)=>current&&t===exact,
  speak:()=>spoken.promise,listen:async()=>{reads++;return heard.promise;},cancelAudio:()=>{cancels++;},confirm:async()=>{confirms++;}});
 const stale=other.start(secondTicket,'en');current=false;spoken.resolve('finished');same(await stale,'canceled');same(reads,1);same(confirms,1);
 for(const outcome of ['interrupted','unavailable','uncertain'] as const){
  exact={id:outcome};current=true;spoken=deferred();const run=other.start(exact,'en');spoken.resolve(outcome);same(await run,'speech_unavailable');same(reads,1);same(confirms,1);
 }
 // Playback failure after a context change still cancels; it cannot retain a stale ticket.
 exact={id:'stale-failure'};spoken=deferred();const staleFailure=other.start(exact,'en');current=false;spoken.resolve('unavailable');same(await staleFailure,'canceled');current=true;
 const speechThrows=createVoiceConfirmation({now:()=>0,isCurrent:()=>true,speak:async()=>{throw Error('synthetic playback failure');},listen:async()=>{throw Error('must not listen');},cancelAudio:()=>{},confirm:async()=>{confirms++;}});
 same(await speechThrows.start({},'en'),'speech_unavailable');same(confirms,1);
 // Native completion alone cannot authorize a stale, late, ambiguous, or negative final.
 for(const answer of [{kind:'timeout'},{kind:'canceled'},{kind:'final',text:'yes no'},{kind:'final',text:'no'}] as const){
  exact={id:'answer-fixture'};spoken=deferred();heard=deferred();const run=other.start(exact,'en');spoken.resolve('finished');await flush();heard.resolve(answer);same(await run,'canceled');same(confirms,1);
 }
 exact={id:'expired'};spoken=deferred();heard=deferred();const expired=other.start(exact,'en');spoken.resolve('finished');await flush();clock=8001;heard.resolve({kind:'final',text:'yes'});same(await expired,'canceled');same(confirms,1);
 exact={id:'canceled'};spoken=deferred();heard=deferred();const canceled=other.start(exact,'en');spoken.resolve('finished');await flush();other.cancel();heard.resolve({kind:'final',text:'yes'});same(await canceled,'canceled');same(confirms,1);same(cancels>0,true);
 // The explicit answer is consumed before awaiting the existing send operation.
 const send=deferred<void>(),speaking=deferred<'finished'>(),answer=deferred<{kind:'final';text:string}>();
 const sending=createVoiceConfirmation({now:()=>0,isCurrent:()=>true,speak:()=>speaking.promise,listen:()=>answer.promise,cancelAudio:()=>{},confirm:()=>send.promise});
 const submitting=sending.start({},'en');speaking.resolve('finished');await flush();answer.resolve({kind:'final',text:'send'});await flush();
 same(sending.getSnapshot(),'confirming');same(await sending.start({},'en'),'ignored');send.resolve();same(await submitting,'confirmed');same(sending.getSnapshot(),'idle');
 const throwing=createVoiceConfirmation({now:()=>0,isCurrent:()=>true,speak:async()=>'finished' as const,listen:async()=>({kind:'final' as const,text:'yes'}),cancelAudio:()=>{},confirm:async()=>{throw Error('uncertain owner operation');}});
 same(await throwing.start({},'en'),'uncertain'); // A thrown submission never becomes a no-send claim.
 console.log(`PASS: ${count} scoped voice confirmation assertions (synthetic ports; no audio or host send)`);
}
void main();
