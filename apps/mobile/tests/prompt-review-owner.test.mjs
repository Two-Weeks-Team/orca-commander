import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const sourceText=readFileSync(new URL('../src/ui/action-composer.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('composer.tsx',sourceText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions={};let blockedEffect;
function visit(n){
 if(ts.isVariableDeclaration(n)&&['prepare','cancel'].includes(n.name.getText(ast)))functions[n.name.getText(ast)]=n.initializer.getText(ast);
 if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('if(blocked){context.invalidate'))blockedEffect=n.arguments[0].getText(ast);
 ts.forEachChild(n,visit);
}visit(ast);
const expression=(code,env)=>{const module={exports:undefined};vm.runInNewContext(ts.transpileModule('module.exports=('+code+');',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{...env,module});return module.exports;};
let checks=0;const same=(a,b,label)=>{checks++;assert.deepEqual(a,b,label);};
for(const stale of [false,true]){
 let finish,shown,busy=false,current=true;const canceled=[],prepared=[];
 const ticket=Object.freeze({id:'owned-ticket',hostId:'host',text:'Owned body',title:'Owned tab'}),agent={id:'agent',provider:'codex',title:'Owned tab',place:{repo:'Project',worktreeName:'Workspace'}};
 const host={hostId:'host',endpointHost:'Desktop label'},targetPresentation={current:undefined};
 const env={busy:false,blocked:false,speaking:false,text:ticket.text,agent,mounted:{current:true},context:{capture:()=> 'scope',isCurrent:()=>current},armed:{current:undefined},confirmationRef:{current:undefined},targetPresentation,draft:{current:{text:ticket.text,origin:'voice'}},
  client:{prepare:(a,text)=>{prepared.push([a,text]);return new Promise(r=>{finish=r;});},cancel:value=>canceled.push(value)},session:{getSnapshot:()=>({host})},Keyboard:{dismiss(){}},
  setBusy:v=>{busy=v;},setNotice(){},setResult(){},setConfirmation:v=>{shown=v;}};
 const work=expression(functions.prepare,env)();if(stale)current=false;finish({ok:true,confirmation:ticket});await work;
 same(prepared.length,1);same(prepared[0][0],agent);same(prepared[0][1],ticket.text);same(busy,false);
 if(stale){same(shown,undefined);same(canceled[0],ticket);same(targetPresentation.current,undefined);}
 else{
  same(shown,ticket);same(env.confirmationRef.current,ticket);same(targetPresentation.current.confirmation,ticket);same(targetPresentation.current.origin,'voice');
  const labels=targetPresentation.current.target;same(Object.values(labels).join('|'),'CODEX|Project|Workspace|Desktop label');same(Object.isFrozen(labels),true);
  agent.place.repo='Changed project';host.endpointHost='Changed desktop';same(Object.values(labels).join('|'),'CODEX|Project|Workspace|Desktop label','display metadata is frozen beside the exact prepared ticket');
 }
}
for(const [sending,result,wantClear] of [[true,undefined,false],[false,{status:'unknown'},false],[false,undefined,true]]){
 let cleared=0,canceled=0,invalidated=0;const owned={};
 const env={blocked:true,sending:{current:sending},result,context:{invalidate:()=>invalidated++},voice:{cancel:async()=>{}},confirmationRef:{current:wantClear?owned:undefined},client:{cancel:()=>canceled++},setConfirmation:()=>cleared++};
 expression(blockedEffect,env)();same(cleared,wantClear?1:0,'own pending or unknown result survives the journal blocking another send');same(canceled,wantClear?1:0);same(invalidated,1);
}
for(const status of ['accepted','unknown','partial'])for(const stale of [false,true]){
 const result={status},resultRef={current:stale?{}:result};let closed=0,mutated=0,canceled=0;
 const env={Platform:{OS:'android'},mounted:{current:true},resultDismissal:{current:undefined},result,resultRef,busy:false,confirmation:{},confirmationRef:{current:undefined},setConfirmation:()=>mutated++,setResult:()=>mutated++,onReviewResultClose:()=>closed++,client:{cancel:()=>canceled++}};
 const close=expression(functions.cancel,env);close();close();same(closed,stale?0:1,'only the exact current result closes its owner once');same(mutated,stale?0:2);same(canceled,0,'closing a consumed result does not send, replay or acknowledge');
}
console.log(`PASS: ${checks} actual prompt preparation/metadata/result-owner assertions (controlled ports)`);
