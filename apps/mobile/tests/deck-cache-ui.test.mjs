import {renderer} from './helpers/deck-sheet-render.mjs';
const recording=renderer().load('src/ui/deck/recording-display.tsx');
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url),now=Date.now();
function load(file,deps={}){
 const module={exports:{}},source=readFileSync(new URL(file,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:id=>id in deps?deps[id]:require(id),Date,setTimeout,clearTimeout});return module.exports;
}
const hooks={useState:v=>[typeof v==='function'?v():v,()=>{}],useRef:v=>({current:v}),useEffect:()=>{}};
class Value{setValue(){}interpolate(){return 0;}}
const native={Platform:{OS:'ios',isPad:false},Text:'text',View:'view',Pressable:'pressable',Animated:{Value,View:'animated-view'},AccessibilityInfo:{},Easing:{},StyleSheet:{absoluteFill:{},create:x=>x,flatten:x=>x}};
const manifest=JSON.parse(readFileSync(new URL('../assets/deck/manifest.json',import.meta.url),'utf8'));
const assets={deckBase:'base',deckIcons:{monitor:'monitor'},deckSprites:{},deckManifest:manifest,wideDeckBase:'wide',wideDeckSprites:{},wideDeckManifest:manifest,approvedInnerBase:'approved-inner',approvedCoverBase:'approved-cover'};
const messages=require('../.test-build/src/i18n/messages.js');
const marks=load('../src/ui/deck/state-mark.tsx',{'react-native':native,react:hooks,'expo-image':{Image:'image'},'./deck-assets':assets,'./deck-text':{DeckText:'deck-text'}});
const {DeckScreen}=load('../src/ui/deck/DeckScreen.tsx',{'./recording-display':recording,
 react:hooks,'react-native':native,'expo-image':{Image:'image'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({left:0,right:0,top:0,bottom:0})},
 '../../i18n/provider':{useMessages:()=>({t:messages.createTranslator('en'),locale:'en'})},'../../adapters/deck-feedback':{deckClick:()=>{}},'./deck-assets':assets,'./DeckSkin':{DeckSkin:'responsive-skin'},'../deck-fonts':{DECK_NUMERAL_FONT:'test'},'./deck-text':{DeckText:'deck-text'},'./state-mark':{...marks,useReduceMotion:()=>true},
 '../../core/phrase-command':require('../.test-build/src/core/phrase-command.js'),'../../core/deck-surface-swipe':require('../.test-build/src/core/deck-surface-swipe.js'),
 '../../core/deck-display-cache':require('../.test-build/src/core/deck-display-cache.js'),'../../adapters/usage':require('../.test-build/src/adapters/usage.js'),'../../core/agent-display':require('../.test-build/src/core/agent-display.js'),'./deck-layout':require('../.test-build/src/ui/deck/deck-layout.js'),
});
const {captureDisplayCache}=require('../.test-build/src/core/deck-display-cache.js');
const {emptyDeckState,reconcileDeck,deriveDeckView,bindKey}=require('../.test-build/src/core/deck-model.js');
const a={id:'tab',provider:'claude',title:'Fresh conversation',summary:'',state:'working',eventType:'informational',updatedAt:new Date(now).toISOString(),target:{hostId:'fixture',worktreeId:'workspace',terminalId:'tab:leaf',connectionGeneration:1}};
const key=bindKey(a),input={live:true,generation:1,confirmedAt:now,agents:[a],complete:true,scopeIdentity:'fixture',uncertaintyKnown:true,unresolvedPanes:new Set(),unresolvedCount:0};
const state={...reconcileDeck(emptyDeckState(),input,now),selected:key};
const view=deriveDeckView(state,{...input,now,link:'LIVE',journalReady:true,busy:false,caps:{input:true,approve:true,speech:true}});view.commands.allow=true;view.commands.reject=true;view.commands.nextDecision={lit:true,count:1};
const cache=captureDisplayCache({hostId:'fixture',issuedAt:now-31000,agents:[{...a,title:'Retained conversation'}],keys:[key,null,null,null,null,null],selectedKey:key,partial:false,unresolved:0,focusInfo:{project:'Project',worktree:'Workspace',following:true}},now-31000);assert.ok(cache);
let mutations=0,statusReads=0;
const mutate=()=>mutations++;
const props={frame:{width:390,height:844},view,cachedDisplay:cache,onPressKey:mutate,onStep:mutate,onAttention:mutate,onAllow:mutate,onReject:mutate,onContent:mutate,onInput:mutate,onList:mutate,onExplainKey:mutate,onVoicePressIn:mutate,onVoicePressOut:mutate,onFollow:mutate,onRefreshUsage:mutate,voiceAvailable:true,onStatus:()=>statusReads++,onReconnect:()=>statusReads++,onScan:()=>statusReads++};
const tree=DeckScreen(props),nodes=[];
function walk(v){if(v?.type===recording.RecordingDisplay){walk(v.type(v.props));return;}if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){if(v.props){nodes.push(v);walk(v.props.children);}}}walk(tree);
const serialized=JSON.stringify(tree);
assert.ok(serialized.includes('Retained conversation'),'the cached face keeps the last title while controls are locked');
assert.ok(serialized.includes('Refreshing'),'a visible cache must identify the refresh age, not claim a new live snapshot');
const cachedStatus=nodes.find(n=>n.props.testID==='deck-status');
assert.equal(cachedStatus.props.accessibilityLabel.includes(messages.createTranslator('en')('focus.following')),false,'cached LCD cannot announce current desktop following');
const monitor=nodes.find(n=>n.props.source==='monitor');
assert.ok(monitor,'the following preference remains visible on the cached LCD');
assert.equal(monitor.props.tintColor,'#5F7A70','unknown cached focus dims the following monitor');
const dial=nodes.find(n=>n.props.testID==='deck-dial');assert.ok(dial);
assert.equal(dial.props.accessibilityState?.disabled,true,'a cached dial must not inherit a fresh attention queue');
dial.props.onAccessibilityAction?.({nativeEvent:{actionName:'increment'}});
dial.props.onResponderGrant?.({nativeEvent:{pageX:100,pageY:200}});
dial.props.onResponderMove?.({nativeEvent:{pageX:150,pageY:200}});
dial.props.onResponderRelease?.({nativeEvent:{pageX:150,pageY:200}});
for(const n of nodes){
 if(n.props.testID?.startsWith('deck-key-')||n.props.testID?.startsWith('deck-command-')){
  assert.equal(n.props.accessibilityState?.disabled,true,'cached keys and commands never inherit live authority');
  n.props.onPress?.();n.props.onLongPress?.();
 }
}
const status=nodes.find(n=>n.props.testID==='deck-status');assert.ok(status);
status.props.onResponderGrant?.({nativeEvent:{pageX:200,pageY:100}});
status.props.onResponderRelease?.({nativeEvent:{pageX:100,pageY:100}});
assert.equal(mutations,0,'neither cached keys nor cached surface gestures can select or send');
status.props.onAccessibilityAction?.({nativeEvent:{actionName:'activate'}});
assert.equal(statusReads,1,'read-only status remains reachable');
const expiredTree=DeckScreen({...props,cachedDisplay:{...cache,issuedAt:now-180001}});
assert.equal(JSON.stringify(expiredTree).includes('Retained conversation'),false,'expired metadata cannot replace a fresh authoritative face');
console.log('PASS: cached native face retains metadata and refresh age; keys/commands/gestures carry no live authority (actual JSX, no device)');

