import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
let current;
const equalDeps=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
class Engine{
 constructor(fn){this.fn=fn;this.hooks=[];this.dirty=true;this.effects=[];}
 render(){if(!this.dirty)return;this.dirty=false;this.at=0;current=this;this.tree=this.fn();current=undefined;for(const run of this.effects.splice(0))run();}
 dispose(){for(const cell of this.hooks)cell?.cleanup?.();}
}
const react={
 useState(initial){const e=current,i=e.at++,cell=e.hooks[i]??(e.hooks[i]={value:typeof initial==='function'?initial():initial});return[cell.value,next=>{const value=typeof next==='function'?next(cell.value):next;if(!Object.is(value,cell.value)){cell.value=value;e.dirty=true;}}];},
 useRef(initial){const e=current,i=e.at++;return e.hooks[i]??(e.hooks[i]={current:initial});},
 useEffect(fn,deps){const e=current,i=e.at++,old=e.hooks[i];if(!old||!equalDeps(old.deps,deps)){const cell={deps,cleanup:old?.cleanup};e.hooks[i]=cell;e.effects.push(()=>{cell.cleanup?.();cell.cleanup=fn();});}},
 useSyncExternalStore(subscribe,get){const e=current,i=e.at++;if(!e.hooks[i])e.hooks[i]={cleanup:subscribe(()=>{e.dirty=true;})};return get();},
};
const jsx=(type,props)=>({type,props:props??{}});
// Actual TSX with fake hooks/native events; adapters below are the domain-build artifacts.
// No mounted React, device speech, native storage, host, or external service is exercised.
function loadSettings(deps){
 const file='../src/ui/deck/reply-speech-settings.tsx',module={exports:{}};
 const source=readFileSync(new URL(file,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:id=>id==='./sheet-controls'?{SheetButton:'Pressable',SheetText:'Text',LCD:'View',useSheetSkin:()=>false}:Object.hasOwn(deps,id)?deps[id]:require(id),Date,setTimeout,clearTimeout});
 return module.exports;
}
const {createReplySpeechPreferences}=require('../.test-build/src/adapters/reply-speech-preferences.js');
const {createAudioArbiter}=require('../.test-build/src/adapters/audio-arbiter.js');
const {createNativeSpeech}=require('../.test-build/src/adapters/native-speech.js');
const {en}=require('../.test-build/src/i18n/en.js'),{ko}=require('../.test-build/src/i18n/ko.js');
const tick=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
const walk=node=>Array.isArray(node)?node.flatMap(walk):node?.props?[node,...walk(node.props.children)]:[];
function environment({locale='en',raw=null,failRead=false,heldRead=false}={}){
 const sets=[],calls=[],listeners=new Set(),stateListeners=new Set();let readResolve,stopConfirmed=true,nativeReady=true,stops=0,readFailed=failRead;
 const storage={async get(){if(heldRead)await new Promise(resolve=>{readResolve=resolve;});if(readFailed)throw Error('synthetic');return raw;},async set(key,value){sets.push({key,value});raw=value;},async remove(){throw Error('unexpected remove');}};
 const prefs=createReplySpeechPreferences(storage),arbiter=createAudioArbiter();
 const module={async prepare(){return{ready:nativeReady};},async speak(id,text,language,rate){calls.push({id,text,language,rate});return{accepted:true};},async stop(){stops++;return stopConfirmed;},addListener(_,cb){listeners.add(cb);return{remove(){listeners.delete(cb);}};}};
 let serial=0;const speech=createNativeSpeech(()=>module,arbiter,()=>`synthetic-${++serial}`);
 const AppState={currentState:'active',addEventListener(_,cb){stateListeners.add(cb);return{remove(){stateListeners.delete(cb);}};}};
 const t=(key,params={})=>Object.entries(params).reduce((text,[k,v])=>text.replaceAll('{'+k+'}',String(v)),(locale.startsWith('ko')?ko:en)[key]);
 const {ReplySpeechSettings}=loadSettings({'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{View:'View',Text:'Text',Pressable:'Pressable',AppState},'../../adapters/reply-speech-preferences':{replySpeechPreferences:prefs},'../../adapters/native-speech':{createNativeSpeech:()=>speech},'../../adapters/audio-arbiter':{audioArbiter:arbiter},'../../i18n/provider':{useMessages:()=>({t,locale})},'../theme':{S:{}},'../../i18n/en':{en},'../../i18n/ko':{ko}});
 const engine=new Engine(ReplySpeechSettings);
 const nodes=()=>walk(engine.tree),button=key=>nodes().find(n=>n.type==='Pressable'&&(n.props.accessibilityLabel===t(key)||n.props.children?.props.children===t(key)));
 const flush=async()=>{for(let i=0;i<30;i++){engine.render();await Promise.resolve();}engine.render();};
 const finish=reason=>{for(const listener of [...listeners])listener({id:calls.at(-1)?.id,reason});};
 return{engine,prefs,arbiter,speech,sets,calls,nodes,button,t,flush,finish,stops:()=>stops,resolveRead(){heldRead=false;readResolve();},failRead(v){readFailed=v;},stop(v){stopConfirmed=v;},ready(v){nativeReady=v;},state(v){AppState.currentState=v;for(const fn of stateListeners)fn(v);},dispose:()=>engine.dispose()};
}
(async()=>{
 // Actual JSX keeps initial playback blocked, supports immediate-off during read, and preserves rate.
 {
  const e=environment({heldRead:true,raw:JSON.stringify({enabled:true,rate:1.5})});e.engine.render();await tick();
  assert.equal(e.button('set.ttsPreview').props.disabled,true);
  e.button('set.ttsTitle').props.onPress();assert.equal(e.prefs.getSnapshot().enabled,false);
  e.resolveRead();await e.flush();assert.equal(e.prefs.getSnapshot().phase,'ready');assert.equal(e.prefs.getSnapshot().rate,1.5);
  assert.deepEqual(JSON.parse(e.sets.at(-1).value),{enabled:false,rate:1.5});e.dispose();
 }
 // Same-render rapid increment and accessibility actions use latest rate; bounds remain exact.
 {
  const e=environment();await e.flush();const faster=e.button('set.ttsFaster');faster.props.onPress();faster.props.onPress();assert.equal(e.prefs.getSnapshot().rate,1.5);await e.flush();
  const adjustable=e.nodes().find(n=>n.props.accessibilityRole==='adjustable');assert.equal(adjustable.props.accessibilityValue.now,1.5);assert.equal(adjustable.props.accessible,true,'adjustable rate must be an accessibility focus target');
  adjustable.props.onAccessibilityAction({nativeEvent:{actionName:'increment'}});adjustable.props.onAccessibilityAction({nativeEvent:{actionName:'increment'}});adjustable.props.onAccessibilityAction({nativeEvent:{actionName:'increment'}});await e.flush();assert.equal(e.prefs.getSnapshot().rate,2);assert.equal(e.button('set.ttsFaster').props.disabled,true);e.dispose();
 }
 // Actual NativeSpeech + arbiter submits one built-in sample (not pack text) at current rate.
 for(const locale of ['en','ko']){
  const e=environment({locale,raw:JSON.stringify({enabled:false,rate:1.75})});await e.flush();const preview=e.button('set.ttsPreview');assert.equal(preview.props.disabled,false);preview.props.onPress();preview.props.onPress();await e.flush();assert.equal(e.calls.length,1);
  assert.equal(e.calls[0].text,(locale==='ko'?ko:en)['set.ttsSample']);assert.equal(e.calls[0].language,locale==='ko'?'ko-KR':'en-US');assert.equal(e.calls[0].rate,1.75);assert.equal(e.arbiter.getSnapshot().kind,'speech');
  e.finish('finished');await e.flush();assert.equal(e.arbiter.getSnapshot().kind,null);assert.ok(e.nodes().some(n=>n.props.children===e.t('set.ttsPreviewFinished')));assert.equal(e.sets.length,0);e.dispose();
 }
 // Mic ownership suppresses preview; background cancellation does not fabricate lease release.
 {
  const e=environment();await e.flush();const lease=e.arbiter.acquire('mic');await e.flush();const button=e.button('set.ttsPreview');assert.equal(button.props.disabled,true);button.props.onPress();await e.flush();assert.equal(e.calls.length,0);e.arbiter.release(lease);
  await e.flush();e.button('set.ttsPreview').props.onPress();await e.flush();e.stop(false);e.state('inactive');await e.flush();assert.equal(e.stops(),1);assert.equal(e.speech.getSnapshot().phase,'uncertain');assert.equal(e.arbiter.getSnapshot().kind,'speech');assert.equal(e.button('set.ttsPreview').props.disabled,true);assert.ok(e.nodes().some(n=>n.props.children===e.t('set.ttsPreviewUncertain')));
  e.state('active');e.button('set.ttsPreview').props.onPress();await e.flush();assert.equal(e.calls.length,1);e.dispose();assert.equal(e.arbiter.getSnapshot().kind,'speech');e.finish('stopped');await tick();assert.equal(e.arbiter.getSnapshot().kind,null);
 }
 // Unmount and explicit stop cancel playback with confirmed native teardown.
 for(const mode of ['unmount','stop','background']){
  const e=environment();await e.flush();e.button('set.ttsPreview').props.onPress();await e.flush();
  if(mode==='unmount')e.dispose();else if(mode==='stop')e.button('set.ttsPreviewStop').props.onPress();else e.state('background');await e.flush();assert.equal(e.stops(),1);assert.equal(e.arbiter.getSnapshot().kind,null);if(mode!=='unmount'){assert.ok(e.nodes().some(n=>n.props.children===e.t('set.ttsPreviewStopped')));e.dispose();}
 }
 // A failed read blocks playback and offers retry; native unavailable is shown locally.
 {
  const e=environment({failRead:true});await e.flush();assert.equal(e.button('set.ttsPreview').props.disabled,true);assert.ok(e.nodes().some(n=>n.props.children===e.t('set.ttsBlocked')));e.failRead(false);e.button('set.ttsRetry').props.onPress();await e.flush();e.ready(false);e.button('set.ttsPreview').props.onPress();await e.flush();assert.equal(e.calls.length,0);assert.ok(e.nodes().some(n=>n.props.children===e.t('set.ttsPreviewUnavailable')));assert.equal(e.sets.length,0);e.dispose();
 }
 console.log('PASS actual settings JSX + actual NativeSpeech/arbiter: loading/off, rapid rate/a11y, built-in samples, duplicate prevention, mic exclusion, background/unmount/stop, uncertain lease, retry/unavailable');
})().catch(error=>{console.error(error);process.exitCode=1;});
