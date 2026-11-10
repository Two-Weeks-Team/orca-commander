import {renderer} from './helpers/deck-sheet-render.mjs';
const recording=renderer().load('src/ui/deck/recording-display.tsx');
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),now=1793800800000;
function load(file,deps={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:id=>id in deps?deps[id]:require(id),Date,setTimeout,clearTimeout});return module.exports;}
const approved=load('../src/ui/deck/approved-face-geometry.ts'),responsive=load('../src/ui/deck/responsive-face-geometry.ts');
const geometry=load('../src/ui/deck/deck-layout.ts',{'./approved-face-geometry':approved,'./responsive-face-geometry':responsive});
const hooks={useState:v=>[typeof v==='function'?v():v,()=>{}],useRef:v=>({current:v}),useEffect:()=>{}};
class Value{setValue(){}}
const native={Platform:{OS:'ios',isPad:false},View:'view',Pressable:'pressable',Animated:{Value,View:'animated'},AccessibilityInfo:{},Easing:{},StyleSheet:{absoluteFill:{},create:x=>x}};
const assets={deckBase:'phone-base',deckManifest:JSON.parse(readFileSync(new URL('../assets/deck/manifest.json',import.meta.url),'utf8')),deckIcons:{},deckSprites:{},approvedInnerBase:'old-inner',approvedCoverBase:'old-cover'};
let insets={left:0,right:0,top:0,bottom:0};
const {DeckScreen}=load('../src/ui/deck/DeckScreen.tsx',{'./recording-display':recording,react:hooks,'react-native':native,'expo-image':{Image:'image'},'react-native-safe-area-context':{useSafeAreaInsets:()=>insets},'../../adapters/deck-feedback':{deckClick:()=>{}},'../../i18n/provider':{useMessages:()=>({locale:'en',t:key=>key})},'./deck-assets':assets,'./DeckSkin':{DeckSkin:'responsive-skin'},'./deck-text':{DeckText:'deck-text'},'../deck-fonts':{DECK_NUMERAL_FONT:'test'},'./deck-layout':geometry,'./state-mark':{LCD_STATE_COLOR:{unknown:'#fff'},useReduceMotion:()=>true,palette:{unknown:{glyph:{kind:'text',text:'?'},ink:'#fff'}},lookFor:()=>({glyph:{kind:'text',text:'?'},ink:'#fff'}),providerIcon:()=>null,StateMark:'mark'},'../../core/phrase-command':require('../.test-build/src/core/phrase-command.js'),'../../core/deck-surface-swipe':require('../.test-build/src/core/deck-surface-swipe.js'),'../../core/deck-display-cache':require('../.test-build/src/core/deck-display-cache.js'),'../../adapters/usage':require('../.test-build/src/adapters/usage.js'),'../../core/agent-display':require('../.test-build/src/core/agent-display.js')});
const model=require('../.test-build/src/core/deck-model.js'),project=require('../.test-build/src/core/project-focus.js');
function walk(v,out=[]){if(Array.isArray(v))v.forEach(x=>walk(x,out));else if(v?.props){out.push(v);walk(v.props.children,out);}return out;}
for(const [w,h,face] of [[390,844,'phone'],[554.7,876.4,'cover'],[821.3,1088,'wide'],[1088,821.3,'landscape'],[844,390,'short-landscape']]){
 const layout=geometry.deckLayout(w,h,insets),n=geometry.deckKeyCount(face),view=model.deriveDeckView(model.emptyDeckState(),{agents:[],now,confirmedAt:now,live:false,generation:1,complete:false,scopeIdentity:'fixture',uncertaintyKnown:true,unresolvedPanes:new Set(),unresolvedCount:0,link:'OFFLINE',journalReady:true,busy:false,caps:{input:false,approve:false,speech:false}},project.recentView([],[],n));
 const nodes=walk(DeckScreen({frame:{width:w,height:h},view,onStatus:()=>{},onList:()=>{},onContent:()=>{},onInput:()=>{}}));
 assert.equal(nodes.filter(n=>n.props.testID?.startsWith('deck-key-')).length,n);
 const skin=nodes.find(n=>n.type==='responsive-skin');
 const voice=nodes.find(n=>n.props.testID==='deck-voice'),label=walk(voice).find(n=>n.type==='deck-text');
 const labelStyle=Object.assign({},...label.props.style.filter(Boolean));
 if(face==='phone')assert.equal(labelStyle.maxWidth,undefined,'the original phone PTT width must not acquire an adaptive bound that strands its last syllable');
 else assert.ok(labelStyle.maxWidth<=layout.voice.width,'adaptive PTT labels remain bounded by their own control');
 if(face==='phone'){assert.equal(skin,undefined);assert.ok(nodes.some(n=>n.type==='image'&&n.props.source==='phone-base'),'portrait phone retains its original art path');}
 else {assert.ok(skin,`${face} must compose art from the same rectangles as labels and touch, rather than stretch an old full face`);assert.equal(skin.props.layout.face,face);assert.equal(skin.props.layout.width,w);assert.equal(skin.props.layout.height,h);assert.equal(skin.props.layout.agentKeys.length,n);assert.ok(!nodes.some(n=>n.type==='image'&&['old-inner','old-cover','phone-base'].includes(n.props.source)),'adaptive face does not paint old wells underneath new ones');}
}
console.log('PASS: actual native face routes adaptive art through shared geometry while preserving portrait phone art');

// Execute the real compositor, including the manifest's patch/file mapping.
const manifest=JSON.parse(readFileSync(new URL('../assets/deck/responsive/manifest.json',import.meta.url),'utf8'));
const primitives=manifest.primitives,files=Object.values(primitives).flatMap(p=>p.patches?p.patches.map(x=>x.file):[p.file]);
const patchGeometry=load('../src/ui/deck/skin-patches.ts');
const {DeckSkin}=load('../src/ui/deck/DeckSkin.tsx',{'react-native':native,'expo-image':{Image:'image'},'./responsive-assets':{responsiveManifest:manifest,responsiveImages:Object.fromEntries(files.map(f=>[f,f]))},'./skin-patches':patchGeometry});
for(const [w,h,top,bottom,left,right,n] of [[844,390,8,21,47,47,6],[1088,821.3,48,20,16,16,9],[821.3,1088,34,20,0,0,9]]){
 const layout=geometry.deckLayout(w,h,{top,bottom,left,right}),tree=DeckSkin({layout}),nodes=walk(tree),images=nodes.filter(n=>n.type==='image');
 assert.equal(tree.props.pointerEvents,'none');assert.equal(images.length,1+9+9*n+6*9+9+2);
 assert.equal(images.filter(n=>n.props.source?.startsWith('agentWell.')).length,n*9);
 assert.equal(images.filter(n=>n.props.source?.startsWith('commandWell.')).length,54);
 const center=images.find(n=>n.props.source==='agentWell.r1c1.png').props.style[1];
 assert.ok(Math.abs(center.left-(layout.agentKeys[0].left+23))<1e-8);
 assert.ok(Math.abs(center.top-(layout.agentKeys[0].top+23))<1e-8);
 const ring=images.find(n=>n.props.source==='stickRing.png').props.style[1];
 assert.ok(Math.abs(ring.width-ring.height)<1e-8);assert.ok(Math.abs(ring.left+ring.width/2-(layout.stick.left+layout.stick.width/2))<1e-8);
}
console.log('PASS: actual compositor paints the manifest patches on shared logical wells, preserving circular aspect and touch transparency');
