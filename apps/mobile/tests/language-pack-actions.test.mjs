import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real UI handlers, JSX button callbacks and Alert actions. The store is a
// recording port: the separate pack-store regression proves queue-time persistence fences.
// No React/native mount, native Alert delivery, real files/storage, host or device.
const url=new URL('../src/ui/deck/language-packs.tsx',import.meta.url),text=readFileSync(url,'utf8');
const source=ts.createSourceFile(url.pathname,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const handlers={},callbacks={};
function visit(node){
 if(ts.isVariableDeclaration(node)&&['run','remove','unreview'].includes(node.name.getText(source)))handlers[node.name.getText(source)]=node.initializer?.getText(source);
 if(ts.isCallExpression(node)&&node.expression.getText(source)==='button'){
  const label=node.arguments[0];
  if(label&&ts.isCallExpression(label)&&label.expression.getText(source)==='t'&&ts.isStringLiteral(label.arguments[0])){
   const key=label.arguments[0].text;if(['pack.remove','pack.unreview'].includes(key))callbacks[key]=node.arguments[1]?.getText(source);
  }
 }
 ts.forEachChild(node,visit);
}
visit(source);assert.equal(Object.keys(handlers).length,3);assert.equal(Object.keys(callbacks).length,2);
function expression(code,environment){return vm.runInNewContext(ts.transpileModule('('+code+')',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,environment);}
// Version-matched pure locale helper from the repository, without loading any native module.
const packText=readFileSync(new URL('../src/i18n/pack.ts',import.meta.url),'utf8'),packAST=ts.createSourceFile('pack.ts',packText,ts.ScriptTarget.Latest,true);
const localeEnvironment={};for(const name of ['validLocale','languagePackLocale']){
 const node=packAST.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.ok(node);localeEnvironment[name]=expression(node.getText(packAST).replace(/^export\s+/,''),localeEnvironment);
}
const enText=readFileSync(new URL('../src/i18n/en.ts',import.meta.url),'utf8'),catalog={exports:{}};
vm.runInNewContext(ts.transpileModule(enText,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:catalog,exports:catalog.exports});
const en=catalog.exports.en,key='cmd.allow';
const pack=translation=>Object.freeze({format:1,lang:'ja',script:'Jpan',name:'Fixture',sourceVersion:'0'.repeat(64),strings:Object.freeze({[key]:translation})});
let count=0;const same=(actual,expected,label)=>{count++;assert.deepEqual(actual,expected,label);};
function fixture(kind,{failure=false,reject=false,pending=false}={}){
 const A=pack('Shown A'),B=pack('Replacement B'),snapshot={packs:[A],busy:false};
 const calls=[],alerts=[],messages=[],tasks=[];let finish;
 const response=pending?new Promise(resolve=>{finish=resolve;}):Promise.resolve(failure?{ok:false,reason:'read_only'}:{ok:true});
 const record=async(...args)=>{calls.push(args);if(reject)throw Error('fixture write error');return response;};
 const environment={pack:A,key,source:en[key],translated:A.strings[key],en,languagePackLocale:localeEnvironment.languagePackLocale,
  languagePacks:{getSnapshot:()=>snapshot,removePack:record,unreview:record},busy:{current:false},
  t:value=>value,Alert:{alert:(title,body,buttons)=>alerts.push(buttons)},setWorking(){},setMessage:value=>messages.push(value),setSelected(){},setPage(){},setIssues(){},
 };
 const run=expression(handlers.run,environment);environment.run=work=>{const task=run(work);tasks.push(task);return task;};
 environment.remove=expression(handlers.remove,environment);environment.unreview=expression(handlers.unreview,environment);
 const activate=expression(callbacks['pack.'+kind],environment);activate();same(alerts.length,1);
 return{A,B,snapshot,calls,messages,busy:environment.busy,cancel:alerts[0].find(action=>action.style==='cancel'),confirm:alerts[0].find(action=>action.text==='pack.'+kind),settle:()=>Promise.all(tasks),finish:()=>finish?.({ok:true})};
}
for(const kind of ['remove','unreview']){
 const canceled=fixture(kind);canceled.cancel.onPress?.();await canceled.settle();same(canceled.calls.length,0,'Alert cancel performs no mutation');same(canceled.snapshot.packs[0],canceled.A);
 for(const distinctCopy of [false,true]){
  const stale=fixture(kind);stale.snapshot.packs=[distinctCopy?{...stale.A}:stale.B];stale.confirm.onPress();await stale.settle();
  same(stale.calls.length,0,'stale displayed pack never reaches the store');same(stale.messages.at(-1),'pack.failed');same(stale.busy.current,false);
 }
 const valid=fixture(kind,{pending:true});valid.confirm.onPress();valid.confirm.onPress();same(valid.calls.length,1,'duplicate Alert callback cannot overlap a pending action');
 same(valid.calls[0][0],'ja');same(valid.calls[0].at(-1)===valid.A,true,'send exact immutable displayed pack to the store');
 if(kind==='unreview')same(valid.calls[0][1],key);
 valid.finish();await valid.settle();same(valid.calls.length,1);same(valid.messages.at(-1),kind==='remove'?'pack.removed':'pack.reviewWithdrawn');same(valid.busy.current,false);
 const busy=fixture(kind);busy.snapshot.busy=true;busy.confirm.onPress();await busy.settle();same(busy.calls.length,0,'a queued store write blocks an Alert action');
 for(const options of [{failure:true},{reject:true}]){
  const failed=fixture(kind,options);failed.confirm.onPress();await failed.settle();same(failed.calls.length,1);same(failed.messages.at(-1),'pack.failed');same(failed.busy.current,false);
 }
}
const digest=value=>createHash('sha256').update(value).digest('hex');same(digest(readFileSync(url,'utf8')),digest(text),'UI source unchanged during this run');
console.log(`PASS: ${count} language-pack action callback assertions (actual source; no native Alert/storage/host/device)`);
