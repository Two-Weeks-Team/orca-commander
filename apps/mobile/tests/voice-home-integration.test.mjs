import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {harness} from './global-voice-audio-start.test.mjs';
const require=createRequire(import.meta.url),inbox=require('../.test-build/src/core/voice-draft-inbox.js'),project=require('../.test-build/src/core/project-focus.js');
const text=readFileSync(new URL('../src/ui/deck-home.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('home.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions={},voice={};
function visit(n){
 if(ts.isVariableDeclaration(n)&&['canChangeTarget','choose','pick'].includes(n.name.getText(ast)))functions[n.name.getText(ast)]=n.initializer.getText(ast);
 if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useGlobalDeckVoice')for(const p of n.arguments[0].properties)if(p.name)voice[p.name.getText(ast)]=p.initializer?.getText(ast);
 ts.forEachChild(n,visit);
}visit(ast);
const expression=(code,env)=>{const module={exports:undefined};vm.runInNewContext(ts.transpileModule('module.exports=('+code+');',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{...env,module});return module.exports;};
let checks=0;
for(const [start,command,want] of [[null,'next','pane-A'],['pane-A','next','pane-B'],[null,'go to Target','pane-B']]){
 const h=harness();await h.flush();h.context.key=start;h.context.labels=[{key:'pane-A',label:'API'},{key:'pane-B',label:'Target'}];h.render();
 let state={selected:start,present:['pane-A','pane-B']},locked=false;
 const captureTargetLock={current:false},inboxRef={current:inbox.emptyVoiceDraftInbox()};
 const env={...inbox,...project,voice:h.api,unaccepted:undefined,suppressDraftSheet:{current:false},captureId:{current:undefined},captureTargetLock,inboxRef,mounted:{current:true},setCaptureTargetLocked:v=>{locked=v;},publishInbox:v=>{inboxRef.current=v;},
  deckRef:{current:state},deck:state,canSelectNow:()=>true,layout:{items:['pane-A','pane-B']},projects:[],focus:project.emptyFocus(),setFocus(){},inventory:{agents:[]},
  setDeck:fn=>{state=fn(state);env.deckRef.current=state;h.context.key=state.selected;},};
 env.canChangeTarget=expression(functions.canChangeTarget,env);env.choose=expression(functions.choose,env);env.pick=expression(functions.pick,env);
 h.update({onCaptureStart:expression(voice.onCaptureStart,env),onCaptureFinished:expression(voice.onCaptureFinished,env),onNavigate:expression(voice.onNavigate,env)});h.finalText=command;
 h.api.pressIn();h.clock=10;h.api.pressOut();await h.flush();assert.equal(locked,true);checks++;
 h.api.pressIn();h.api.pressOut();await h.flush();
 assert.equal(state.selected,want,'actual hook must release the actual Home lock before executing final navigation');checks++;
 assert.equal(locked,false);assert.equal(captureTargetLock.current,false);checks+=2;
 assert.equal(h.api.isCapturing(),false);assert.equal(h.drafts.length,0);checks+=2;h.unmount();
}
console.log(`PASS: ${checks} joined global hook and DeckHome navigation/owner assertions (controlled native ports)`);
