import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real DeckHome selection handlers, not a second implementation of the lock.
// Controlled React/state ports do not establish native touch or physical-device acceptance.
const text=readFileSync(new URL('../src/ui/deck-home.tsx',import.meta.url),'utf8');
const source=ts.createSourceFile('deck-home.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const handlers={},callbacks={};let followEffect;
function visit(node){
 if(ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect'&&node.arguments[0]?.getText(source).includes('followDesktop('))followEffect=node.arguments[0].getText(source);
 if(ts.isVariableDeclaration(node)&&['canChangeTarget','choose','pick'].includes(node.name.getText(source)))handlers[node.name.getText(source)]=node.initializer.getText(source);
 if((ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))&&node.tagName.getText(source)==='DeckScreen'){
  for(const name of ['onPressKey','onStep','onAttention','onFollow']){
   const a=node.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(source)===name);
   callbacks[name]=a?.initializer?.expression?.getText(source);
  }
 }
 ts.forEachChild(node,visit);
}
visit(source);
function expression(code,environment){
 const js=ts.transpileModule(`module.exports=(${code});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:undefined};vm.runInNewContext(js,{...environment,module});return module.exports;
}
let assertions=0;
for(const locked of [true,false])for(const action of ['key','joystick','swipe','dial','follow']){
 let state={selected:'A',present:['A','B']},focus={mode:'manual'},notices=0;
 const env={bindingReady:true,canSelectNow:()=>true,deckRef:{current:state},deck:state,
  voice:{isCapturing:()=>locked,notifyTargetChangeBlocked:()=>{notices++;}},
  setDeck:fn=>{state=fn(state);env.deckRef.current=state;},setFocus:fn=>{focus=typeof fn==='function'?fn(focus):fn;},
  layout:{keys:['A','B'],items:['A','B']},focus,projects:[],inventory:{agents:[]},presentSet:new Set(['A','B']),
  focusForChoice:()=>({mode:'manual',repoId:'B'}),stepWithinProject:()=> 'B',
  stepProject:()=>({state:{mode:'manual',repoId:'B'},select:'B'}),recencyOrder:()=>['B'],
  stepAttention:()=> 'B',resumeFollow:()=>({mode:'follow'}),
 };
 if(handlers.canChangeTarget)env.canChangeTarget=expression(handlers.canChangeTarget,env);
 env.choose=expression(handlers.choose,env);env.pick=expression(handlers.pick,env);
 if(action==='key')expression(callbacks.onPressKey,env)(1);
 if(action==='joystick')expression(callbacks.onStep,env)('down');
 if(action==='swipe')expression(callbacks.onStep,env)('right');
 if(action==='dial')expression(callbacks.onAttention,env)('next');
 if(action==='follow')expression(callbacks.onFollow,env)();
 if(locked){
  assert.equal(state.selected,'A',`recording ${action} must keep the starting pane`);assertions++;
  assert.deepEqual(focus,{mode:'manual'},`recording ${action} cannot alter project/follow state`);assertions++;
  assert.equal(notices,1,`recording ${action} must explain the blocked target change`);assertions++;
 }else{
  assert.equal(notices,0);assertions++;
  assert.equal(action==='follow'?focus.mode:state.selected,action==='follow'?'follow':'B');assertions++;
 }
}
for(const locked of [false,true]){
 let selected='A',followCalls=0;
 const env={visible:true,captureTargetLock:{current:locked},focusRef:{current:{mode:'follow'}},projects:[],inventory:{agents:[]},presentSet:new Set(['A','B']),desktopFocus:{},deckRef:{current:{selected:'A'}},
  followDesktop:()=>{followCalls++;return{state:{mode:'follow'},select:'B'};},setFocus(){},setDeck:fn=>{selected=fn({selected,present:['A','B']}).selected;}};
 expression(followEffect,env)();
 assert.equal(selected,locked?'A':'B','desktop activation cannot change the target during capture');assertions++;
 assert.equal(followCalls,locked?0:1);assertions++;
}
console.log(`PASS: ${assertions} actual DeckHome capture target lock assertions (controlled ports, no native UI)`);