const {DeckList}=load('../src/ui/deck/DeckList.tsx',{
 react:hooks,'react-native':{...native,ScrollView:'scroll'},'react-native-safe-area-context':{SafeAreaView:'safe'},'expo-image':{Image:'image'},
 '../../i18n/provider':{useMessages:()=>({t:messages.createTranslator('en'),locale:'en'})},'../../adapters/deck-feedback':{deckClick:()=>{}},
 '../../core/deck-display-cache':require('../.test-build/src/core/deck-display-cache.js'),'../../core/agent-display':require('../.test-build/src/core/agent-display.js'),
 '../theme':{stateName:s=>s},'../decision-card-model':{filterAgents:rows=>rows},'./ListSearch':{ListSearch:'search'},'./deck-layout':require('../.test-build/src/ui/deck/deck-layout.js'),'./state-mark':marks,
});
const cachedList=DeckList({...props,rows:[],selectedKey:null,onSelect:mutate,screenReader:false,children:null});
assert.ok(JSON.stringify(cachedList).includes('Retained conversation'),'List also retains targetless metadata when the live rows are empty');
assert.ok(JSON.stringify(cachedList).includes('deck-list-cached'));
const before=mutations;nodes.length=0;walk(cachedList);for(const n of nodes)if(n.type==='pressable')n.props.onPress?.();assert.equal(mutations,before,'cached List offers only status/reconnect reads, no selection or action callbacks');
console.log('PASS: cached List preserves flowing text and status/reconnect without constructing action targets (actual JSX)');

