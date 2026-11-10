import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),{createPhrasePreferences}=require('../.test-build/src/adapters/phrase-preferences.js'),core=require('../.test-build/src/core/phrase-command.js'),t=require('../.test-build/src/i18n/messages.js').createTranslator('ko');
const jsx=(type,props)=>({type,props:props??{}}),walk=n=>Array.isArray(n)?n.flatMap(walk):n?.props?[n,...walk(n.props.children)]:[];
const load=(file,deps)=>{const module={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:id=>Object.hasOwn(deps,id)?deps[id]:require(id)});return module.exports;};
async function owner(){
 const writes=[],cells=[];let index=0,closed=0,failed=false,raw=null;
 const preferences=createPhrasePreferences({get:async()=>raw,set:async(key,value)=>{if(failed)throw Error('synthetic');writes.push([key,value]);raw=value;},remove:async()=>{throw Error('unexpected remove');}});await preferences.load();
 const react={useState(initial){const at=index++;if(!(at in cells))cells[at]=typeof initial==='function'?initial():initial;return[cells[at],next=>{cells[at]=typeof next==='function'?next(cells[at]):next;}];},useRef(initial){const at=index++;return cells[at]??(cells[at]={current:initial});},useEffect(){}};
 const native={...Object.fromEntries(['KeyboardAvoidingView','Modal','Pressable','ScrollView','Text','TextInput','View'].map(v=>[v,v])),Keyboard:{dismiss(){}},Platform:{OS:'ios'},StyleSheet:{create:v=>v}};
 const deps={react,'react-native':native,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native-safe-area-context':{SafeAreaProvider:'SafeAreaProvider',SafeAreaView:'SafeAreaView'},'../../core/phrase-command':core,'../../adapters/phrase-preferences':{phrasePreferences:preferences},'../../i18n/provider':{useMessages:()=>({t})},'./deck-fonts':{DECK_NUMERAL_FONT:'BarlowCondensed-Bold'}};
 deps['../theme']=load('../src/ui/theme.tsx',deps);
 const {PhraseEditor}=load('../src/ui/deck/phrase-editor.tsx',deps);
 const render=()=>{index=0;return PhraseEditor({snapshot:preferences.getSnapshot(),onClose:()=>closed++});};
 const find=id=>walk(render()).find(n=>n.props.testID===id);
 const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
 return{render,find,flush,writes,preferences,closed:()=>closed,fail:value=>{failed=value;}};
}
{
 const o=await owner();o.find('deck-phrase-name').props.onChangeText('다음');o.find('deck-phrase-text').props.onChangeText('Approved next step.');
 assert.equal(o.writes.length,0,'editing never writes or contacts a host');
 o.find('deck-phrase-defaults').props.onPress();assert.equal(o.find('deck-phrase-name').props.value,'계속');assert.equal(o.writes.length,0,'defaults change the local editor until Save');
 o.render().props.onRequestClose();assert.equal(o.closed(),1);assert.equal(o.writes.length,0,'closing discards local changes without touching saved content');
}
{
 const o=await owner();o.find('deck-phrase-name').props.onChangeText('다음');o.find('deck-phrase-name').props.onChangeText('1234567');assert.equal(o.find('deck-phrase-name').props.value,'다음');
 o.find('deck-phrase-text').props.onChangeText('Approved next step.');o.find('deck-phrase-save').props.onPress();o.find('deck-phrase-save').props.onPress();await o.flush();
 assert.equal(o.writes.length,1,'one pending Save has one storage write');assert.equal(o.closed(),1);assert.deepEqual(o.preferences.getSnapshot().value,{name:'다음',text:'Approved next step.'});
}
{
 const o=await owner();o.find('deck-phrase-name').props.onChangeText('');assert.equal(o.find('deck-phrase-save').props.accessibilityState.disabled,true);o.find('deck-phrase-save').props.onPress();await o.flush();assert.equal(o.writes.length,0);
 o.find('deck-phrase-name').props.onChangeText('저장');o.fail(true);o.find('deck-phrase-save').props.onPress();await o.flush();assert.equal(o.closed(),0);assert.equal(o.preferences.getSnapshot().value.name,'계속');
 const alert=walk(o.render()).find(n=>n.props.accessibilityRole==='alert'&&n.props.children===t('phrase.storage'));assert.ok(alert);
 o.fail(false);await o.preferences.retry();o.find('deck-phrase-save').props.onPress();await o.flush();assert.equal(o.closed(),1);
}
{
 const o=await owner(),tree=o.render();
 for(const node of walk(tree).filter(n=>n.type==='Text'||n.type==='TextInput')){
  const style=Object.assign({},...[node.props.style].flat(Infinity).filter(Boolean));if(style.fontSize!==undefined)assert.ok(style.fontSize>0);assert.equal(node.props.maxFontSizeMultiplier,1.5);
  assert.equal(style.opacity===0||style.height===0||style.display==='none',false,'there are no hidden test-only product nodes');
 }
 assert.equal(walk(tree).filter(n=>n.type==='TextInput').length,2);assert.equal(typeof walk(tree).find(n=>n.props.testID==='deck-phrase-editor').props.onAccessibilityEscape,'function');
}
console.log('PASS actual phrase editor: two fields, local defaults, close without save, limits, save ACK/error/retry, positive Text and 1.5 scaling');
