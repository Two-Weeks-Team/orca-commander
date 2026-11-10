import assert from 'node:assert/strict';
import {createPackStore,PACK_STORE_KEY,PACK_STORE_MAX_BYTES,type PackValueStore} from '../src/i18n/pack-store';
import {englishSourceVersion,resolvePackMessage,type LanguagePack} from '../src/i18n/pack';
import {en} from '../src/i18n/en';
let checks=0;const same=(actual:unknown,want:unknown)=>{checks++;assert.deepEqual(actual,want);};
const raw=(lang='ja',strings:Record<string,unknown>={'cmd.allow':'Grant','cmd.content':'Contents'},extra:Record<string,unknown>={})=>JSON.stringify({format:1,lang,script:lang==='ja'?'Jpan':'Latn',name:'Fixture language',sourceVersion:englishSourceVersion(),strings,...extra});
function memory(){let disk:string|null=null,readFail=false,writeFail=false,writeThenFail=false,readback:string|undefined;let writes=0,reads=0;const io:PackValueStore={get:async key=>{same(key,PACK_STORE_KEY);reads++;if(readFail)throw new Error('private platform failure');if(readback!==undefined){const value=readback;readback=undefined;return value;}return disk;},set:async(key,value)=>{same(key,PACK_STORE_KEY);writes++;if(writeFail)throw new Error('private platform failure');disk=value;if(writeThenFail)throw new Error('private platform failure');}};return{io,get disk(){return disk;},set disk(v:string|null){disk=v;},get writes(){return writes;},get reads(){return reads;},set readFail(v:boolean){readFail=v;},set writeFail(v:boolean){writeFail=v;},set writeThenFail(v:boolean){writeThenFail=v;},tamperNextRead(value:string){readback=value;}};}
async function main(){
 const m=memory(),store=createPackStore(m.io,{maxValueBytes:PACK_STORE_MAX_BYTES});
 same(store.getSnapshot().writable,false);same(store.getSnapshot().phase,'loading');same(await store.importPack(raw()),{ok:false,reason:'not_ready'});same(m.writes,0);same(m.reads,0);
 same(await store.load(),{ok:true});same(store.getSnapshot().writable,true);same(store.getSnapshot().packs,[]);same(m.writes,0);checks++;assert.equal(store.getSnapshot(),store.getSnapshot());
 let observed=0;const off=store.subscribe(()=>{observed++;});store.subscribe(()=>{throw new Error('observer cannot own storage');});
 const imported=await store.importPack(raw('ja',{'cmd.allow':'Grant','cmd.content':'Contents','unrecognized.owner':'drop'},{reviewed:true,ownerContent:'must not persist'}));
 same(imported.ok,true);if(!imported.ok)throw new Error('invalid fixture');same(imported.locale,'ja');same(imported.issues,[{key:'unrecognized.owner',reason:'unknown_key'}]);same(store.getSnapshot().locales,['ja']);same(store.getSnapshot().reviews,[]);same(m.disk!.includes('ownerContent'),false);same(m.disk!.includes('must not persist'),false);same(m.disk!.includes('reviewed'),false);same(Object.isFrozen(store.getSnapshot()),true);same(Object.isFrozen(store.getSnapshot().packs),true);same(observed>0,true);
 let pack=store.getSnapshot().packs[0];same(resolvePackMessage(pack,'cmd.allow',store.getSnapshot().reviews),en['cmd.allow']);
 const before=m.writes;same(await store.review('ja','cmd.allow','Changed source','Grant'),{ok:false,reason:'review_changed'});same(m.writes,before);same(await store.review('ja','cmd.content',en['cmd.content'],'Contents'),{ok:false,reason:'not_reviewable'});
 same(await store.review('ja','cmd.allow',en['cmd.allow'],'Grant'),{ok:true});same(store.getSnapshot().reviews.length,1);same(resolvePackMessage(pack,'cmd.allow',store.getSnapshot().reviews),'Grant');
 const reload=createPackStore(m.io,{maxValueBytes:PACK_STORE_MAX_BYTES});same(await reload.load(),{ok:true});same(reload.getSnapshot().reviews.length,1);
 const oldEnglish=en['cmd.allow'];try{(en as unknown as Record<string,string>)['cmd.allow']='Changed English source';same(await reload.retry(),{ok:true});same(reload.getSnapshot().reviews,[]);same(resolvePackMessage(reload.getSnapshot().packs[0],'cmd.allow',reload.getSnapshot().reviews),'Changed English source');}finally{(en as unknown as Record<string,string>)['cmd.allow']=oldEnglish;}
 same((await store.importPack(raw('ja',{'cmd.allow':'Different','cmd.content':'Contents'}))).ok,true);same(store.getSnapshot().reviews,[]);same(store.getSnapshot().packs.length,1);
 same(await store.review('ja','cmd.allow',en['cmd.allow'],'Grant'),{ok:false,reason:'review_changed'});same(await store.review('ja','cmd.allow',en['cmd.allow'],'Different'),{ok:true});same(await store.unreview('ja','cmd.allow'),{ok:true});same(store.getSnapshot().reviews,[]);
 for(const lang of ['fr','de','es','it','pt','nl','sv'])same((await store.importPack(raw(lang))).ok,true);
 same(store.getSnapshot().packs.length,8);same(await store.importPack(raw('fi')),{ok:false,reason:'pack_limit'});same((await store.importPack(raw('ja'))).ok,true);same(store.getSnapshot().packs.length,8);
 same(await store.removePack('ja'),{ok:true});same(store.getSnapshot().locales.includes('ja'),false);same(await store.removePack('ja'),{ok:false,reason:'missing_pack'});off();
 const bad=memory();bad.disk='{"format":2,"packs":[],"reviews":[]}';const blocked=createPackStore(bad.io,{maxValueBytes:PACK_STORE_MAX_BYTES});same(await blocked.load(),{ok:false,reason:'invalid_store'});same(blocked.getSnapshot().writable,false);same(await blocked.importPack(raw()),{ok:false,reason:'read_only'});same(bad.writes,0);bad.disk=null;same(await blocked.retry(),{ok:true});same(blocked.getSnapshot().writable,true);
 const unread=memory();unread.readFail=true;const readOnly=createPackStore(unread.io,{maxValueBytes:PACK_STORE_MAX_BYTES});same(await readOnly.load(),{ok:false,reason:'read_failed'});same(readOnly.getSnapshot().writable,false);same(JSON.stringify(readOnly.getSnapshot()).includes('private platform failure'),false);same(await readOnly.removePack('ja'),{ok:false,reason:'read_only'});same(unread.writes,0);
 const failed=memory(),rollback=createPackStore(failed.io,{maxValueBytes:PACK_STORE_MAX_BYTES});await rollback.load();await rollback.importPack(raw());const committed=rollback.getSnapshot().packs;failed.writeFail=true;same(await rollback.importPack(raw('fr')),{ok:false,reason:'write_failed'});same(rollback.getSnapshot().packs,committed);same(rollback.getSnapshot().writable,false);const failedWrites=failed.writes;same(await rollback.importPack(raw('de')),{ok:false,reason:'read_only'});same(failed.writes,failedWrites);failed.writeFail=false;same(await rollback.retry(),{ok:true});same(rollback.getSnapshot().locales,['ja']);
 failed.writeThenFail=true;same(await rollback.importPack(raw('fr')),{ok:false,reason:'write_failed'});same(rollback.getSnapshot().locales,['ja']);failed.writeThenFail=false;same(await rollback.retry(),{ok:true});same(rollback.getSnapshot().locales,['ja','fr']);
 const tiny=memory(),small=createPackStore(tiny.io,{maxValueBytes:64});await small.load();same(await small.importPack(raw()),{ok:false,reason:'storage_limit'});same(tiny.writes,0);same(small.getSnapshot().writable,true);
 const mismatch=memory(),checked=createPackStore(mismatch.io,{maxValueBytes:PACK_STORE_MAX_BYTES});await checked.load();mismatch.tamperNextRead('{"format":1,"packs":[],"reviews":[]}');same(await checked.importPack(raw()),{ok:false,reason:'write_unverified'});same(checked.getSnapshot().packs,[]);same(checked.getSnapshot().writable,false);
 // A write cannot publish a pack or review before exact readback, and concurrent mutations cannot overwrite one another.
 let disk:string|null=null,release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),begun=new Promise<void>(resolve=>{started=resolve;});let active=0,maxActive=0,index=0;
 const queued=createPackStore({get:async()=>disk,set:async(_key,value)=>{active++;maxActive=Math.max(maxActive,active);if(++index===1){started();await gate;}disk=value;active--;}},{maxValueBytes:PACK_STORE_MAX_BYTES});await queued.load();const first=queued.importPack(raw()),second=queued.importPack(raw('fr'));await begun;same(queued.getSnapshot().packs,[]);same(queued.getSnapshot().busy,true);release();same((await first).ok,true);same((await second).ok,true);same(maxActive,1);same(queued.getSnapshot().locales,['ja','fr']);
 const replace=queued.importPack(raw('ja',{'cmd.allow':'New grant'})),staleReview=queued.review('ja','cmd.allow',en['cmd.allow'],'Grant');await replace;same(await staleReview,{ok:false,reason:'review_changed'});same(queued.getSnapshot().reviews,[]);
 // An Alert may still refer to A while a replacement B is already queued. Check identity
 // inside the mutation queue, not only in a UI handler before the queued write settles.
 for(const action of ['remove','unreview'] as const){
  const m=memory(),s=createPackStore(m.io,{maxValueBytes:PACK_STORE_MAX_BYTES});await s.load();await s.importPack(raw());await s.review('ja','cmd.allow',en['cmd.allow'],'Grant');
  const shownA=s.getSnapshot().packs[0],before=m.writes;
  const replacement=s.importPack(raw('ja',{'cmd.allow':'Grant','cmd.content':'Replacement B'}));
  const stale=action==='remove'?s.removePack('ja',shownA):s.unreview('ja','cmd.allow',shownA);
  same((await replacement).ok,true);same(await stale,{ok:false,reason:'review_changed'});
  const currentB=s.getSnapshot().packs[0];same(currentB===shownA,false);same(currentB.strings['cmd.content'],'Replacement B');same(s.getSnapshot().reviews.length,1);same(m.writes,before+1);
  const clone={...currentB};same(await(action==='remove'?s.removePack('ja',clone):s.unreview('ja','cmd.allow',clone)),{ok:false,reason:'review_changed'});same(m.writes,before+1);
  same(await(action==='remove'?s.removePack('ja',currentB):s.unreview('ja','cmd.allow',currentB)),{ok:true});same(m.writes,before+2);same(s.getSnapshot().reviews.length,0);same(s.getSnapshot().packs.length,action==='remove'?0:1);
  if(action==='remove'){
   same(await s.removePack('ja',currentB),{ok:false,reason:'review_changed'});same(await s.unreview('ja','cmd.allow',currentB),{ok:false,reason:'review_changed'});same(m.writes,before+2);
  }
 }
 // Unknown storage schema never becomes an implicit destructive reset.
 for(const envelope of [{format:1,packs:[],reviews:[],extra:true},{format:1,packs:[pack,pack],reviews:[]},{format:1,packs:[pack],reviews:[{format:1,locale:'ja',key:'cmd.allow',source:en['cmd.allow'],translation:'Grant',reviewed:true}]}]){
  const b=memory();b.disk=JSON.stringify(envelope);const s=createPackStore(b.io,{maxValueBytes:PACK_STORE_MAX_BYTES});same((await s.load()).ok,false);same(s.getSnapshot().writable,false);same(b.writes,0);
 }
 const duplicate=memory();duplicate.disk='{"format":2,"format":1,"packs":[],"reviews":[]}';const duplicated=createPackStore(duplicate.io,{maxValueBytes:PACK_STORE_MAX_BYTES});same(await duplicated.load(),{ok:false,reason:'invalid_store'});same(duplicate.writes,0);
 const unreadBack=memory(),unverified=createPackStore(unreadBack.io,{maxValueBytes:PACK_STORE_MAX_BYTES});await unverified.load();unreadBack.readFail=true;same(await unverified.importPack(raw()),{ok:false,reason:'write_unverified'});same(unverified.getSnapshot().packs,[]);same(unverified.getSnapshot().writable,false);unreadBack.readFail=false;same(await unverified.retry(),{ok:true});same(unverified.getSnapshot().locales,['ja']);
 const failQueue=memory(),stopped=createPackStore(failQueue.io,{maxValueBytes:PACK_STORE_MAX_BYTES});await stopped.load();failQueue.writeFail=true;const failedFirst=stopped.importPack(raw()),blockedSecond=stopped.importPack(raw('fr'));same(await failedFirst,{ok:false,reason:'write_failed'});same(await blockedSecond,{ok:false,reason:'read_only'});same(failQueue.writes,1);
 for(const maxValueBytes of [0,-1,0.5,Infinity,PACK_STORE_MAX_BYTES+1]){checks++;assert.throws(()=>createPackStore(memory().io,{maxValueBytes}),/invalid_pack_storage_limit/);}
 console.log(`PASS: ${checks} pack store assertions (in-memory storage; no host/device/real persistence)`);
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