const freshUnselected={...view,display:{...view.display,agent:null,name:null,position:null},commands:{...view.commands,allow:false,reject:false,input:false,content:false}};
const pendingTree=DeckScreen({...props,cachedDisplay:undefined,cachedLcdDisplay:cache,view:freshUnselected});
nodes.length=0;walk(pendingTree);
assert.ok(JSON.stringify(pendingTree).includes('Retained conversation'),'fresh keys must not blank the cached LCD while desktop selection settles');
const freshKey=nodes.find(n=>n.props.testID==='deck-key-1');assert.equal(freshKey.props.accessibilityState.disabled,false,'missing optional focus cannot lock fresh keys');
const pendingBefore=mutations;freshKey.props.onPress();assert.equal(mutations,pendingBefore+1,'fresh key callbacks remain available');
const pendingLcdNode=nodes.find(n=>n.props.testID==='deck-status');
pendingLcdNode.props.onResponderGrant({nativeEvent:{pageX:200,pageY:100}});pendingLcdNode.props.onResponderRelease({nativeEvent:{pageX:100,pageY:100}});
assert.equal(mutations,pendingBefore+1,'retained LCD metadata cannot authorize gesture selection');
for(const id of ['deck-command-0','deck-command-1','deck-command-2','deck-command-3'])assert.equal(nodes.find(n=>n.props.testID===id).props.accessibilityState.disabled,true,'selection-dependent commands stay locked');
console.log('PASS: pending LCD preserves its last label without blocking fresh keys or creating a selection target (actual JSX)');

const freshUsage={observedAt:now,claude:{status:'ok',session:{usedPercent:15,resetsAt:null},weekly:null,fableWeekly:null,updatedAt:now},codex:null};
for(const previousUsage of [undefined,{...freshUsage,claude:{...freshUsage.claude,session:{usedPercent:12,resetsAt:null}}}]){
 const tree=DeckScreen({...props,cachedDisplay:undefined,cachedLcdDisplay:{...cache,usage:previousUsage},view:freshUnselected,usage:freshUsage});
 assert.ok(JSON.stringify(tree).includes('15%'),'pending LCD must use the independently refreshed usage even before a selected target exists');
}

const liveProps={...props,cachedDisplay:undefined};
const liveTree=DeckScreen(liveProps);nodes.length=0;walk(liveTree);
const surface=nodes.find(n=>n.props.testID==='deck-screen');
assert.equal(typeof surface.props.onStartShouldSetResponderCapture,'function','the whole deck must observe touch starts without stealing key taps');

const touch=(x,y=200,id=1)=>({nativeEvent:{identifier:id,pageX:x,pageY:y,touches:[{identifier:id,pageX:x,pageY:y}],changedTouches:[{identifier:id,pageX:x,pageY:y}]}});
const baseMutation=mutations;
assert.equal(surface.props.onStartShouldSetResponderCapture(touch(200)),false);
assert.equal(surface.props.onMoveShouldSetResponderCapture(touch(182)),false,'18dp still belongs to the child');
assert.equal(surface.props.onMoveShouldSetResponderCapture(touch(150)),true);surface.props.onResponderGrant();
surface.props.onResponderRelease(touch(100));surface.props.onResponderRelease(touch(80));assert.equal(mutations,baseMutation+1,'one whole-face release navigates once');
for(const id of ['deck-status','deck-joystick','deck-dial','deck-voice','deck-usage-refresh']){
 surface.props.onStartShouldSetResponderCapture(touch(200));assert.equal(nodes.find(n=>n.props.testID===id).props.onStartShouldSetResponderCapture(touch(200)),false);
 assert.equal(surface.props.onMoveShouldSetResponderCapture(touch(100)),false,'dedicated controls keep ownership: '+id);
}
surface.props.onStartShouldSetResponderCapture(touch(200));nodes.find(n=>n.props.testID==='deck-key-1').props.onLongPress();
assert.equal(surface.props.onMoveShouldSetResponderCapture(touch(100)),false,'an already opened explanation consumes the contact');
surface.props.onStartShouldSetResponderCapture(touch(200));assert.equal(surface.props.onMoveShouldSetResponderCapture(touch(100)),true);surface.props.onResponderReject();
const afterReject=mutations;surface.props.onResponderRelease(touch(80));assert.equal(mutations,afterReject,'a rejected transfer never moves');
console.log('PASS: whole native face captures movement after threshold, excludes dedicated controls and consumes key explanations (actual JSX; RN transfer needs native proof)');

