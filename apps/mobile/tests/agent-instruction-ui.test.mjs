import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

// Real component/JSX callbacks with fake hooks and ports. This does not mount React Native,
// prove gesture delivery, exercise host RPC, or establish physical-device acceptance.
const url=new URL('../src/ui/deck/agent-instruction-sheet.tsx',import.meta.url);
const source=readFileSync(url,'utf8'),digest=value=>createHash('sha256').update(value).digest('hex');
const homeUrl=new URL('../src/ui/deck-home.tsx',import.meta.url),homeSource=readFileSync(homeUrl,'utf8');
const homeAST=ts.createSourceFile('deck-home.tsx',homeSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let observerText,gateText;
function visit(node){
 if((ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))&&node.tagName.getText(homeAST)==='OwnedAgentInstructionSheet'){
  const attr=node.attributes.properties.find(item=>ts.isJsxAttribute(item)&&item.name.getText(homeAST)==='onConfirmationChange');
  if(attr?.initializer&&ts.isJsxExpression(attr.initializer))observerText=attr.initializer.expression?.getText(homeAST);
 }
 if(ts.isCallExpression(node)&&node.expression.getText(homeAST)==='useGlobalDeckVoice'){
  const options=node.arguments[0];if(options&&ts.isObjectLiteralExpression(options))gateText=options.properties.find(item=>ts.isPropertyAssignment(item)&&item.name.getText(homeAST)==='confirmationOpen')?.initializer.getText(homeAST);
 }
 ts.forEachChild(node,visit);
}
visit(homeAST);assert.ok(observerText,'DeckHome forwards the H1 confirmation observer');assert.ok(gateText,'DeckHome supplies the global voice confirmation gate');
const boundaryEvents=[],gateEnvironment={sharedInput:{isOpen:false},nativeDialog:undefined,claudeDialog:undefined,agentConfirming:false};
let suppress=false;
const suppression={};Object.defineProperty(suppression,'current',{get:()=>suppress,set:value=>{suppress=value;boundaryEvents.push(['suppress',value]);}});
const observerEnvironment={suppressDraftSheet:suppression,voice:{cancelCapture:()=>{boundaryEvents.push(['cancelCapture',suppress]);}},setAgentConfirming:open=>{gateEnvironment.agentConfirming=open;boundaryEvents.push(['setAgentConfirming',open]);}};
function expression(code,environment){return vm.runInNewContext(ts.transpileModule('('+code+')',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,environment);}
const rootObserver=expression(observerText,observerEnvironment),voiceBlocked=()=>!!expression(gateText,gateEnvironment);
const require=createRequire(import.meta.url),slots=[],effects=[],effectQueue=[];
let cursor=0,effectCursor=0,count=0,revision='ja:1',appEvent;
const same=(a,b,label)=>{count++;assert.deepEqual(a,b,label);};
const react={
 useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
 useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
 useSyncExternalStore:(subscribe,get)=>get(),
 useEffect(fn,deps){const i=effectCursor++,previous=effects[i];if(!previous||deps.some((value,j)=>!Object.is(value,previous.deps[j])))effectQueue.push(()=>{previous?.cleanup?.();effects[i]={deps,cleanup:fn()};});},
};
const Panel=()=>null,native={View:'View',Text:'Text',TextInput:'TextInput',Pressable:'Pressable',Alert:{alert(){}},AppState:{addEventListener(name,fn){appEvent=fn;return{remove(){}};}}};
const module={exports:{}};
const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
vm.runInNewContext('(function(require,module,exports){'+output+'})',{}, {filename:url.pathname})(name=>{
 if(name==='react')return react;if(name==='react-native')return native;
 if(name==='../../i18n/provider')return{useMessages:()=>({locale:'ja',presentationRevision:revision,t:key=>key})};
 if(name==='../confirmation-panel')return{ConfirmPanel:Panel};
 if(name==='../theme')return{S:{}};
 if(name==='../../adapters/host-default-agent-journal')return{unresolvedHostDefaultLaunch:()=>false};
 if(name==='react/jsx-runtime')return require(name);
 throw new Error('Unmocked UI boundary: '+name);
},module,module.exports);
const Component=module.exports.AgentInstructionSheet;
const walk=node=>Array.isArray(node)?node.flatMap(walk):node?.props?[node,...walk(node.props.children)]:[];
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};};
const calls=[],cancels=[],prepareArguments=[];
const eligibleWorktrees=Array.from({length:83},(_,index)=>({worktreeId:index===0?'fixture-worktree':`fixture-worktree-${index}`,title:`Full fixture worktree ${index}`,path:`/fixture/full/worktree/${index}`}));
let invalidations=0,nextConfirmation,prepareGate,confirmGate,nativePending,prepareCount=0,prepareFailure=false;
const client={
 subscribe:()=>()=>{},getSnapshot:()=>({journal:'ready',busy:false,receipts:[]}),
 invalidate(){invalidations++;nativePending=undefined;},
 cancel(value){cancels.push(value);if(nativePending===value)nativePending=undefined;},
 listEligibleWorktrees:async()=>({ok:true,worktrees:eligibleWorktrees}),
 async prepare(input){prepareArguments.push(input);prepareCount++;boundaryEvents.push(['prepare',voiceBlocked()]);if(prepareFailure)return{ok:false,reason:'busy'};const value=prepareGate?await prepareGate.promise:nextConfirmation;nativePending=value;return{ok:true,confirmation:value};},
 async confirm(value){calls.push(value);if(nativePending!==value)return{status:'already_submitted'};nativePending=undefined;return confirmGate.promise;},
};
let props={client,active:true,presentationKey:'fixture-deck',draft:'Full fixture instruction',worktreeId:'fixture-worktree',onDraftChange(){},onWorktreeChange(id){props={...props,worktreeId:id};},onConfirmationChange:rootObserver};
const render=()=>{cursor=0;effectCursor=0;return Component(props);};
const commit=()=>{while(effectQueue.length)effectQueue.shift()();};
const button=(tree,key)=>walk(tree).find(node=>node.type==='Pressable'&&walk(node).some(child=>child.type==='Text'&&child.props.children===key));
const panel=tree=>walk(tree).find(node=>node.type===Panel);
const confirmation=id=>Object.freeze({operationId:id,hostId:'fixture-host',hostVersion:'1.4.246',generation:2,worktreeId:props.worktreeId,agent:'codex',prompt:props.draft,preparedAt:1000});
async function prepare(id){nextConfirmation=confirmation(id);button(render(),'agent.prepare').props.onPress();await flush();const tree=render();commit();return panel(tree);}

