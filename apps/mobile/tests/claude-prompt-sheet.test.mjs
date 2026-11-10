import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),jsx=(type,props)=>({type,props:props??{}}),walk=n=>Array.isArray(n)?n.flatMap(walk):n?.props?[n,...walk(n.props.children)]:[];
const cells=[];let i=0;const react={useState:v=>{const x=i++;if(!(x in cells))cells[x]=typeof v==='function'?v():v;return[cells[x],v=>{cells[x]=typeof v==='function'?v(cells[x]):v;}];},useRef:v=>{const x=i++;return cells[x]??(cells[x]={current:v});},useEffect(){}};
const t=require('../.test-build/src/i18n/messages.js').createTranslator('ko');
const native={...Object.fromEntries(['Modal','KeyboardAvoidingView','Pressable','Text','TextInput','View'].map(x=>[x,x])),Keyboard:{dismiss(){}},Platform:{OS:'ios'},StyleSheet:{create:x=>x}};
const load=(file,deps)=>{const module={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:id=>Object.hasOwn(deps,id)?deps[id]:require(id)});return module.exports;};
const deps={react,'react-native':native,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native-safe-area-context':{SafeAreaProvider:'SafeAreaProvider',SafeAreaView:'SafeAreaView'},'../../i18n/provider':{useMessages:()=>({t})},'../confirmation-panel':{ConfirmPanel:'ConfirmPanel'}};
deps['../theme']=load('../src/ui/theme.tsx',{...deps,'./deck-fonts':{DECK_NUMERAL_FONT:'BarlowCondensed-Bold'}});
const {ClaudePromptSheet}=load('../src/ui/deck/claude-prompt-sheet.tsx',deps);
const review={id:'review-one',preparedAt:Date.now(),title:'Test Claude',location:'Test project',prompt:{kind:'question',question:'Choose a harmless result?',detail:'',options:[{number:1,label:'Alpha',description:'First',input:false},{number:2,label:'Type something.',description:'',input:true}],canSend:true,clipped:false}};
const sends=[];let closes=0;const props={review,loading:false,sending:false,onClose:()=>closes++,onSubmit:(...args)=>sends.push(args),isCurrent:true};
const render=()=>{i=0;return ClaudePromptSheet(props);};
const panel=()=>walk(render()).find(n=>n.type==='ConfirmPanel');
assert.equal(render().type,'Modal','one stable native Modal owns every in-sheet state');assert.equal(panel().props.embedded,true,'confirmation gestures cannot create a nested native Modal');assert.equal(panel().props.disabled,true);
walk(panel().props.content).find(n=>n.props.testID==='claude-option-1').props.onPress();assert.equal(panel().props.disabled,false);assert.equal(panel().props.holdLabel,'1. Alpha 보내기');panel().props.onConfirm();assert.deepEqual(sends,[[0,undefined]]);
walk(panel().props.content).find(n=>n.props.testID==='claude-option-2').props.onPress();assert.equal(panel().props.disabled,true);const field=walk(panel().props.content).find(n=>n.props.testID==='claude-direct-input');assert.ok(field);field.props.onChangeText('An explicit answer');walk(panel().props.content).find(n=>n.props.testID==='claude-review-text').props.onPress();assert.equal(panel().props.disabled,false);panel().props.onConfirm();assert.deepEqual(sends.at(-1),[1,'An explicit answer']);
props.review={...review,id:'replacement'};assert.equal(panel().props.disabled,true,'replacement contents clear selection synchronously');props.review={...props.review,prompt:{...review.prompt,clipped:true,canSend:false}};assert.equal(panel().props.disabled,true);assert.match(panel().props.beforeConfirmNotice,/잘렸/);
render().props.onRequestClose();assert.equal(closes,1);
for(const n of walk(render()).filter(n=>n.type==='Text')){const style=Object.assign({},...[n.props.style].flat(Infinity).filter(Boolean));if(style.fontSize!==undefined)assert.ok(style.fontSize>0);assert.notEqual(style.opacity,0);}
console.log('PASS actual Claude sheet: single native owner, verbatim choices, explicit free-text review, replacement/reset, clipping and close (JSX ports only)');

for(const label of ['대상을 다시 확인하고 있습니다.','답이 반영됐는지 확인하고 있습니다.','호스트 결과를 기다리고 있습니다. 같은 동작을 반복하지 마세요.']){props.processingLabel=label;props.sending=true;assert.equal(panel().props.processingLabel,label,'busy Claude sheet passes each stage to its visible processing row');}