let readFresh=true;liveProps.canNavigate=()=>readFresh;
surface.props.onStartShouldSetResponderCapture(touch(200));assert.equal(surface.props.onMoveShouldSetResponderCapture(touch(100)),true);surface.props.onResponderGrant();readFresh=false;
const beforeStaleRelease=mutations;surface.props.onResponderRelease(touch(80));assert.equal(mutations,beforeStaleRelease,'freshness is rechecked at release between clock renders');
readFresh=true;surface.props.onStartShouldSetResponderCapture(touch(200));surface.props.onMoveShouldSetResponderCapture(touch(100));surface.props.onResponderGrant();liveProps.cachedDisplay=cache;
surface.props.onResponderRelease(touch(80));assert.equal(mutations,beforeStaleRelease,'a cache transition cancels an in-progress parent swipe');
console.log('PASS: native whole-face release rechecks fresh evidence and cache state (actual JSX, synthetic touch delivery)');

liveProps.cachedDisplay=undefined;readFresh=true;
surface.props.onStartShouldSetResponderCapture(touch(200));
const twoTouches=touch(200);twoTouches.nativeEvent.touches.push({identifier:2,pageX:210,pageY:220});
assert.equal(surface.props.onStartShouldSetResponderCapture(twoTouches),true,'a second finger transfers ownership immediately without a move');surface.props.onResponderGrant();
const beforeMulti=mutations;surface.props.onResponderRelease(touch(200));assert.equal(mutations,beforeMulti,'cancel-only contact cannot move after its second finger lifts');
for(const id of ['deck-status','deck-joystick','deck-dial','deck-voice']){surface.props.onStartShouldSetResponderCapture(touch(200));nodes.find(n=>n.props.testID===id).props.onStartShouldSetResponderCapture(touch(200));assert.equal(surface.props.onStartShouldSetResponderCapture(twoTouches),false,'a contact begun on a dedicated control remains with it');surface.props.onTouchEnd({nativeEvent:{touches:[]}});}

const directions=[];
const directionTree=DeckScreen({...props,cachedDisplay:undefined,onStep:direction=>directions.push(direction)});nodes.length=0;walk(directionTree);
const lcdDirection=nodes.find(n=>n.props.testID==='deck-status');
for(const [x,y,want] of [[250,200,'right'],[150,200,'left'],[200,250,'down'],[200,150,'up']]){
 lcdDirection.props.onResponderGrant(touch(200));lcdDirection.props.onResponderMove(touch(x,y));lcdDirection.props.onResponderRelease(touch(x,y));assert.equal(directions.at(-1),want,'LCD swipe follows the joystick direction');
}
console.log('PASS: LCD swipe directions match the joystick and the whole face (actual JSX)');

const flattenStyle=value=>Array.isArray(value)?Object.assign({},...value.map(flattenStyle)):value&&typeof value==='object'?value:{};
for(const [width,height,count,expectedBase] of [[821.3,1088,9,'approved-inner'],[554.7,876.4,6,'approved-cover']]){
 const faceView={...view,keys:Array.from({length:count},(_,i)=>view.keys[i]??{...view.keys[0],index:i+1,slot:i,key:null,agent:null})};
 const tree=DeckScreen({...props,cachedDisplay:undefined,frame:{width,height},view:faceView});nodes.length=0;walk(tree);
 assert.equal(nodes.filter(n=>/^deck-key-\d+$/.test(n.props.testID??'')).length,count);
 const layout=require('../.test-build/src/ui/deck/deck-layout.js').deckLayout(width,height,{top:0,bottom:0,left:0,right:0});
 for(let i=0;i<count;i++){
  const key=nodes.find(n=>n.props.testID==='deck-key-'+(i+1));const style=flattenStyle(key.props.style),rect=layout.agentKeys[i];
  for(const name of ['left','top','width','height'])assert.ok(Math.abs(style[name]-rect[name])<.001,'native key rect shares the approved geometry');
 }
 for(let i=0;i<6;i++){
  const cmd=nodes.find(n=>n.props.testID==='deck-command-'+i),style=flattenStyle(cmd.props.style),rect=layout.commands[i];
  for(const name of ['left','top','width','height'])assert.ok(Math.abs(style[name]-rect[name])<.001,'native command rect shares the approved geometry');
  const labels=[cmd.props.children].flat(Infinity).filter(n=>n&&n.type==='deck-text'&&n.props.numberOfLines!==undefined);assert.ok(labels.length);assert.ok(labels.every(n=>n.props.numberOfLines===1),'every adaptive command label occupies one line');
 }
 const skin=nodes.find(n=>n.type==='responsive-skin');assert.ok(skin,'adaptive faces compose their approved wells instead of stretching a canonical background');for(const name of ['left','top','width','height'])assert.ok(Math.abs(skin.props.layout.status[name]-layout.status[name])<.001,'background LCD consumes the same logical rectangle');
 if(expectedBase==='approved-cover'){
  const voice=nodes.find(n=>n.props.testID==='deck-voice');
  const label=[voice.props.children].flat(Infinity).find(n=>n?.type==='deck-text');
  assert.equal(label.props.numberOfLines,2,'cover PTT wraps instead of escaping its narrow cap');
  assert.equal(label.props.variant,'title','cover PTT retains the readable base size instead of shrinking');
  const style=flattenStyle(label.props.style);
  assert.ok(style.width>0&&style.width<=layout.voice.width*.9,'PTT text is constrained inside the cap');
  assert.ok(style.fontSize>=13,'PTT uses the command-label minimum base size');
 }
}
console.log('PASS: approved A/B1 native target rectangles,9/6 keys and one-line command labels (actual JSX, no device)');