let tree=render();commit();
same(walk(tree).some(node=>node.props.testID==='deck-agent-worktree-required'&&node.type==='Text'&&node.props.children==='agent.empty'),true,'a missing eligible selection explains why Prepare is disabled');
same(button(tree,'agent.prepare').props.disabled,true);button(tree,'agent.prepare').props.onPress();await flush();same(prepareCount,0);
button(tree,'agent.load').props.onPress();await flush();render();commit();
tree=render();const loadedNodes=walk(tree),loadedRows=loadedNodes.filter(node=>node.type==='Pressable'&&node.props.accessibilityRole==='radio');same(loadedRows.length,83);
const draftIndex=loadedNodes.findIndex(node=>node.type==='TextInput'&&node.props.testID==='deck-agent-draft'),prepareIndex=loadedNodes.indexOf(button(tree,'agent.prepare'));
same(loadedRows.every(row=>loadedNodes.indexOf(row)>draftIndex&&loadedNodes.indexOf(row)>prepareIndex),true,'83 result rows must not precede the draft or Prepare control');
const selectedIdentity=loadedNodes.find(node=>node.props.testID==='deck-agent-selected-worktree');assert.ok(selectedIdentity);
same(loadedNodes.indexOf(selectedIdentity)<draftIndex,true);
const selectedTexts=walk(selectedIdentity).filter(node=>node.type==='Text');
const selectedValues=selectedTexts.flatMap(node=>node.props.children);
for(const value of [eligibleWorktrees[0].title,eligibleWorktrees[0].worktreeId,eligibleWorktrees[0].path])same(selectedValues.includes(value),true,'selected title, exact ID and path remain complete above the editor');
same(selectedTexts.every(node=>node.props.selectable&&node.props.numberOfLines===undefined&&node.props.ellipsizeMode===undefined),true);
same(loadedNodes[draftIndex].props.value,props.draft);same(Object.assign({},...button(tree,'agent.prepare').props.style).minHeight>=48,true);
same(loadedNodes.find(node=>node.props.accessibilityRole==='radiogroup').props.accessibilityLabel,'agent.worktree');
props={...props,worktreeId:''};tree=render();commit();
const required=walk(tree).find(node=>node.props.testID==='deck-agent-worktree-required');assert.ok(required);
same(required.props.children,'agent.empty');same(walk(tree).indexOf(required)<walk(tree).findIndex(node=>node.props.testID==='deck-agent-draft'),true);
same(button(tree,'agent.prepare').props.disabled,true);const beforeMissing=prepareCount;button(tree,'agent.prepare').props.onPress();await flush();same(prepareCount,beforeMissing);same(calls.length,0);
walk(tree).find(node=>node.props.testID===`deck-agent-worktree-${eligibleWorktrees[0].worktreeId}`).props.onPress();render();commit();same(props.worktreeId,eligibleWorktrees[0].worktreeId);same(walk(render()).some(node=>node.props.testID==='deck-agent-worktree-required'),false);
same(voiceBlocked(),false);gateEnvironment.sharedInput.isOpen=true;same(voiceBlocked(),true);gateEnvironment.sharedInput.isOpen=false;
gateEnvironment.nativeDialog={id:'other-native-confirmation'};same(voiceBlocked(),true);gateEnvironment.nativeDialog=undefined;same(voiceBlocked(),false);
gateEnvironment.claudeDialog={loading:true};same(voiceBlocked(),true);gateEnvironment.claudeDialog=undefined;same(voiceBlocked(),false);
boundaryEvents.length=0;
const A=await prepare('fixture-A');same(A.props.preparedAt,1000);
same(boundaryEvents,[['suppress',true],['cancelCapture',true],['setAgentConfirming',true],['prepare',true]]);
same(voiceBlocked(),true);A.props.onCancel();render();commit();same(voiceBlocked(),false);
const B=await prepare('fixture-B'),beforeCancel=cancels.length;
A.props.onCancel();A.props.onConfirm();same(calls.length,0);same(cancels.length,beforeCancel);same(panel(render()).props.content.props.children,nextConfirmation.prompt);
same(voiceBlocked(),true,'stale A cancellation must not release B voice gate');
confirmGate=deferred();B.props.onConfirm();B.props.onConfirm();same(calls.length,1);same(calls[0],nextConfirmation);
tree=render();commit();same(panel(tree).props.cancelDisabled,true);B.props.onCancel();same(!!panel(render()),true);
same(voiceBlocked(),true,'in-flight owner blocks PTT');
// A presentation change and background event must not dismiss an in-flight/result owner.
revision='ja:2';render();commit();appEvent('background');same(!!panel(render()),true);
same(voiceBlocked(),true,'mode/revision/background preserve in-flight PTT block');
confirmGate.reject(new Error('synthetic rejected submit'));await flush();tree=render();commit();
same(panel(tree).props.resultLabel,'agent.unknown');same(panel(tree).props.cancelDisabled,false);same(calls.length,1);
same(cancels.at(-1),nextConfirmation);
same(voiceBlocked(),true,'completed result blocks PTT until owner close');
revision='ja:3';props={...props,presentationKey:'fixture-list'};render();commit();appEvent('background');
tree=render();same(panel(tree).props.resultLabel,'agent.unknown');
same(voiceBlocked(),true);
const beforePrepare=prepareCount;button(tree,'agent.prepare').props.onPress();await flush();same(prepareCount,beforePrepare);same(panel(render()).props.resultLabel,'agent.unknown');
panel(render()).props.onCancel();render();commit();same(!!panel(render()),false);
same(voiceBlocked(),false);
// A pre-send change revokes the pending consent synchronously, then dismisses its UI.
const C=await prepare('fixture-C'),beforeInvalidation=invalidations;
same(voiceBlocked(),true);
revision='ja:4';render();same(invalidations,beforeInvalidation+1);same(nativePending,undefined);commit();same(!!panel(render()),false);
same(voiceBlocked(),false,'pre-send revision cancellation releases the gate');
C.props.onConfirm();same(calls.length,1);
// Late prepare results belong to the old scope and are exact-cancelled, never displayed.
prepareGate=deferred();boundaryEvents.length=0;button(render(),'agent.prepare').props.onPress();
same(voiceBlocked(),true,'preparation blocks PTT before its first await');
same(boundaryEvents,[['suppress',true],['cancelCapture',true],['setAgentConfirming',true],['prepare',true]]);
revision='ja:5';render();commit();same(voiceBlocked(),false);
const late=confirmation('fixture-late');prepareGate.resolve(late);await flush();render();commit();
same(!!panel(render()),false);same(cancels.at(-1),late);same(calls.length,1);
same(voiceBlocked(),false,'late prepare never reopens the gate');
prepareGate=undefined;prepareFailure=true;boundaryEvents.length=0;
button(render(),'agent.prepare').props.onPress();same(voiceBlocked(),true);await flush();render();commit();
same(voiceBlocked(),false,'refused prepare releases the gate');same(!!panel(render()),false);
same(boundaryEvents,[['suppress',true],['cancelCapture',true],['setAgentConfirming',true],['prepare',true],['setAgentConfirming',false]]);
prepareFailure=false;const D=await prepare('fixture-D');same(voiceBlocked(),true);appEvent('inactive');render();same(voiceBlocked(),false,'background pre-send cancellation releases the gate');D.props.onCancel();same(voiceBlocked(),false);
// Selection remains an exact worktree ID; changing it disarms the old panel without writing.
const selectedA=await prepare('fixture-selected-A'),writeCount=calls.length,last=eligibleWorktrees.at(-1);
const rowFor=id=>walk(render()).find(node=>node.type==='Pressable'&&node.props.testID===`deck-agent-worktree-${id}`);
rowFor(last.worktreeId).props.onPress();same(props.worktreeId,last.worktreeId);tree=render();commit();
same(!!panel(render()),false);selectedA.props.onConfirm();same(calls.length,writeCount);same(voiceBlocked(),false);
same(walk(render()).find(node=>node.type==='TextInput'&&node.props.testID==='deck-agent-draft').props.value,props.draft);
const lastIdentity=walk(render()).find(node=>node.props.testID==='deck-agent-selected-worktree');
const lastValues=walk(lastIdentity).filter(node=>node.type==='Text').flatMap(node=>node.props.children);
for(const value of [last.title,last.worktreeId,last.path])same(lastValues.includes(value),true);
const selectedB=await prepare('fixture-selected-B');same(prepareArguments.at(-1).worktreeId,last.worktreeId);same(prepareArguments.at(-1).prompt,props.draft);
selectedA.props.onCancel();selectedA.props.onConfirm();same(calls.length,writeCount);same(panel(render()).props.scopeKey,selectedB.props.scopeKey);
selectedB.props.onCancel();same(calls.length,writeCount);
// A prepare already in flight is cancelled when a new selection arrives, never surfaced or sent.
prepareGate=deferred();const oldSelection=confirmation('fixture-late-worktree');button(render(),'agent.prepare').props.onPress();
rowFor(eligibleWorktrees[0].worktreeId).props.onPress();render();commit();prepareGate.resolve(oldSelection);await flush();render();commit();
same(cancels.at(-1),oldSelection);same(!!panel(render()),false);same(calls.length,writeCount);same(props.worktreeId,eligibleWorktrees[0].worktreeId);prepareGate=undefined;
await prepare('fixture-unmount');same(voiceBlocked(),true);for(const effect of effects)effect?.cleanup?.();same(voiceBlocked(),false,'sheet unmount releases the gate');
// Detect edits during this test without an evergreen hardcoded source pin.
same(digest(readFileSync(url,'utf8')),digest(source));
same(digest(readFileSync(homeUrl,'utf8')),digest(homeSource));
console.log(`PASS: ${count} actual H1 UI ABA/scope/result/voice-gate/83-row assertions (fake hooks; no native mount, host RPC or device)`);
