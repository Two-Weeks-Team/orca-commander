import {renderer} from './helpers/deck-sheet-render.mjs';
const recording=renderer().load('src/ui/deck/recording-display.tsx');
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);let clock=0;
function load(file,deps={}){
 const module={exports:{}},source=readFileSync(new URL(file,import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:id=>id in deps?deps[id]:require(id),Date:class extends Date{static now(){return clock;}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});return module.exports;
}
const effects=[];let appStateChanged;
const hooks={useState:v=>[typeof v==='function'?v():v,()=>{}],useRef:v=>({current:v}),useEffect:fn=>effects.push(fn)};
class Value{setValue(){}interpolate(){return 0;}}
const native={Platform:{OS:'ios',isPad:false},View:'view',Pressable:'pressable',Animated:{Value,View:'animated-view'},AccessibilityInfo:{addEventListener:()=>({remove(){}}),isScreenReaderEnabled:async()=>false},AppState:{currentState:'active',addEventListener:(_event,fn)=>{appStateChanged=fn;return{remove(){}};}},Easing:{},StyleSheet:{absoluteFill:{},create:x=>x,flatten:x=>x}};
const manifest=JSON.parse(readFileSync(new URL('../assets/deck/manifest.json',import.meta.url),'utf8'));
const assets={deckBase:'base',deckIcons:{monitor:'monitor'},deckSprites:{},deckManifest:manifest,wideDeckBase:'wide',wideDeckSprites:{},wideDeckManifest:manifest};
const messages=require('../.test-build/src/i18n/messages.js');
const marks=load('../src/ui/deck/state-mark.tsx',{'react-native':native,react:hooks,'expo-image':{Image:'image'},'./deck-assets':assets,'./deck-text':{DeckText:'deck-text'}});
const {DeckScreen}=load('../src/ui/deck/DeckScreen.tsx',{'./recording-display':recording,react:hooks,'react-native':native,'expo-image':{Image:'image'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({left:0,right:0,top:0,bottom:0})},'../../i18n/provider':{useMessages:()=>({t:messages.createTranslator('ko'),locale:'ko'})},'../../adapters/deck-feedback':{deckClick(){}},'./deck-assets':assets,'./DeckSkin':{DeckSkin:'skin'},'../deck-fonts':{DECK_NUMERAL_FONT:'test'},'./deck-text':{DeckText:'deck-text'},'./state-mark':{...marks,useReduceMotion:()=>true},'../../core/phrase-command':require('../.test-build/src/core/phrase-command.js'),'../../core/deck-surface-swipe':require('../.test-build/src/core/deck-surface-swipe.js'),'../../core/deck-display-cache':require('../.test-build/src/core/deck-display-cache.js'),'../../adapters/usage':require('../.test-build/src/adapters/usage.js'),'../../core/agent-display':require('../.test-build/src/core/agent-display.js'),'./deck-layout':require('../.test-build/src/ui/deck/deck-layout.js')});
const model=require('../.test-build/src/core/deck-model.js'),now=1793894400000;
const agent={id:'owned',provider:'codex',title:'Owned trial',state:'idle',updatedAt:new Date(now).toISOString(),target:{hostId:'owned',worktreeId:'w',terminalId:'tab:leaf',connectionGeneration:1}};
const input={agents:[agent],live:true,generation:1,confirmedAt:now,complete:true,scopeIdentity:'owned',uncertaintyKnown:true,unresolvedPanes:new Set(),unresolvedCount:0};
const state={...model.reconcileDeck(model.emptyDeckState(),input,now),selected:model.bindKey(agent)};
const view=model.deriveDeckView(state,{...input,now,link:'LIVE',journalReady:true,busy:false,caps:{input:true,approve:false,speech:false}});
const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):tree?.props?[tree,...nodes(tree.props.children)]:[];
let confirms=0,edits=0,attention=0;
const props={frame:{width:390,height:844},view,phrase:{name:'계속',text:'이어서 계속 진행하세요'},phraseScope:'owned-target',phraseReady:true,onPhraseConfirm:()=>confirms++,onPhraseEdit:()=>edits++,onAttention:()=>attention++,canNavigate:()=>true};
const button=nodes(DeckScreen(props)).find(n=>n.props.testID==='deck-command-4');assert.ok(button);
const cleanups=effects.splice(0).map(fn=>fn());
assert.equal(button.props.accessibilityLabel,'계속: 이어서 계속 진행하세요');
assert.equal(button.props.accessibilityHint,'길게 3초 누르면 문구를 바꿉니다');
assert.equal(button.props.accessibilityState.disabled,false);
assert.equal(JSON.stringify(button).includes('다음 판단'),false);
clock=0;button.props.onPressIn();clock=2999;button.props.onPressOut();button.props.onPress();assert.equal(confirms,1);assert.equal(edits,0);assert.equal(attention,0);
clock=4000;button.props.onPressIn();clock=7000;button.props.onLongPress();button.props.onPressOut();button.props.onPress();assert.equal(edits,1);assert.equal(confirms,1,'long press never falls through to confirmation');
clock=8000;button.props.onPressIn();appStateChanged('background');clock=8100;button.props.onPressOut();button.props.onPress();assert.equal(confirms,1,'background cancels the captured press');appStateChanged('active');
clock=9000;button.props.onPressIn();props.phraseScope='changed-target';clock=9100;button.props.onPressOut();button.props.onPress();assert.equal(confirms,1,'selection changes cannot substitute the current target');props.phraseScope='owned-target';
button.props.onPressIn();button.props.onTouchCancel();button.props.onPressOut();button.props.onPress();assert.equal(confirms,1);
button.props.onPressIn();view.commands.input=false;button.props.onPressOut();button.props.onPress();assert.equal(confirms,1,'the input gate is checked again on release');view.commands.input=true;
button.props.onAccessibilityAction({nativeEvent:{actionName:'edit'}});assert.equal(edits,2);assert.equal(confirms,1);
for(const cleanup of cleanups)cleanup?.();
for(const frame of [{width:390,height:844},{width:821,height:1088},{width:555,height:876},{width:876,height:555},{width:1194,height:834}]){
 const node=nodes(DeckScreen({...props,frame,phrase:{name:'다음',text:'Saved message'}})).find(n=>n.props.testID==='deck-command-4');
 assert.equal(node.props.accessibilityLabel,'다음: Saved message');assert.equal(node.props.delayLongPress,3000);
 assert.equal(nodes(node).some(n=>typeof n.props.children==='string'&&/^\d+$/.test(n.props.children)),false,'the replaced command has no numeric badge');
}
console.log('PASS actual DeckScreen continue command: short/long, cancel/background/target/gate revalidation, accessibility edit, and all five face routes');
{
 const waiting={...props,claudePrompt:{kind:'permission',enabled:true},onAllow:()=>{},onReject:()=>{},view:{...view,commands:{...view.commands,input:true,allow:false,reject:false}}};
 const tree=nodes(DeckScreen(waiting)),answer=tree.find(n=>n.props.testID==='deck-command-0'),cancel=tree.find(n=>n.props.testID==='deck-command-1');
 assert.equal(answer.props.accessibilityLabel,'답하기','D27: terminal Claude waiting replaces Allow with Answer');assert.equal(cancel.props.accessibilityLabel,'취소');assert.equal(answer.props.disabled,false);
 assert.equal(tree.find(n=>n.props.testID==='deck-command-3').props.disabled,true);assert.equal(tree.find(n=>n.props.testID==='deck-command-4').props.disabled,true);
 const stale=nodes(DeckScreen({...waiting,claudePrompt:{kind:'permission',enabled:false}}));assert.equal(stale.find(n=>n.props.testID==='deck-command-0').props.disabled,true);
}