for(const phase of ['starting','recording','finishing','error']){
 const voiceTree=DeckScreen({...props,cachedDisplay:undefined,voiceDisplay:{phase,text:'Synthetic first words',preparing:phase==='recording',level:0.6,error:phase==='error'?'host_failed':undefined}});
 nodes.length=0;walk(voiceTree);
 assert.ok(nodes.find(n=>n.props.testID==='deck-voice-display'),'the actual LCD presents microphone preparation, capture, conversion and error');
 assert.ok(JSON.stringify(voiceTree).includes('Synthetic first words'),'partial text is visible without constructing a target');
 assert.equal(nodes.filter(n=>n.props.testID==='deck-usage-line').length,0,'voice presentation replaces, rather than overlaps, ordinary LCD lines');
 assert.ok(nodes.find(n=>n.props.testID==='deck-voice-level'),'the capture meter fits inside the LCD');
}
const quietVoiceTree=DeckScreen({...props,cachedDisplay:undefined,voiceDisplay:{phase:'draft',text:'Kept editable draft',level:0}});
assert.equal(JSON.stringify(quietVoiceTree).includes('deck-voice-display'),false,'completed voice presentation returns to the ordinary LCD');
const voiceList=DeckList({...props,cachedDisplay:undefined,rows:[],selectedKey:null,onSelect:mutate,screenReader:false,voiceDisplay:{phase:'recording',text:'Synthetic first words',preparing:true,level:0.6}});
assert.ok(JSON.stringify(voiceList).includes('deck-list-voice-display'),'flowing List also presents the same target-free voice state');
console.log('PASS: actual LCD/List show transient voice partials, preparing/conversion/error and bounded volume without overlapping normal LCD content');

const errorCachedList=DeckList({...props,rows:[],selectedKey:null,onSelect:mutate,screenReader:false,voiceReason:'Synthetic microphone error',voiceDisplay:{phase:'error',text:'Synthetic retained partial',level:0,error:'host_failed'}});
assert.ok(JSON.stringify(errorCachedList).includes('deck-list-voice-display'),'offline List keeps voice error and retained partial visible beside cached metadata');

test('phone command labels stay on one line without changing their control rectangles',()=>{
const compactCommandTree=DeckScreen({...props,cachedDisplay:undefined,frame:{width:390,height:844}});nodes.length=0;walk(compactCommandTree);
for(let slot=0;slot<6;slot++){
 const label=nodes.find(n=>n.props.testID===`deck-label-${slot}`);assert.ok(label,'critical command labels own an explicit native text box');
 assert.equal(label.props.variant,'command','critical labels cannot silently shrink below their readable base');
 const style=Object.assign({},...label.props.style.flat(Infinity));assert.ok(style.width>50&&style.fontSize>=13,'the command uses its full bounded width at minimum base13');
 assert.equal(label.props.numberOfLines,1,'every phone command label occupies one line');
 assert.ok(style.lineHeight>=16,'the label retains readable native line height');
}
const nextLabel=nodes.find(n=>n.props.testID==='deck-label-4');assert.equal(nextLabel.props.children,require('../.test-build/src/core/phrase-command.js').DEFAULT_DECK_PHRASE.name,'the saved shortcut name stays on one line');
});

