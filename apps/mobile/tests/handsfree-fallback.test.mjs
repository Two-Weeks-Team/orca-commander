import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const {createVoiceConfirmation}=require('../.test-build/src/core/voice-confirmation.js');
const {createConfirmationGesture}=require('../.test-build/src/core/confirmation-gesture.js');
const {createTranslator}=require('../.test-build/src/i18n/messages.js');
const jsx=(type,props,key)=>({type,key,props:props??{}});
function load(file,deps,globals={}){
 const module={exports:{}};
 const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:id=>Object.hasOwn(deps,id)?deps[id]:require(id),Date,setTimeout,clearTimeout,performance,...globals});
 return module.exports;
}
function harness(outcome,options={}){
 let at=0,dirty=false,mounted=true,props,api,appListener,answerPhase,answerDone,clock=0;const intervals=new Set();
 const cells=[],effects=[],queued=[],counts={speak:0,listen:0,confirm:0,cancel:0};
 const react={
  useState(initial){const i=at++,cell=cells[i]??(cells[i]={value:typeof initial==='function'?initial():initial});return[cell.value,next=>{cell.value=next;dirty=true;}];},
  useRef(initial){const i=at++;return cells[i]??(cells[i]={current:initial});},
  useEffect(fn,deps){const i=at++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))queued.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()};});},
 };
 const AppState={currentState:'active',addEventListener(_,fn){appListener=fn;return{remove(){}};}};
 const speech={async speak(){counts.speak++;if(outcome==='throw')throw Error('synthetic playback');return outcome;},cancel(){}};
 const answer={async listen(onPhase){counts.listen++;answerPhase=onPhase;if(options.deferredAnswer)return new Promise(resolve=>{answerDone=resolve;});return{kind:'timeout'};},cancel(){}};
 const {useHandsfreePrompt}=load('../src/ui/use-handsfree-prompt.ts',{
  react,'react-native':{AppState},'expo-crypto':{randomUUID:()=> 'synthetic'},
  '../adapters/host-dictation':{HostDictation:class{}},'../adapters/native-microphone':{createNativeMicrophone:()=>({})},
  '../adapters/native-speech':{createNativeSpeech:()=>speech},'../adapters/scoped-voice-answer':{createScopedVoiceAnswer:()=>answer},
  '../core/voice-confirmation':{createVoiceConfirmation},
 },{performance:{now:()=>clock},setInterval:fn=>{intervals.add(fn);return fn;},clearInterval:fn=>intervals.delete(fn)});
 props={confirmation:{id:'first'},prompt:'synthetic prompt',locale:'ko',session:{},isCurrent:()=>true,onConfirm:async()=>{counts.confirm++;},onCancel:()=>{counts.cancel++;}};
 const render=()=>{at=0;dirty=false;api=useHandsfreePrompt(props);while(queued.length)queued.shift()();};
 const flush=async()=>{for(let i=0;i<30;i++){await Promise.resolve();if(dirty&&mounted)render();}};
 return{counts,answerPhase:next=>answerPhase?.(next),finishAnswer:answer=>answerDone?.(answer),advance:ms=>{clock+=ms;for(const fn of [...intervals])fn();},get api(){return api;},render,flush,update(patch){props={...props,...patch};render();},background(){AppState.currentState='background';appListener('background');},dispose(){mounted=false;for(const e of effects)e?.cleanup?.();}};
}
for(const outcome of ['unavailable','interrupted','uncertain','throw']){
 const h=harness(outcome);h.render();await h.flush();
 assert.equal(h.api.playbackUnavailable,true);assert.equal(h.api.phase,'idle');
 assert.deepEqual(h.counts,{speak:1,listen:0,confirm:0,cancel:0},'failed playback retains manual confirmation without listening, sending or canceling');
 h.render();await h.flush();assert.equal(h.counts.speak,1,'no automatic playback retry');
 h.update({confirmation:undefined});assert.equal(h.api.playbackUnavailable,false,'notice is scoped to the exact open confirmation');
 h.dispose();
}
{
 const h=harness('unavailable');h.render();h.update({isCurrent:()=>false});await h.flush();
 assert.equal(h.api.playbackUnavailable,false);assert.equal(h.counts.confirm,0);h.dispose();
}
{
 const h=harness('finished');h.render();await h.flush();assert.equal(h.api.playbackUnavailable,false);assert.equal(h.counts.listen,1);assert.equal(h.counts.cancel,1,'genuine no-answer retains the original no-send behavior');h.dispose();
}
{
 const h=harness('finished',{deferredAnswer:true});h.render();await h.flush();
 assert.equal(h.api.phase,'preparing');assert.equal(h.api.listeningRemainingMs,3500);
 h.advance(2000);await h.flush();assert.equal(h.api.listeningRemainingMs,3500,'preparation cannot consume the 3.5-second listening countdown');
 h.answerPhase('recording');await h.flush();assert.equal(h.api.phase,'listening');
 h.advance(1000);await h.flush();assert.equal(h.api.listeningRemainingMs,2500,'countdown starts on the actual recording observation');
 h.answerPhase('finishing');await h.flush();assert.equal(h.api.phase,'transcribing');
 h.advance(2000);await h.flush();assert.equal(h.api.listeningRemainingMs,2500,'final transcription cannot keep decrementing listening time');
 h.finishAnswer({kind:'timeout'});await h.flush();assert.equal(h.api.phase,'idle');assert.equal(h.counts.confirm,0);h.dispose();
}
const walk=node=>Array.isArray(node)?node.flatMap(walk):node?.props?[node,...walk(node.props.children)]:[];
for(const locale of ['ko','en']){
 const t=createTranslator(locale),deps={react:{useState:initial=>[initial,()=>{}]},'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':Object.fromEntries(['Text','View','Modal','ScrollView','Pressable'].map(x=>[x,x])),
  '../i18n/provider':{useMessages:()=>({t,locale,presentationRevision:1})},'./theme':{S:{}},'./confirmation-panel':{ConfirmPanel:'ConfirmPanel'}};
 const theme=load('../src/ui/theme.tsx',{'react-native':{StyleSheet:{create:value=>value}},'./deck-fonts':{DECK_NUMERAL_FONT:'BarlowCondensed-Bold'},'react/jsx-runtime':{jsx,jsxs:jsx}});deps['./theme']=theme;
 const {PromptConfirmationDialog}=load('../src/ui/prompt-confirmation.tsx',deps);
 const ticket={preparedAt:Date.now(),title:'Full target',text:'Full body\nSecond line',hostId:'host',worktreeId:'worktree',paneKey:'tab:leaf',generation:1,handle:'handle',incarnationId:'incarnation'};
 let confirmed=0,canceled=0;const props={confirmation:ticket,disabled:false,onConfirm:()=>confirmed++,onCancel:()=>canceled++};
 const before=PromptConfirmationDialog(props),after=PromptConfirmationDialog({...props,voicePromptUnavailable:true});
 assert.equal(after.props.scopeKey,before.props.scopeKey,'notice cannot rearm the ticket or extend its deadline');
 assert.equal(after.props.preparedAt,ticket.preparedAt);assert.equal(walk(after.props.content).find(n=>n.props.testID==='deck-confirm-full-body').props.children,ticket.text);
 assert.equal(after.props.beforeConfirmNotice,t('voice.promptUnavailable'));
 const panelReact={useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useRef:current=>({current}),useEffect(){}};
 const {ConfirmPanel}=load('../src/ui/confirmation-panel.tsx',{...deps,react:panelReact,'react-native':{...deps['react-native'],AppState:{currentState:'active'}},'react-native-safe-area-context':{SafeAreaProvider:'SafeAreaProvider',SafeAreaView:'SafeAreaView'},'../core/confirmation-gesture':{createConfirmationGesture}});
 const a=ConfirmPanel(before.props),b=ConfirmPanel(after.props);assert.equal(a.key,b.key,'notice does not remount the gesture');
 const rendered=b.type(b.props),nodes=walk(rendered),notice=nodes.find(n=>n.props.testID==='deck-confirm-playback-unavailable'),hold=nodes.find(n=>n.props.testID==='deck-confirm-send');
 assert.equal(notice.props.children,t('voice.promptUnavailable'));assert.ok(hold);
 const footer=nodes.find(n=>n.props.style===theme.CS.footer);
 const siblings=walk(footer.props.children),actions=nodes.find(n=>n.props.style===theme.CS.actions);assert.ok(siblings.indexOf(notice)<siblings.indexOf(actions),'notice is directly above the horizontal cancel/hold row in the modal footer');assert.ok(walk(actions).includes(hold));
 assert.ok(nodes.some(n=>n.props.testID==='deck-confirm-cancel'));
 after.props.onConfirm();after.props.onCancel();assert.equal(confirmed,1);assert.equal(canceled,1);
}
console.log('PASS actual handsfree hook and confirmation JSX: playback failure retains exact manual dialog, scoped notice immediately above hold, full body/cancel, no retry, stale/no-answer guards (synthetic native ports)');
