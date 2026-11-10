import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/ui/deck-home.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions={};
function visit(n){if(ts.isVariableDeclaration(n)&&['openClaudePrompt','submitClaude','closeClaude','claudeStillPresented','nativeScope','selectedNative','nativeEvidence'].includes(n.name.getText(ast)))functions[n.name.getText(ast)]=n.initializer;ts.forEachChild(n,visit);}visit(ast);
assert.ok(functions.openClaudePrompt,'the real Home must route Answer/Escape to the dedicated terminal owner');
const run=(name,env)=>vm.runInNewContext(ts.transpileModule(`(${functions[name].getText(ast)})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,env);
for(const available of [true,false]){
 const calls=[],review={id:'review',paneKey:'tab:leaf',generation:4},active={id:'a'},dialog={current:undefined};
 const env={active,claudeReady:available,claudeSending:{current:false},claudeDialogRef:dialog,canSelectNow:()=>true,deck:{selected:'key'},inventory:{generation:4},claudePresentation:{current:'scope'},claudeRequest:{current:0},mounted:{current:true},suppressDraftSheet:{current:false},voice:{cancelCapture(){}},client:{prepareClaudePrompt:async a=>{calls.push(a);return{ok:true,review};},dismissClaudePrompt(){throw Error('unexpected discard');}},claudeStillPresented:()=>true,showClaude:v=>{dialog.current=v;},submitClaude:()=>{throw Error('opening answer must not submit');}};
 await run('openClaudePrompt',env)();assert.equal(calls.length,available?1:0);if(available){assert.equal(dialog.current.review,review);assert.equal(dialog.current.loading,false);}
}
console.log('PASS actual Home Answer route: dedicated current pane preparation, gate failure, no opening send');
for(const result of [{status:'cursor_required',review:{id:'cursor-review'}},{status:'accepted',nextPrompt:true},{status:'unknown',cursorMoved:true}]){
 const old={id:'old',generation:4},shown=[];let calls=0;
 const env={claudeDialogRef:{current:{loading:false,review:old}},claudeSending:{current:false},client:{getSnapshot:()=>({busy:false}),respondClaudePrompt:async()=>{calls++;return result;}},structured:{getSnapshot:()=>({busy:false})},deckRef:{current:{selected:'key'}},claudePresentation:{current:'scope'},claudeReviewKey:()=> 'key',claudeStillPresented:()=>true,mounted:{current:true},setClaudeSubmitting(){},closeClaude(){throw Error('unexpected close');},showClaude:value=>shown.push(value)};
 await run('submitClaude',env)(1);assert.equal(calls,1,'a second hold is never automatic');
 if(result.status==='cursor_required'){assert.equal(shown[0].review,result.review);assert.equal(shown[0].notice,'claude.cursorRequired');assert.equal(shown[0].result,undefined);}
 if(result.nextPrompt)assert.equal(shown[0].result,'claude.nextPrompt');
 if(result.cursorMoved)assert.equal(shown[0].result,'claude.cursorUnknown');
}

// D29: display freshness cannot invalidate an already reviewed destination.
{
 const env={mounted:{current:true},AppState:{currentState:'active'},claudePresentation:{current:'scope'},deckRef:{current:{selected:'key',present:[]}},session:{actionChannel:()=>({generation:4})}};
 assert.equal(run('claudeStillPresented',env)('key',4,'scope'),true,'D29 held Claude review survives display-only stale present rows');
 env.session.actionChannel=()=>null;assert.equal(run('claudeStillPresented',env)('key',4,'scope'),false,'disconnect still closes authority');
}
{
 const env={locale:'ko',presentationRevision:1,mode:'deck',visible:true,sharedInput:{isOpen:false},inventory:{live:true,generation:4},actionConnection:{hostId:'host',runtimeId:'runtime',generation:4},deck:{selected:'key'},actions:{journal:'ready',busy:false},requests:{journal:'ready'},nativeEvidence:[{fence:1}]};
 const before=JSON.stringify(run('nativeScope',env));env.inventory.live=false;assert.equal(JSON.stringify(run('nativeScope',env)),before,'D29 held native scope does not expire with display age');
 env.actionConnection=null;assert.notEqual(JSON.stringify(run('nativeScope',env)),before,'disconnect still invalidates native scope');
}

{
 const target={hostId:'host',worktreeId:'w'},request={tabId:'tab',sessionId:'session',itemId:'item'},entry={...target,target:{worktreeId:'w',tabId:'tab',sessionId:'session'},fence:2,marker:{epoch:'a'},items:[{itemId:'item',revision:1}]};
 const env={active:{target,nativeRequest:request},selectedNative:request,nativeDialog:{entry,item:entry.items[0]},requests:{entries:[entry]}};
 const before=JSON.stringify(run('nativeEvidence',env));env.active=undefined;env.selectedNative=run('selectedNative',env);assert.equal(JSON.stringify(run('nativeEvidence',env)),before,'held native entry survives display-only row removal');
 env.requests.entries=[{...entry,fence:3}];assert.notEqual(JSON.stringify(run('nativeEvidence',env)),before,'new native fence invalidates held evidence');
}

function processingExpression(file,tag,progress){
 const src=readFileSync(new URL(file,import.meta.url),'utf8'),tree=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let value;
 function find(n){if((ts.isJsxSelfClosingElement(n)||ts.isJsxOpeningElement(n))&&n.tagName.getText(tree)===tag){const attr=n.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(tree)==='processingLabel');value=attr?.initializer?.expression;}ts.forEachChild(n,find);}find(tree);assert.ok(value,'real sheet must receive the actual owner stage');
 return vm.runInNewContext(ts.transpileModule('('+value.getText(tree)+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{actions:{progress},t:k=>k});
}
for(const [progress,key] of [['checking','confirm.checking'],['observing','claude.checkingAnswer'],['sending','confirm.processing']])assert.equal(processingExpression('../src/ui/deck-home.tsx','ClaudePromptSheet',progress),key);
for(const [progress,key] of [['checking','confirm.checking'],['sending','confirm.processing']])assert.equal(processingExpression('../src/ui/action-composer.tsx','PromptConfirmationDialog',progress),key);
