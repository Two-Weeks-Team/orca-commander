import {renderer} from './helpers/deck-sheet-render.mjs';
const sheetRenderer=renderer(),{AgentKeyList}=sheetRenderer.load('src/ui/deck/deck-sheets.tsx');
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),inbox=require('../.test-build/src/core/voice-draft-inbox.js'),{bindKey}=require('../.test-build/src/core/deck-model.js'),{resolveVoiceDestination}=require('../.test-build/src/core/voice-destination.js'),{createTranslator}=require('../.test-build/src/i18n/messages.js');
const text=readFileSync(new URL('../src/ui/deck-home.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('home.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),handlers={},voice={},ui={},effects={};
const attr=(n,k)=>n.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(ast)===k)?.initializer?.expression?.getText(ast);
function visit(n){
 if(ts.isVariableDeclaration(n)&&['canChangeTarget','choose','pick'].includes(n.name.getText(ast)))handlers[n.name.getText(ast)]=n.initializer.getText(ast);
 if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useGlobalDeckVoice')for(const p of n.arguments[0].properties)if(p.name)voice[p.name.getText(ast)]=p.initializer?.getText(ast);
 if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'){const b=n.arguments[0].getText(ast);if(b.includes('deckSlotStore.load'))effects.restore=b;if(b.includes('reconcileDeck('))effects.reconcile=b;if(b.includes('deferredRestore.current')&&!b.includes('deckSlotStore.load'))effects.drain=b;}
 if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){
  const tag=n.tagName.getText(ast),press=attr(n,'onPress');if(tag==='DeckList')ui.listSelect=attr(n,'onSelect');if(tag==='AgentKeyList'){ui.keySelect=attr(n,'onSelect');ui.keyOpen=attr(n,'onOpen');}
  const id=n.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(ast)==='testID')?.initializer;
  if(id&&ts.isJsxExpression(id)&&id.expression&&ts.isTemplateExpression(id.expression)&&id.expression.head.text==='deck-item-')ui.listRow=press;
  if(tag==='Pressable'&&press?.includes('setRetry')){const name=press.includes('Alert.alert')?'reset':'retry';ui[name]=press;ui[name+'Disabled']=attr(n,'disabled');}
 }
 ts.forEachChild(n,visit);
}visit(ast);
const expression=(code,env)=>{const module={exports:undefined},out=ts.transpileModule('module.exports=('+code+');',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(out,{...env,module});return module.exports;};
let checks=0;const failures=[];const same=(a,b,label)=>{checks++;try{assert.deepEqual(a,b,label);}catch(e){failures.push(e.message);}};
for(const kind of ['listRow','listSelect','retry','reset','sameKey']){
 let state={selected:'A',present:['A','B'],restore:'blocked'},sheet='list',notices=0,retries=0,alerts=0,saves=0;
 const env={voice:{isCapturing:()=>true,notifyTargetChangeBlocked:()=>notices++},captureTargetLocked:true,canSelectNow:()=>true,deckRef:{current:state},deck:state,projects:[],key:'B',t:k=>k,Date,
  setDeck:f=>{state=f(state);env.deckRef.current=state;},setFocus(){},focusForChoice:()=>({}),setSheet:s=>{sheet=s;},setRetry:()=>retries++,setStorageError(){},emptyDeckState:()=>({}),Alert:{alert(){alerts++;}},deckSlotStore:{save:async()=>{saves++;return true;}}};
 env.canChangeTarget=expression(handlers.canChangeTarget,env);env.choose=expression(handlers.choose,env);env.pick=expression(handlers.pick,env);
 if(kind==='sameKey')env.choose('A');else if(kind==='listRow'){const nodes=sheetRenderer.walk(sheetRenderer.render(AgentKeyList,{rows:[{key:'B',slot:2,agent:{id:'B',title:'B',state:'working',provider:'codex',updatedAt:new Date(0).toISOString()}}],width:411,now:0,selectedKey:'A',onSelect:expression(ui.keySelect,env),onOpen:expression(ui.keyOpen,env)}));nodes.find(n=>n.props.testID==='deck-item-B').props.onPress();}else expression(ui[kind],env)(kind==='listSelect'?'B':undefined);
 if(kind==='retry'||kind==='reset')same(expression(ui[kind+'Disabled'],env),true,kind+' is visibly disabled while recording');
 same(state.selected,'A',kind+' keeps capture target');same(sheet,'list',kind+' cannot leave current sheet');same([retries,alerts,saves],[0,0,0],kind+' cannot reset/retry');same(notices,kind==='sameKey'?0:1,kind+' notice count');
}
{
 let selected=0,sheet='list';const env={pick:key=>{selected++;return key==='B';},setSheet:next=>{sheet=next;}};
 const nodes=sheetRenderer.walk(sheetRenderer.render(AgentKeyList,{rows:[{key:'B',slot:2,agent:{id:'B',title:'B',state:'working',provider:'codex',updatedAt:new Date(0).toISOString()}}],width:411,now:0,selectedKey:'A',onSelect:expression(ui.keySelect,env),onOpen:expression(ui.keyOpen,env)}));
 nodes.find(n=>n.props.testID==='deck-item-B').props.onPress();same(selected,1,'actual Home onSelect forwards the selected key');same(sheet,'content','actual Home onOpen opens content only after selection succeeds');
}

{
 let state={selected:'A'},resolve;const pending=new Promise(r=>{resolve=r;}),deferredRestore={current:undefined};
 const env={captureTargetLock:{current:false},deferredRestore,deckSlotStore:{load:()=>pending},Date,setLoaded(){},setStored(){},setStorageError(){},setDeck:s=>{state=s;},lastStored:{current:null},requested:{current:null},deckStoreFingerprint:()=> 'hash'};
 const cleanup=expression(effects.restore,env)();env.captureTargetLock.current=true;resolve({selected:'B',restore:'ready'});await Promise.resolve();await Promise.resolve();same(state.selected,'A','in-flight restore cannot replace capture selection');
 if(effects.drain){env.captureTargetLock.current=false;expression(effects.drain,env)();same(state.selected,'B','deferred restore applies after capture');}cleanup();
}
{
 let state={selected:'A'};const env={loaded:true,visible:true,captureTargetLock:{current:true},inventory:{},now:0,reconcileDeck:()=>({selected:'B'}),setDeck:f=>{state=f(state);}};expression(effects.reconcile,env)();same(state.selected,'A','reconcile keeps capture selection');
}
{
 const captureTargetLock={current:false},captureId={current:undefined},inboxRef={current:inbox.emptyVoiceDraftInbox()};let flag=false;
 const env={...inbox,unaccepted:undefined,suppressDraftSheet:{current:true},inboxRef,captureId,captureTargetLock,mounted:{current:true},setCaptureTargetLocked:v=>{flag=v;},publishInbox:v=>{inboxRef.current=v;}};
 same(expression(voice.onCaptureStart,env)(),true,'actual start reserves');same([captureTargetLock.current,flag],[true,true],'start locks');expression(voice.onCaptureFinished,env)();same([captureTargetLock.current,flag,captureId.current],[false,false,undefined],'finish releases');
}
const A={id:'A',provider:'codex',title:'A',target:{hostId:'host',worktreeId:'worktree',terminalId:'pane-A',connectionGeneration:1}},B={...A,id:'B',target:{...A.target,terminalId:'pane-B'}},a=bindKey(A),b=bindKey(B);
for(const stage of ['captured','changed','no_target','hidden','suppressed','retained']){
 const logs=[],opened=[];let published;const draft={text:'Owned synthetic transcript never logged',targetKey:stage==='no_target'?null:a,generation:1,destinationResolved:true,ambiguous:false,...(stage==='changed'?{targetChanged:true}:{})};
 const env={...inbox,inboxRef:{current:inbox.emptyVoiceDraftInbox()},captureId:{current:undefined},publishInbox:v=>{published=v;},setUnaccepted(){},visible:stage!=='hidden',suppressDraftSheet:{current:stage==='suppressed'},resolveVoiceDestination,inventory:{live:true,generation:1,agents:stage==='retained'?[B]:[A,B]},snapshot:{host:{hostId:'host'}},deck:{selected:a,present:[a,b]},desktopFocus:undefined,openInput:(...args)=>opened.push(args),withVoiceNote:s=>s,logVoiceTargetStage:s=>logs.push(s),createTranslator,console:{info:(...args)=>logs.push(args.join(' '))},setSheet(){}};
 expression(voice.onDraft,env)(draft,{completed:true});same(opened.length,stage==='captured'?1:0,stage+' proposal');same(logs.length,1,stage+' log present');same(logs[0],stage,stage+' fixed decision stage');same(published.entries[0].text,draft.text,'every hidden/suppressed/unresolved branch retains its captured draft');same(logs.some(s=>String(s).includes(draft.text)),false,'no body in logs');
}
{
 let recording=false,saves=0,buttons,notices=0;
 const env={voice:{isCapturing:()=>recording,notifyTargetChangeBlocked:()=>notices++},captureTargetLocked:false,t:k=>k,deckRef:{current:{restore:'blocked'}},Date,
  Alert:{alert(_title,_hint,choices){buttons=choices;}},deckSlotStore:{save:async()=>{saves++;return true;}},emptyDeckState:()=>({}),setRetry(){},setStorageError(){}};
 expression(ui.reset,env)();recording=true;buttons[1].onPress();
 same([saves,notices],[0,1],'a reset alert opened before capture cannot reset slots during recording');
}

if(failures.length){for(const f of failures)console.error(f);throw Error(`${failures.length}/${checks} actual Home boundary assertions failed`);}console.log(`PASS: ${checks} actual DeckHome capture/list/restore/owner/decision assertions (controlled ports)`);
