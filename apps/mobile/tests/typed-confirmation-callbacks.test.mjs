import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual typed editor handlers and dialog callbacks. No React/native mount,
// network, host channel, client-authority simulation, or physical-device claim.
const url=new URL('../src/ui/action-composer.tsx',import.meta.url),text=readFileSync(url,'utf8');
const source=ts.createSourceFile(url.pathname,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const digest=value=>createHash('sha256').update(value).digest('hex');
const handlers={},callbacks={};
function visit(node){
 if(ts.isVariableDeclaration(node)&&['send','cancel'].includes(node.name.getText(source)))handlers[node.name.getText(source)]=node.initializer?.getText(source);
 if((ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))&&node.tagName.getText(source)==='PromptConfirmationDialog'){
  for(const name of ['onConfirm','onCancel']){
   const attribute=node.attributes.properties.find(item=>ts.isJsxAttribute(item)&&item.name.getText(source)===name);
   if(attribute?.initializer&&ts.isJsxExpression(attribute.initializer))callbacks[name]=attribute.initializer.expression?.getText(source);
  }
 }
 ts.forEachChild(node,visit);
}
visit(source);for(const value of [...Object.values(handlers),...Object.values(callbacks)])assert.ok(value);
assert.equal(Object.keys(handlers).length,2);assert.equal(Object.keys(callbacks).length,2);
function expression(code,environment){
 const output=ts.transpileModule(`module.exports=(${code});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:undefined};vm.runInNewContext(output,{...environment,module});return module.exports;
}
function fixture(options){
 const {shown,current=true,deferred=false,busy=false,blocked=false}=options;
 const held=Object.hasOwn(options,'held')?options.held:shown;
 const confirmationRef={current:held},calls=[],cancels=[],mutations=[],tasks=[];let invalidateCount=0,resolve;
 const ticket=Symbol('same scope'),response=deferred?new Promise(done=>{resolve=done;}):Promise.resolve({status:'refused'});
 const update=value=>mutations.push(value);
 const environment={result:undefined,resultRef:{current:undefined},sending:{current:false},setResult:update,confirmation:shown,confirmationRef,busy,blocked,mounted:{current:true},armed:{current:ticket},
  context:{invalidate:()=>{invalidateCount++;},isCurrent:value=>current&&value===ticket},
  client:{confirm:async value=>{calls.push(value);return response;},cancel:value=>cancels.push(value)},
  setBusy:update,setConfirmation:update,setNotice:update,setText:update,setOrigin:update,
  draft:{current:{text:'Retained fixture draft',origin:'typed'}},rememberDraft:{current:update},captureAcceptedDraft:undefined,actionOutcomeKey:()=> 'input.refused',
 };
 environment.cancel=expression(handlers.cancel,environment);
 const send=expression(handlers.send,environment);
 environment.send=(...args)=>{const task=send(...args);tasks.push(task);return task;};
 return{confirm:expression(callbacks.onConfirm,environment),cancel:expression(callbacks.onCancel,environment),calls,cancels,mutations,confirmationRef,
  invalidations:()=>invalidateCount,settle:()=>Promise.all(tasks),finish:()=>resolve?.({status:'refused'})};
}
let count=0;const failures=[];
const same=(actual,expected,label)=>{count++;try{assert.deepEqual(actual,expected,label);}catch(error){failures.push(error.message);}};
const A=Object.freeze({operationId:'synthetic-typed-A'}),B=Object.freeze({operationId:'synthetic-typed-B'});
for(const held of [B,{...A},undefined])for(const activation of ['confirm','cancel']){
 const f=fixture({shown:A,held});f[activation]();await f.settle();
 const prefix=`stale ${activation}, held ${held===B?'B':held?'distinct A':'empty'}`;
 same(f.calls.length,0,prefix+' must not confirm');same(f.cancels.length,0,prefix+' must not cancel');
 same(f.mutations.length,0,prefix+' must not mutate UI/draft');same(f.confirmationRef.current===held,true,prefix+' must preserve held identity');
 same(f.invalidations(),0,prefix+' must preserve the current context');
}
const currentCancel=fixture({shown:A});currentCancel.cancel();
same(currentCancel.cancels,[A],'current cancel exact object');same(currentCancel.confirmationRef.current,undefined,'current cancel consumes ref');same(currentCancel.invalidations(),1,'current cancel disarms');
const current=fixture({shown:A,deferred:true});current.confirm();current.confirm();
same(current.calls,[A],'current confirm once before await');same(current.confirmationRef.current,undefined,'current confirm consumes ref before await');
const before=current.mutations.length;current.cancel();same(current.mutations.length,before,'delayed cancel after consumption does not mutate');same(current.cancels.length,0,'consumed confirmation is not cancelled again');
current.finish();await current.settle();same(current.calls,[A],'current confirm remains once after await');
const expired=fixture({shown:A,current:false});expired.confirm();await expired.settle();same(expired.calls.length,0,'context expiry blocks confirm');same(expired.cancels,[A],'context expiry exact cancel');
for(const guard of ['busy','blocked']){const guarded=fixture({shown:A,[guard]:true});guarded.confirm();await guarded.settle();same(guarded.calls.length,0,guard+' blocks confirm');same(guarded.confirmationRef.current,A,guard+' preserves current ref');}
same(digest(readFileSync(url,'utf8')),digest(text),'source did not change during run');
if(failures.length){for(const failure of failures)console.error(failure);throw new Error(`${failures.length}/${count} typed callback assertions failed`);}
console.log(`PASS: ${count} actual typed confirmation callback assertions (AST execution; no native mount, host RPC or device)`);
