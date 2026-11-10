import assert from 'node:assert/strict';
import {createPhrasePreferences,PHRASE_STORE_KEY} from '../src/adapters/phrase-preferences';
import {DEFAULT_DECK_PHRASE,createPhraseGesture,validDeckPhrase} from '../src/core/phrase-command';

async function main(){
const data=new Map<string,string>(),writes:string[]=[];
let failedRead=false,failedWrite=false;
const store={async get(key:string){if(failedRead)throw Error('read');return data.get(key)??null;},async set(key:string,value:string){writes.push(key);if(failedWrite)throw Error('write');data.set(key,value);},async remove(){throw Error('not authorized');}};
const own={name:'검토',text:'승인한 다음 단계만 진행하세요.'};
data.set(PHRASE_STORE_KEY,JSON.stringify(own));
const preferences=createPhrasePreferences(store);await preferences.load();
assert.deepEqual(preferences.getSnapshot().value,own,'a stored local phrase must be restored rather than silently replaced by defaults');
assert.equal(writes.length,0,'reading preferences never writes');
assert.equal(await preferences.save({name:'다음',text:'Next step only.'}),true);
assert.deepEqual(preferences.getSnapshot().value,{name:'다음',text:'Next step only.'});
const restarted=createPhrasePreferences(store);await restarted.load();assert.deepEqual(restarted.getSnapshot().value,preferences.getSnapshot().value);
for(const value of [{name:'',text:'valid'},{name:'1234567',text:'valid'},{name:'a',text:''},{name:'a',text:'x'.repeat(32769)},{name:'a',text:Array(202).join('\n')+'x'},{name:'a',text:'x\u0000'}]){
 const before:number=writes.length;assert.equal(await preferences.save(value),false);assert.equal(writes.length,before);
}
assert.equal(validDeckPhrase({name:'😀😀😀😀😀😀',text:'한'.repeat(32768)}),true);
assert.equal(await preferences.save({name:'최대',text:'한'.repeat(32768)}),true);
failedWrite=true;assert.equal(await preferences.save(DEFAULT_DECK_PHRASE),false);assert.equal(preferences.getSnapshot().value.name,'최대','failed storage cannot publish an unsaved button');failedWrite=false;
failedRead=true;const unreadable=createPhrasePreferences(store);await unreadable.load();assert.equal(unreadable.getSnapshot().phase,'blocked');const count=writes.length;assert.equal(await unreadable.save(DEFAULT_DECK_PHRASE),false);assert.equal(writes.length,count);failedRead=false;await unreadable.retry();assert.equal(unreadable.getSnapshot().phase,'ready');
data.set(PHRASE_STORE_KEY,'{"name":"x","name":"y","text":"z"}');const corrupt=createPhrasePreferences(store);await corrupt.load();assert.equal(corrupt.getSnapshot().phase,'blocked','duplicate keys must not silently choose a phrase');
assert.ok(writes.every(key=>key===PHRASE_STORE_KEY),'no pairing, journal, draft or shared preference keys are touched');

const g=createPhraseGesture();g.begin('target-A',0);assert.equal(g.progress(1500),.5);assert.equal(g.release('target-A',2999),'confirm');assert.equal(g.release('target-A',2999),null);
g.begin('target-A',0);assert.equal(g.long('target-A',2999),null);assert.equal(g.long('target-A',3000),'edit');assert.equal(g.release('target-A',3001),null,'long press cannot also open review');
g.begin('target-A',0);assert.equal(g.release('target-A',3000),'edit');
g.begin('target-A',0);assert.equal(g.release('target-B',1),null);g.begin('target-A',0);assert.equal(g.release(null,1),null);
g.begin('target-A',0);g.cancel();assert.equal(g.release('target-A',1),null);g.begin('target-A',10);assert.equal(g.release('target-A',9),null);
console.log('PASS local phrase restore/save/limits/storage-failure isolation and one-press confirmation/edit/cancellation');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
