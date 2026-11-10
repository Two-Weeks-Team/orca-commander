import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

// Execute repository handlers AND their JSX callbacks. This is an isolated callback regression,
// not a React renderer, native gesture test, client-authority proof, or device acceptance test.
const sources=[
 {file:'deck-home.tsx',handler:'submitNative',shown:'nativeDialog',kind:'deck'},
 {file:'native-reply-editor.tsx',handler:'send',shown:'confirmation',kind:'reply'},
];
const digest=text=>createHash('sha256').update(text).digest('hex');
let count=0;
const same=(actual,expected)=>{count++;assert.deepEqual(actual,expected);};
function extract(spec){
 const url=new URL(`../src/ui/${spec.file}`,import.meta.url),text=readFileSync(url,'utf8');
 const source=ts.createSourceFile(spec.file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let handler,callback;
 function visit(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(source)===spec.handler)handler=node.initializer;
  if((ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))&&node.tagName.getText(source)==='NativeConfirmationDialog'){
   const attribute=node.attributes.properties.find(item=>ts.isJsxAttribute(item)&&item.name.getText(source)==='onConfirm');
   if(attribute?.initializer&&ts.isJsxExpression(attribute.initializer))callback=attribute.initializer.expression;
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
 assert.ok(handler&&callback,`${spec.file} must provide its original handler and confirmation callback`);
 assert.ok(ts.isArrowFunction(callback),`${spec.file} confirmation callback must remain explicit`);
 return{...spec,url,hash:digest(text),handlerText:handler.getText(source),callbackText:callback.getText(source)};
}
function expression(text,environment){
 const output=ts.transpileModule(`module.exports=(${text});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:undefined};vm.runInNewContext(output,{...environment,module});return module.exports;
}
function fixture(spec,{shown,held=shown,outcome='accepted',deferred=false}={}){
 const heldRef={current:held},pending={current:false},calls=[],cancels=[],tasks=[],mutations=[];
 const ticket=Symbol('same unchanged scope');let resolve;
 const response=deferred?new Promise(done=>{resolve=done;}):Promise.resolve({status:outcome});
 const confirm=async value=>{calls.push(value);return response;};
 const client={getSnapshot:()=>({busy:false}),confirm,confirmReply:confirm,cancel:value=>cancels.push(value)};
 const update=value=>mutations.push(value),context={isCurrent:value=>value===ticket};
 const common={client,mounted:{current:false}};
 const environment=spec.kind==='deck'?{
  ...common,heldNative:heldRef,nativeSending:pending,structured:client,nativeContext:context,nativeArmed:{current:ticket},
  nativeDialog:shown,setNativeSubmitting:update,setNativeResult:update,cancelNative:()=>{},
 }:{
  ...common,held:heldRef,confirmation:shown,dialog:{current:held},closed:{current:false},pending,resultRef:{current:undefined},
  blocked:false,capture:false,context,armed:{current:ticket},cancelConfirmation:()=>{},
  setPreparing:update,setConfirmation:update,setResult:update,
 };
 const handler=expression(spec.handlerText,environment);
 // Track the original async handler promise even though the real JSX callback deliberately uses void.
 environment[spec.handler]=(...args)=>{const task=handler(...args);tasks.push(task);return task;};
 const activate=expression(spec.callbackText,environment);
 return{activate,calls,cancels,held:heldRef,pending,mutations,finish:()=>resolve?.({status:outcome}),settle:()=>Promise.all(tasks)};
}
for(const description of sources){
 const source=extract(description);
 const A=Object.freeze({operationId:'synthetic-A'}),B=Object.freeze({operationId:'synthetic-B'});
 for(const held of [B,{...A}]){
  const stale=fixture(source,{shown:A,held});stale.activate();await stale.settle();
  same(stale.calls.length,0);same(stale.cancels.length,0);same(stale.mutations.length,0);
  same(stale.held.current===held,true);same(stale.pending.current,false);
 }
 for(const outcome of ['accepted','busy']){
  const current=fixture(source,{shown:A,outcome});current.activate();await current.settle();
  same(current.calls.length,1);same(current.calls[0]===A,true);
  same(current.cancels.length,1);same(current.cancels[0]===A,true);same(current.pending.current,false);
 }
 const pending=fixture(source,{shown:A,deferred:true});pending.activate();
 same(pending.calls.length,1);same(pending.pending.current,true);
 pending.activate();same(pending.calls.length,1);same(pending.pending.current,true);
 pending.finish();await pending.settle();pending.activate();await pending.settle();
 same(pending.calls.length,1);same(pending.cancels.length,1);same(pending.cancels[0]===A,true);
 same(pending.pending.current,false);same(pending.held.current,undefined);
 // No hardcoded source pin: reject an edit during this isolated run without printing source contents.
 same(digest(readFileSync(source.url,'utf8')),source.hash);
}
// The visible confirmation heading carries fixed phase/reason and bounded timing metadata.
// Execute the actual lifecycle/touch callbacks; do not invent native event delivery.
const panelUrl=new URL('../src/ui/confirmation-panel.tsx',import.meta.url),panelText=readFileSync(panelUrl,'utf8');
const panelAST=ts.createSourceFile('confirmation-panel.tsx',panelText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let diagnostic,touchCancel,lifecycle;
let publishText,displayKeyText;
function panelVisit(node){
 if(ts.isVariableDeclaration(node)&&node.name.getText(panelAST)==='publish')publishText=node.initializer?.getText(panelAST);
 if(ts.isVariableDeclaration(node)&&node.name.getText(panelAST)==='confirmationDisplayKey')displayKeyText=node.initializer?.getText(panelAST);
 if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node)){
  const opening=ts.isJsxElement(node)?node.openingElement:node;
  const attribute=name=>opening.attributes.properties.find(item=>ts.isJsxAttribute(item)&&item.name.getText(panelAST)===name);
  const id=attribute('testID')?.initializer;
  if(id&&ts.isJsxExpression(id)&&id.expression&&ts.isTemplateExpression(id.expression)&&id.expression.head.text==='deck-confirm-state-')diagnostic=node;
  if(id&&ts.isStringLiteral(id)&&id.text==='deck-confirm-send'){
   const callback=attribute('onTouchCancel')?.initializer;
   if(callback&&ts.isJsxExpression(callback))touchCancel=callback.expression?.getText(panelAST);
  }
 }
 if(ts.isCallExpression(node)&&node.expression.getText(panelAST)==='useEffect'){
  let appListener=false;
  function inspect(item){if(ts.isCallExpression(item)&&item.expression.getText(panelAST)==='AppState.addEventListener')appListener=true;ts.forEachChild(item,inspect);}
  if(node.arguments[0])inspect(node.arguments[0]);if(appListener)lifecycle=node.arguments[0].getText(panelAST);
 }
 ts.forEachChild(node,panelVisit);
}
panelVisit(panelAST);assert.ok(diagnostic&&touchCancel&&lifecycle);
const require=createRequire(import.meta.url);
function diagnosticNode(state){
 const module={exports:{}};
 const output=ts.transpileModule(`module.exports=(${diagnostic.getText(panelAST)});`,{fileName:'diagnostic.tsx',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(output,{module,exports:module.exports,require,Text:'Text',S:{footer:{}},CS:{},deck:false,state,t:key=>key,title:'Visible confirmation title',disabled:false,cancelDisabled:false,hasResult:false,sourceLabel:'Full original source label',characterCount:undefined});return module.exports;
}
for(const reason of [null,'continuity','disabled','clock','touch-cancel','lifecycle','context','explicit']){
 const phase=reason===null?'holding':'cancelled',node=diagnosticNode({phase,cancellationReason:reason,maxGapMs:201});
 same(node.props.testID,`deck-confirm-state-${phase}-${reason??'none'}-201`);
 same(node.props.accessibilityLabel,undefined);same(node.props.children,'Visible confirmation title');
 same(node.props.accessibilityRole,'header');same(node.props.accessibilityState.busy,false);same(node.props.accessibilityValue.text,phase==='cancelled'?'confirm.interrupted':'Visible confirmation title');
}
const reasons=[],accepted={current:true};let published=0,cancelled=0,readerEvent,appEvent,timerMs;
const gesture={cancel:reason=>reasons.push(reason),pulse(){}};
expression(touchCancel,{gesture,releaseAccepted:accepted,publish:()=>published++})();same(reasons,['touch-cancel']);same(accepted.current,false);same(published,1);
const callbacks={current:{cancelDisabled:false,hasResult:false,onCancel:()=>cancelled++}},mode={current:null};
const cleanup=expression(lifecycle,{
 gesture,callbacks,mode,releaseAccepted:accepted,setScreenReader(){},observeGeometry(){},publish(){},monotonicNow:()=>0,Date,
 AccessibilityInfo:{isScreenReaderEnabled:()=>({then:done=>done(false)}),addEventListener:(name,fn)=>{readerEvent=fn;return{remove(){}};}},
 AppState:{addEventListener:(name,fn)=>{appEvent=fn;return{remove(){}};}},setInterval:(fn,ms)=>{timerMs=ms;return 1;},clearInterval(){},
})();
same(timerMs,40);readerEvent(true);same(reasons.at(-1),'context');same(cancelled,1);
appEvent('background');same(reasons.at(-1),'lifecycle');same(cancelled,2);
callbacks.current.cancelDisabled=true;appEvent('inactive');same(cancelled,2);cleanup();same(reasons.at(-1),'context');
// A 40ms authority pulse must not schedule React merely because the snapshot object is new.
assert.ok(publishText);
const displayKey=displayKeyText?expression(displayKeyText,{}):undefined;
const snapshot=(patch={})=>({phase:'idle',readEnd:true,holdMs:0,cancellationReason:null,maxGapMs:0,...patch});
let shown=snapshot(),nextSnapshot=shown;const displayedStates=[];
const publisher=expression(publishText,{gesture:{snapshot:()=>nextSnapshot},setState:next=>{shown=next;displayedStates.push(next);},publishedDisplay:{current:displayKey?.(shown)},confirmationDisplayKey:displayKey});
for(let i=1;i<=100;i++){nextSnapshot=snapshot();publisher();}
same(displayedStates.length,0,'D29 idle pulses have no expiry counter and schedule no renders');
assert.ok(displayKey,'the UI projection is explicit and testable');
function publisherFixture(initial,gesture){
 let shown=initial,next=initial;const updates=[];
 const publish=expression(publishText,{gesture:gesture??{snapshot:()=>next},setState:value=>{shown=value;updates.push(value);},publishedDisplay:{current:displayKey(initial)},confirmationDisplayKey:displayKey});
 return{publish,updates,get shown(){return shown;},next:value=>{next=value;}};
}
const progress=publisherFixture(snapshot({phase:'holding'}));
progress.next(snapshot({phase:'holding',holdMs:41,maxGapMs:41}));progress.publish();same(progress.updates.length,0,'gap-only changes do not restart 40ms rendering');
progress.next(snapshot({phase:'holding',holdMs:82,maxGapMs:41}));progress.publish();same(progress.updates.length,1);same(progress.shown.maxGapMs,41,'a visible progress update captures the latest diagnostics');
const interrupted=snapshot({phase:'cancelled',cancellationReason:'continuity',maxGapMs:119});
progress.next(interrupted);progress.publish();same(progress.shown.cancellationReason,'continuity');same(progress.shown.maxGapMs,119,'the first terminal transition captures the observed failing gap');
const terminalUpdates=progress.updates.length;for(let i=0;i<100;i++){progress.next({...interrupted});progress.publish();}same(progress.updates.length,terminalUpdates,'100 terminal pulses do not render unchanged display state');
const readEnd=publisherFixture(snapshot({readEnd:false}));readEnd.next(snapshot());readEnd.publish();same(readEnd.shown.readEnd,true);same(readEnd.updates.length,1);
// Replay the real gesture twice. Calling the actual UI publisher may change neither authority
// nor the visible phase/read gate/seconds/progress/reason compared with publishing every event.
const gestureUrl=new URL('../src/core/confirmation-gesture.ts',import.meta.url),gestureText=readFileSync(gestureUrl,'utf8'),gestureModule={exports:{}};
vm.runInNewContext(ts.transpileModule(gestureText,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:gestureModule,exports:gestureModule.exports});
let seed=317,differentialEvents=0;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
for(let run=0;run<250;run++){
 let now=1000,wall=100000;const clock={now,wallNow:wall,preparedAt:wall-Math.floor(random()*30001)};
 const baseline=gestureModule.exports.createConfirmationGesture(clock),optimized=gestureModule.exports.createConfirmationGesture(clock),view=publisherFixture(optimized.snapshot(),optimized);
 for(let event=0;event<28;event++){
  let method,args;const kind=Math.floor(random()*8);now+=[0,40,50,100,101,800,1000][Math.floor(random()*7)];wall=99000+now;
  if(kind===0){method='setReadEnd';args=[random()>.3];}else if(kind===1){method='setDisabled';args=[random()>.7];}
  else if(kind===2){method='startHold';args=[now,wall,now-900];}else if(kind===3){method='releaseHold';args=[now,wall,random()>.1?now-900:NaN];}
  else if(kind===4){method='accessibleActivate';args=[now,wall];}else if(kind===5){method='cancel';args=['touch-cancel'];}
  else{method='pulse';args=[kind===7&&random()>.5?now-200:now,wall];}
  assert.equal(optimized[method](...args),baseline[method](...args));view.publish();
  assert.deepEqual(optimized.snapshot(),baseline.snapshot());assert.equal(displayKey(view.shown),displayKey(baseline.snapshot()));differentialEvents++;
 }
}
same(differentialEvents,7000);same(digest(readFileSync(gestureUrl,'utf8')),digest(gestureText));
same(digest(readFileSync(panelUrl,'utf8')),digest(panelText));
console.log(`PASS: ${count} actual confirmation callback/diagnostic assertions + ${differentialEvents} display/authority differential events (AST execution; no native gesture, RPC or device)`);