test('LIVE startup without a selection guides a key choice without fabricating selection or unknown state',()=>{
 const before=mutations;
 const tree=DeckScreen({...props,cachedDisplay:undefined,cachedLcdDisplay:undefined,liveLcdDisplay:undefined,view:{...freshUnselected,keys:freshUnselected.keys.map(key=>({...key,selected:false}))}});nodes.length=0;walk(tree);
 const lcd=nodes.find(n=>n.props.testID==='deck-status'),content=JSON.stringify(lcd);
 assert.ok(content.includes('Choose a tab'),'an unselected live LCD explains the next action');
 assert.ok(content.includes('Press key 1 to begin'),'key 1 is a suggestion rather than an automatic selection');
 assert.equal(content.includes('Unknown'),false,'absence of selection is not an unknown agent state');
 const visible=[];function collect(n){if(Array.isArray(n))n.forEach(collect);else if(n?.props&&n.props.testID!=='deck-usage-line'){if(n.type==='deck-text')visible.push(n.props.children);collect(n.props.children);}}collect(lcd);
 assert.equal(visible.includes('—'),false,'unselected identity and elapsed time must not render bare placeholders');
 assert.equal(mutations,before,'rendering the hint never selects a replacement row');
 assert.equal(nodes.find(n=>n.props.testID==='deck-key-1').props.accessibilityState.selected,false);
 for(let i=0;i<4;i++)assert.equal(nodes.find(n=>n.props.testID==='deck-command-'+i).props.accessibilityState.disabled,true);
 assert.ok(lcd.props.accessibilityLabel.includes('Choose a tab'),'screen readers receive the same selection instruction');
 nodes.find(n=>n.props.testID==='deck-key-1').props.onPress();assert.equal(mutations,before+1,'an explicit key press remains available');
});


