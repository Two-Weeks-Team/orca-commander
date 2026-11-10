import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {routeCapturedVoice}=require('../.test-build/src/core/ptt-gesture.js');
const text=readFileSync(new URL('../src/ui/use-global-deck-voice.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('use-global-deck-voice.ts',text,ts.ScriptTarget.Latest,true);
let settleText,finishText;
function visit(n){
 if(ts.isBinaryExpression(n)&&n.left.getText(ast)==='settle.current')settleText=n.right.getText(ast);
 if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='finishRun')finishText=n.initializer.getText(ast);
 ts.forEachChild(n,visit);
}visit(ast);assert.ok(settleText);
const expression=(code,env)=>{const module={exports:undefined};const out=ts.transpileModule('module.exports=('+code+');',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(out,{...env,module});return module.exports;};
let count=0;
for(const failing of ['draft','navigate','finished']){
 let releases=0,deliveries=0;const logs=[];
 const context={key:'A',generation:1,labels:[{key:'A',label:'Owned'}]};
 const run={context,started:true,finished:false,waiting:false,delivered:false,canceled:false,targetChanged:false,onFinished(){releases++;if(failing==='finished')throw Error('synthetic callback failure');}};
 const env={displayClock:{current:null},capture:{current:run},voice:{getSnapshot:()=>({phase:'draft',text:failing==='navigate'?'next':'Owned body'})},capturing:()=>false,mergeVoiceDraft:()=>undefined,targetMatches:()=>true,routeCapturedVoice,
  current:{current:{getContext:()=>context,enabled:true,confirmationOpen:false,onDraft(){deliveries++;if(failing==='draft')throw Error('synthetic callback failure');},onNavigate(){deliveries++;if(failing==='navigate')throw Error('synthetic callback failure');}}},
  logVoiceTargetStage:stage=>logs.push(stage),console:{info(){}},};
 if(finishText)env.finishRun=expression(finishText,env);
 const settle=expression(settleText,env);
 assert.doesNotThrow(()=>settle(run),'consumer callback failure must not escape settlement');count++;
 assert.equal(run.finished,true);count++;
 assert.equal(releases,1,'capture is released exactly once even when callbacks throw');count++;
 settle(run);assert.equal(releases,1);count++;
 assert.equal(deliveries,1);count++;
}
console.log(`PASS: ${count} actual global voice settlement exception assertions (controlled callbacks)`);
