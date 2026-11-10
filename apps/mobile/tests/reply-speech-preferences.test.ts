import assert from 'node:assert/strict';
import {createReplySpeechPreferences,REPLY_SPEECH_PREFERENCES_KEY} from '../src/adapters/reply-speech-preferences';
import type {SecureValueStore} from '../src/adapters/pairing-store';

function memory(raw:string|null=null){
 let value=raw,readFailure=false,writeFailure=false;const calls:{key:string;value:string}[]=[];
 const store:SecureValueStore={get:async key=>{assert.equal(key,REPLY_SPEECH_PREFERENCES_KEY);if(readFailure)throw Error('private storage failure');return value;},set:async(key,next)=>{calls.push({key,value:next});if(writeFailure)throw Error('private storage failure');value=next;},remove:async()=>{throw Error('preferences never delete unrelated storage');}};
 return{store,calls,get value(){return value;},set value(next:string|null){value=next;},set readFailure(next:boolean){readFailure=next;},set writeFailure(next:boolean){writeFailure=next;}};
}
function deferred<T=void>(){let resolve!:(value:T|PromiseLike<T>)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};}
async function main(){
 const disk=memory(),owner=createReplySpeechPreferences(disk.store);
 assert.equal(REPLY_SPEECH_PREFERENCES_KEY,'deck.reply-speech.v1');
 assert.deepEqual(owner.getSnapshot(),{phase:'loading',enabled:true,rate:1,error:false});
 assert.equal(owner.getSnapshot(),owner.getSnapshot(),'external-store identity is stable');
 await owner.load();assert.deepEqual(owner.getSnapshot(),{phase:'ready',enabled:true,rate:1,error:false});assert.equal(disk.calls.length,0,'loading missing data does not overwrite storage');
 const saved=memory('{"enabled":false,"rate":1.5}'),restored=createReplySpeechPreferences(saved.store);await restored.load();assert.deepEqual(restored.getSnapshot(),{phase:'ready',enabled:false,rate:1.5,error:false});
 const failed=memory();failed.readFailure=true;const blocked=createReplySpeechPreferences(failed.store);await blocked.load();assert.equal(blocked.getSnapshot().phase,'blocked');assert.equal(blocked.getSnapshot().error,true);await blocked.update({enabled:true,rate:2});assert.equal(failed.calls.length,0,'failed reads grant no write authority');
 failed.readFailure=false;await blocked.reload();assert.equal(blocked.getSnapshot().phase,'ready');

 const held=deferred<string|null>(),writes:string[]=[];let reads=0;
 const loading=createReplySpeechPreferences({get:async()=>{reads++;return held.promise;},set:async(_key,value)=>{writes.push(value);},remove:async()=>{}});
 const initialLoad=loading.load();const disable=loading.update({enabled:false});
 assert.equal(loading.getSnapshot().enabled,false,'turning replies off is synchronous while storage is reading');assert.equal(writes.length,0);
 held.resolve('{"enabled":true,"rate":1.75}');await Promise.all([initialLoad,disable]);
 assert.deepEqual(loading.getSnapshot(),{phase:'ready',enabled:false,rate:1.75,error:false});assert.deepEqual(writes,['{"enabled":false,"rate":1.75}']);assert.equal(reads,1);
 const gate=deferred<void>(),begun=deferred<void>();let active=0,maxActive=0;const ordered:string[]=[];let value:string|null=null;
 const serial=createReplySpeechPreferences({get:async()=>value,set:async(_key,next)=>{active++;maxActive=Math.max(maxActive,active);ordered.push(next);if(ordered.length===1){begun.resolve();await gate.promise;}value=next;active--;},remove:async()=>{}});
 await serial.load();const a=serial.update({enabled:false}),b=serial.update({rate:1.5}),c=serial.update({enabled:true});assert.equal(serial.getSnapshot().rate,1.5);await begun.promise;assert.equal(ordered.length,1,'rapid updates cannot enter storage concurrently');gate.resolve();await Promise.all([a,b,c]);assert.equal(maxActive,1);assert.deepEqual(ordered,['{"enabled":false,"rate":1}','{"enabled":false,"rate":1.5}','{"enabled":true,"rate":1.5}']);
 const failureGate=deferred<void>();let failedCalls=0;
 const writeBlocked=createReplySpeechPreferences({get:async()=>null,set:async()=>{failedCalls++;await failureGate.promise;throw Error('private platform error');},remove:async()=>{}});
 await writeBlocked.load();const failA=writeBlocked.update({rate:1.25}),failB=writeBlocked.update({rate:1.5});failureGate.resolve();await Promise.all([failA,failB]);assert.equal(failedCalls,1,'a failed write fences later queued writes');assert.equal(writeBlocked.getSnapshot().phase,'blocked');assert.equal(writeBlocked.getSnapshot().error,true);assert.equal(JSON.stringify(writeBlocked.getSnapshot()).includes('private'),false);
 await writeBlocked.update({enabled:false});assert.equal(writeBlocked.getSnapshot().enabled,false);assert.equal(failedCalls,1);

 for(const raw of ['{}','{"enabled":true,"rate":0.6}','{"enabled":true,"rate":2.25}','{"enabled":true,"rate":1,"target":"forbidden"}','{"enabled":true,"enabled":false,"rate":1}','not json','{"enabled":true,"rate":null}']){
  const invalidDisk=memory(raw),invalid=createReplySpeechPreferences(invalidDisk.store);await invalid.load();assert.equal(invalid.getSnapshot().phase,'blocked');await invalid.update({rate:1.25});assert.equal(invalidDisk.calls.length,0);
 }
 const stable=serial.getSnapshot();await assert.rejects(serial.update({rate:0.6}),/invalid_reply_speech_preferences/);await assert.rejects(serial.update({enabled:'yes'} as unknown as {enabled:boolean}),/invalid_reply_speech_preferences/);assert.equal(serial.getSnapshot(),stable);
 const readGate=deferred<string|null>();let readCount=0;
 const coalesced=createReplySpeechPreferences({get:async()=>{readCount++;return readGate.promise;},set:async()=>{},remove:async()=>{}});
 const readA=coalesced.load(),readB=coalesced.load();assert.equal(readA,readB);readGate.resolve(null);await readA;assert.equal(readCount,1);
 const unreadDisk=memory();unreadDisk.readFailure=true;const unread=createReplySpeechPreferences(unreadDisk.store);await unread.load();await unread.update({enabled:false});assert.equal(unread.getSnapshot().enabled,false);assert.equal(unreadDisk.calls.length,0);unreadDisk.readFailure=false;await unread.reload();assert.equal(unread.getSnapshot().enabled,false);assert.deepEqual(JSON.parse(unreadDisk.value!),{enabled:false,rate:1});
 const writeGate=deferred<void>(),writeBegun=deferred<void>();let reloadDisk:string|null=null,reloadWrites=0;
 const fenced=createReplySpeechPreferences({get:async()=>reloadDisk,set:async(_key,next)=>{reloadWrites++;writeBegun.resolve();await writeGate.promise;reloadDisk=next;},remove:async()=>{}});await fenced.load();const oldWrite=fenced.update({rate:1.25});await writeBegun.promise;const skipped=fenced.update({rate:1.5}),reread=fenced.reload();assert.equal(fenced.getSnapshot().phase,'loading');writeGate.resolve();await Promise.all([oldWrite,skipped,reread]);assert.equal(reloadWrites,1,'reload fences stale queued writes');assert.equal(fenced.getSnapshot().rate,1.25,'reload reads the completed write instead of publishing stale optimistic values');

 const reloadRead=deferred<string|null>();let readIndex=0;
 const disablingReload=createReplySpeechPreferences({get:async()=>++readIndex===1?'{"enabled":true,"rate":1}':reloadRead.promise,set:async()=>{},remove:async()=>{}});await disablingReload.load();const reloadPending=disablingReload.reload();let disableFinished=false;const pendingDisable=disablingReload.update({enabled:false}).then(()=>{disableFinished=true;});await Promise.resolve();await Promise.resolve();assert.equal(disableFinished,false,'off during reload settles only after its pending read/save');reloadRead.resolve('{"enabled":true,"rate":1.5}');await Promise.all([reloadPending,pendingDisable]);assert.equal(disablingReload.getSnapshot().enabled,false);
 let notifications=0;const off=serial.subscribe(()=>{notifications++;});const unchanged=serial.getSnapshot();await serial.update({enabled:true,rate:1.5});assert.equal(serial.getSnapshot(),unchanged);assert.equal(notifications,0);off();
 console.log('PASS reply speech preferences: strict schema, coalesced reads, reload epoch and stable external-store snapshots');
 console.log('PASS reply speech preferences: immediate off, serialized intent order and write-failure fence');
 console.log('PASS reply speech preferences: loading/defaults, strict separate storage, blocked read and explicit reload');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