// Exercise the production Home expression and persistence effect with controlled ports.
// This intentionally evaluates their actual AST nodes, rather than copying their logic.
const homeSource=readFileSync(new URL('../src/ui/deck-home.tsx',import.meta.url),'utf8');
const homeAst=ts.createSourceFile('deck-home.tsx',homeSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function homeNode(predicate){let found;function visit(n){if(predicate(n))found=n;ts.forEachChild(n,visit);}visit(homeAst);assert.ok(found,'production Home node exists');return found;}
function evaluateHome(node,ports){const module={exports:{}};const code=ts.transpileModule('module.exports=('+node.getText(homeAst)+')',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,...ports});return module.exports;}
const homePending=homeNode(n=>ts.isVariableDeclaration(n)&&n.name.getText(homeAst)==='cachedLcdDisplay').initializer;
const homeSave=homeNode(n=>ts.isCallExpression(n)&&n.expression.getText(homeAst)==='useEffect'&&n.arguments[0]?.getText(homeAst).includes('deckDisplayCacheStore.save')).arguments[0];
const cacheCore=require('../.test-build/src/core/deck-display-cache.js');
const projectCore=require('../.test-build/src/core/project-focus.js');
const many=Array.from({length:8},(_,i)=>({...a,id:'pane-'+i,title:'Current live '+i,target:{...a.target,terminalId:'pane-'+i+':leaf',connectionGeneration:2},place:{repoId:'repo',repo:'Project',worktreeName:'Workspace',worktreeActive:false,worktreeRank:0,agentRank:i}}));
const manyKeys=many.map(bindKey),six=manyKeys.slice(0,6),restoredKey=manyKeys[7];
const restored=captureDisplayCache({hostId:'fixture',issuedAt:now-31000,agents:many.map((a,i)=>i===7?{...a,title:'Restored old LCD',state:'done'}:a),items:manyKeys,keys:six,selectedKey:restoredKey,partial:false,unresolved:0,focusInfo:{project:'Project',worktree:'Workspace',following:true,synced:true}},now-31000);
assert.ok(restored);
const manyInput={...input,generation:2,agents:many},unselectedDeck=reconcileDeck(emptyDeckState(),manyInput,now);
assert.equal(unselectedDeck.selected,null);
const unselectedView=deriveDeckView(unselectedDeck,{...manyInput,now,link:'LIVE',journalReady:true,busy:false,caps:{input:true,approve:true,speech:true}},{keys:six,items:manyKeys});
function homePorts(rows= many,at=now){return {...cacheCore,...projectCore,bindKey,displayCache:restored,snapshot:{host:{hostId:'fixture'}},now:at,displayReady:true,deck:unselectedDeck,view:unselectedView,layout:{items:six,keys:six},inventory:{...manyInput,agents:rows,confirmedAt:at},presentSet:new Set(rows.map(bindKey)),focus:{mode:'follow'}};}
const liveLcd=evaluateHome(homePending,homePorts());
assert.equal(liveLcd?.rows.find(row=>row.key===restoredKey)?.title,'Current live 7','Home uses the exact LIVE row outside six keys instead of the restored title');
assert.equal(liveLcd.lcdSource,'live-row');assert.equal(unselectedDeck.selected,null);
const homeForward=homeNode(n=>ts.isJsxAttribute(n)&&n.name.getText(homeAst)==='liveLcdDisplay').initializer.expression;
function assertLiveLcd(shown,title){
 const forwarded=evaluateHome(homeForward,{cachedLcdDisplay:shown});assert.equal(forwarded,shown,'Home forwards only the validated display projection');
 const tree=DeckScreen({...props,cachedDisplay:undefined,cachedLcdDisplay:shown,liveLcdDisplay:forwarded,view:unselectedView});nodes.length=0;walk(tree);
 const lcd=nodes.find(n=>n.props.testID==='deck-status'),contents=JSON.stringify(lcd);
 assert.ok(contents.includes(title));assert.equal(contents.includes('Refreshing'),false,'LIVE inventory is not a reconnecting inventory');
 assert.ok(lcd.props.accessibilityLabel.includes('LIVE'),'the LCD reports the connection as LIVE');
 assert.ok(lcd.props.accessibilityLabel.includes(messages.createTranslator('en')('state.'+shown.rows.find(row=>row.key===shown.selectedKey).state)),'the LCD state belongs to the current or explicitly retained display row');
 if(shown.lcdSource==='live-row')assert.ok(lcd.props.accessibilityLabel.includes('8/8'),'the live row keeps its real full-list position outside six keys');
 assert.equal(lcd.props.accessibilityLabel.includes(messages.createTranslator('en')('focus.following')),false,'unresolved desktop following stays dim');
 const local=[];function scan(v){if(Array.isArray(v))v.forEach(scan);else if(v?.props){local.push(v);scan(v.props.children);}}scan(lcd);
 const flat=v=>Array.isArray(v)?Object.assign({},...v.map(flat)):v??{};
 assert.ok(local.some(n=>flat(n.props.style).backgroundColor==='#5FD38D'),'LIVE LCD has a green connection indicator');
 assert.equal(local.some(n=>flat(n.props.style).backgroundColor==='#FF7A8A'),false,'retained display metadata cannot turn a LIVE connection red');
 const before=mutations;
 for(let i=0;i<4;i++){const command=nodes.find(n=>n.props.testID==='deck-command-'+i);assert.equal(command.props.accessibilityState.disabled,true);command.props.onPress?.();}
 lcd.props.onResponderGrant(touch(200));lcd.props.onResponderMove(touch(100));lcd.props.onResponderRelease(touch(100));
 assert.equal(mutations,before,'LCD-only metadata neither sends nor selects, even with fresh inventory');
 const fresh=nodes.find(n=>n.props.testID==='deck-key-1');assert.equal(fresh.props.accessibilityState.disabled,false);fresh.props.onPress();assert.equal(mutations,before+1,'only an explicit fresh-key gesture creates a selection');
 assert.equal(unselectedDeck.selected,null,'the display projection never mutates the authoritative deck state');
 return lcd;
}
assertLiveLcd(liveLcd,'Current live 7');
const offlineWithProjection=DeckScreen({...props,cachedDisplay:cache,liveLcdDisplay:liveLcd,view:unselectedView});assert.ok(JSON.stringify(offlineWithProjection).includes('Refreshing'),'whole offline cache still wins over a previous live LCD projection');
const beforeRealSelection=DeckScreen({...props,cachedDisplay:undefined,liveLcdDisplay:liveLcd,cachedLcdDisplay:liveLcd});assert.ok(JSON.stringify(beforeRealSelection).includes('Fresh conversation'),'an actual selected live target overrides every LCD-only projection');
const retained=evaluateHome(homePending,homePorts(many.slice(0,7)));
assert.equal(retained?.lcdSource,'retained');assert.equal(retained.issuedAt,restored.issuedAt);
const retainedLcd=assertLiveLcd(retained,'Restored old LCD');
assert.equal(retainedLcd.props.accessibilityLabel.includes('8/8'),false,'an absent row cannot claim its old position in the current live list');
const expires=DeckScreen({...props,cachedDisplay:undefined,cachedLcdDisplay:{...retained,issuedAt:now-180001},liveLcdDisplay:{...retained,issuedAt:now-180001},view:unselectedView});
assert.equal(JSON.stringify(expires).includes('Restored old LCD'),false,'LIVE connection does not extend a retained LCD beyond three minutes');
assert.equal(evaluateHome(homePending,homePorts(many.slice(0,7),now+149001)),undefined,'retained metadata expires from its original issuedAt in Home too');
const saved=[];
function runHomeSave(cachedLcdDisplay,at,overrides={}){const ports={...homePorts(many,at),cachedLcdDisplay,list:many.map(agent=>({agent})),project:undefined,selectedProject:undefined,active:undefined,detour:{desktop:null,away:false},desktopFocus:undefined,lastCacheEncoded:{current:''},setDisplayCache:cache=>saved.push({kind:'state',cache}),deckDisplayCacheStore:{save:cache=>{saved.push({kind:'storage',cache});return Promise.resolve();}}};Object.assign(ports,overrides);evaluateHome(homeSave,ports)();}
runHomeSave(liveLcd,now);assert.equal(saved.filter(s=>s.kind==='storage').length,1,'a verified current live row can refresh its stored metadata');assert.equal(saved[0].cache.issuedAt,now);
const savedBefore=saved.length;runHomeSave(retained,now+90000);assert.equal(saved.length,savedBefore,'unrelated LIVE reads cannot re-save or renew retained metadata');assert.equal(retained.issuedAt,restored.issuedAt);
console.log('PASS: actual Home/DeckScreen refresh a full-list LCD row, retain absent metadata with LIVE connection, never create selection/action authority, and preserve the original retained TTL in storage');


