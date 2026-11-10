import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/ui/deck-home.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let open,edit;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='openPhrase')open=n.initializer;if(ts.isJsxAttribute(n)&&n.name.getText(ast)==='onPhraseEdit')edit=n.initializer.expression;ts.forEachChild(n,visit);}visit(ast);assert.ok(open);assert.ok(edit);
const run=(node,env)=>vm.runInNewContext(ts.transpileModule(`(${node.getText(ast)})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,env)();
for(const blocked of ['none','not-ready','input-gate','stale','no-selection']){
 const calls=[],editCalls=[];
 const env={phraseReady:blocked!=='not-ready',view:{commands:{input:blocked!=='input-gate'}},canSelectNow:()=>blocked!=='stale',deck:{selected:blocked==='no-selection'?null:'exact-owned-key'},phrase:{value:{name:'계속',text:'Approved complete phrase'}},openInput:(...args)=>calls.push(args),setPhraseEditor:value=>editCalls.push(value)};
 run(open,env);run(edit,env);
 assert.equal(calls.length,blocked==='none'?1:0);
 if(calls.length){assert.equal(calls[0][0],'exact-owned-key');assert.equal(calls[0][1],'typed');assert.equal(calls[0][2],'Approved complete phrase');assert.equal(calls[0][3].autoPrepare,true);assert.equal(calls[0][3].isolated,true);}
 assert.equal(editCalls.length,blocked==='none'?1:0);
}
console.log('PASS actual Home phrase routing: exact selected key, full saved body, isolated existing confirmation, freshness/input gate checks, editor never sends');
