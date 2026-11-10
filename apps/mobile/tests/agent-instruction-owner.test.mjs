import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

// Actual wrapper, owner initializer, client subscriptions and preset JSX callback. This
// is not a native renderer or proof that the physical input failure has been resolved.
const require=createRequire(import.meta.url),homeText=readFileSync(new URL('../src/ui/deck-home.tsx',import.meta.url),'utf8'),sheetText=readFileSync(new URL('../src/ui/deck/agent-instruction-sheet.tsx',import.meta.url),'utf8');
const home=ts.createSourceFile('deck-home.tsx',homeText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),sheet=ts.createSourceFile('agent-instruction-sheet.tsx',sheetText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const wrapper=sheet.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='OwnedAgentInstructionSheet');assert.ok(wrapper,'a child wrapper, not DeckHome, must subscribe to the instruction owner');
function expression(code,environment){const module={exports:{}};vm.runInNewContext(ts.transpileModule(`module.exports=(${code});`,{fileName:'fixture.tsx',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{...environment,require,module,exports:module.exports});return module.exports;}
const storeModule={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/core/agent-instruction-draft-store.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:storeModule,exports:storeModule.exports});
const factory=storeModule.exports.createAgentInstructionDraftStore;
let count=0;const same=(actual,expected,label)=>{count++;assert.deepEqual(actual,expected,label);};
const owner=factory();let childSubscriptions=0;const Original=()=>null;
const Owned=expression(wrapper.getText(sheet).replace(/^export\s+/,''),{AgentInstructionSheet:Original,useSyncExternalStore:(subscribe,get)=>{childSubscriptions++;same(subscribe,owner.subscribe);return get();}});
const client={},observer=()=>{},base={owner,client,active:true,presentationKey:'deck/en/gen1',onConfirmationChange:observer};
let child=Owned(base);same(child.type,Original);same(child.props.draft,'');same(child.props.worktreeId,'');same(child.props.client,client);same(child.props.onConfirmationChange,observer);
const full='Original instructions\n한국어 e\u0301 😀 '+ 'x'.repeat(144),worktree='exact-worktree-id';
child.props.onDraftChange(full);child.props.onWorktreeChange(worktree);child=Owned(base);same(child.props.draft,full);same(child.props.worktreeId,worktree);
same(child.props.onDraftChange,owner.setDraft);same(child.props.onWorktreeChange,owner.setWorktreeId);
// Closing/unmounting the wrapper cannot delete owner data. New presentation scopes forward
// the same values so the original H1 component still performs its cancellation fences.
for(const presentationKey of ['list/en/gen1','list/ko/gen1','deck/ko/gen2']){
 child=Owned({...base,active:false,presentationKey});same(child.props.draft,full);same(child.props.worktreeId,worktree);same(child.props.presentationKey,presentationKey);
}
same(owner.getSnapshot().draft,full);same(childSubscriptions,5);
const homeFn=home.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='DeckHome');assert.ok(homeFn?.body);
let ownerInitializer,preset;const subscriptions=[];
function visit(node){
 if(ts.isVariableDeclaration(node)&&ts.isArrayBindingPattern(node.name)&&node.name.elements.some(element=>ts.isBindingElement(element)&&element.name.getText(home)==='instructionOwner'))ownerInitializer=node.initializer?.getText(home);
 if(ts.isCallExpression(node)&&node.expression.getText(home)==='useSyncExternalStore')subscriptions.push(node.getText(home));
 if((ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))&&node.tagName.getText(home)==='Customize'){
  const attribute=node.attributes.properties.find(item=>ts.isJsxAttribute(item)&&item.name.getText(home)==='onInstruct');if(attribute?.initializer&&ts.isJsxExpression(attribute.initializer))preset=attribute.initializer.expression.getText(home);
 }
 ts.forEachChild(node,visit);
}
visit(homeFn);assert.ok(ownerInitializer&&preset);let creations=0,held;
const initialize=()=>expression(ownerInitializer,{createAgentInstructionDraftStore:()=>{creations++;return owner;},useState:initial=>{held??=initial();return[held];}})[0];
same(initialize(),owner);same(initialize(),owner);same(creations,1);
let ownerSubscribes=0,clientSubscribes=0;const observedOwner={...owner,subscribe:()=>{ownerSubscribes++;return()=>{};}};
const port={subscribe:()=>{clientSubscribes++;return()=>{};},getSnapshot:()=>({})};
let phraseSubscribes=0;const phrasePreferences={subscribe:()=>{phraseSubscribes++;return()=>{};},getSnapshot:()=>({})};
for(const call of subscriptions)expression(call,{phrasePreferences,instructionOwner:observedOwner,client:port,structured:port,hostDefaultAgentClient:port,useSyncExternalStore:(subscribe,get)=>{subscribe(()=>{});return get();}});
same(ownerSubscribes,0,'DeckHome never subscribes to per-character owner changes');same(clientSubscribes,3);
same(phraseSubscribes,1,'the independent local phrase preference does not subscribe to H1 keystrokes');
const events=[],suppressDraftSheet={current:false};const instruct=expression(preset,{instructionOwner:owner,suppressDraftSheet,voice:{cancelCapture:()=>events.push('cancel')},setSheet:value=>events.push(value)});
const replacement='Explicit full preset\n😀';instruct(replacement);same(suppressDraftSheet.current,true);same(events,['cancel','agent']);same(owner.getSnapshot().draft,replacement);same(owner.getSnapshot().worktreeId,worktree);
console.log(`PASS: ${count} actual H1 owner/wrapper/parent boundary assertions (no native/host/storage)`);