const homeFocusInfo=homeNode(n=>ts.isJsxAttribute(n)&&n.name.getText(homeAst)==='focusInfo').initializer.expression;
const fixtureProjects=[{repoId:'first',name:'Unselected first project',items:[manyKeys[0]]},{repoId:'manual',name:'Explicit manual project',items:[manyKeys[1]]}];
assert.equal(projectCore.currentProject(projectCore.emptyFocus(),fixtureProjects),null,'the navigation helper itself does not invent an initial project');
const navigationProject=projectCore.currentProject({mode:'follow',repoId:'first',mark:null},fixtureProjects);
assert.equal(navigationProject.name,'Unselected first project','a retained navigation project is not evidence of current desktop focus');
const expiredCache={...restored,issuedAt:now-180001};
const baseFocusPorts={...homePorts(),displayCache:expiredCache,projects:fixtureProjects,project:navigationProject,selectedProject:undefined,active:undefined,detour:{desktop:null,away:false},focus:{mode:'follow',repoId:'first',mark:null}};
assert.equal(evaluateHome(homePending,baseFocusPorts),undefined,'the expired last content is discarded instead of kept forever');
for(const [focus,selectedProject,want] of [
 [{mode:'follow',repoId:'first',mark:null},undefined,null],
 [{mode:'manual',repoId:'missing',mark:null},undefined,null],
 [{mode:'manual',repoId:'manual',mark:null},undefined,'Explicit manual project'],
 [{mode:'follow',repoId:null,mark:null},fixtureProjects[1],'Explicit manual project'],
 [{mode:'manual',repoId:'first',mark:null},fixtureProjects[1],'Explicit manual project'],
]){
 const ports={...baseFocusPorts,focus,selectedProject,deck:{...unselectedDeck,selected:selectedProject?.items[0]??null}};
 assert.equal(evaluateHome(homeFocusInfo,ports).project,want,'LCD project requires its selected row or an exact explicit manual project, never the navigation fallback');
 const previous=saved.length;runHomeSave(undefined,now,ports);
 const written=saved.slice(previous).find(s=>s.kind==='storage');assert.ok(written);
 assert.equal(written.cache.focusInfo.project,want,'persisted focus metadata uses the same project evidence as the displayed LCD');
 assert.equal(written.cache.selectedKey,ports.deck.selected,'a label never creates a selection beyond an existing explicit live choice');
}
console.log('PASS: actual Home LCD and cache metadata never promote the navigation first project after cache expiry; selected project wins and only an exact manual project may supply a fallback label');

const lockedVoice={phase:'recording',text:'Owned voice partial',targetChangeBlocked:true};
const lockedFace=DeckScreen({...props,cachedDisplay:undefined,voiceDisplay:lockedVoice});
assert.ok(JSON.stringify(lockedFace).includes(messages.createTranslator('en')('voice.targetLocked')),'recording target lock notice appears on the actual LCD JSX');
const lockedList=DeckList({...props,cachedDisplay:undefined,rows:[],voiceDisplay:lockedVoice});
assert.ok(JSON.stringify(lockedList).includes(messages.createTranslator('en')('voice.targetLocked')),'List shows the same recording target lock notice');
console.log('PASS: actual face and List explain blocked target changes during recording');
