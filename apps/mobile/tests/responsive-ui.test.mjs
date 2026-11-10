import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,deps={}){
 const module={exports:{}},source=readFileSync(new URL(file,import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:id=>id in deps?deps[id]:require(id),Math,Number});return module.exports;
}
const approved=load('../src/ui/deck/approved-face-geometry.ts'),responsive=load('../src/ui/deck/responsive-face-geometry.ts');
const geometry=load('../src/ui/deck/deck-layout.ts',{'./approved-face-geometry':approved,'./responsive-face-geometry':responsive});
const home=ts.createSourceFile('deck-home.tsx',readFileSync(new URL('../src/ui/deck-home.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let capacity;
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(home)==='faceKeys')capacity=node.initializer?.getText(home);ts.forEachChild(node,visit);}visit(home);assert.ok(capacity);
const getCapacity=frame=>{const module={exports:{}};vm.runInNewContext(ts.transpileModule(`module.exports=(${capacity});`,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{...geometry,frame,module,exports:module.exports});return module.exports;};
for(const [width,height,n] of [[390,844,6],[844,390,6],[411,891,6],[891,411,6],[554.7,876.4,6],[876.4,554.7,6],[821.3,1088,9],[1088,821.3,9],[834,1194,9],[1194,834,9],[500,1000,6]])assert.equal(getCapacity({width,height}),n,`actual DeckHome capacity for ${width}×${height}`);
// Face changes preserve the selected pane and navigation beyond the visible N keys.
const model=require('../.test-build/src/core/deck-model.js'),projects=require('../.test-build/src/core/project-focus.js');
const now=1793800800000,agents=Array.from({length:12},(_,i)=>({id:`a${i}`,provider:'codex',title:`Owned ${i}`,summary:'',state:'idle',eventType:'informational',updatedAt:new Date(now).toISOString(),target:{hostId:'owned',connectionGeneration:1,worktreeId:'wt',terminalId:`tab:leaf${i}`}}));
const input={live:true,generation:1,confirmedAt:now,agents,complete:true,scopeIdentity:'owned',uncertaintyKnown:true,unresolvedPanes:new Set(),unresolvedCount:0};
const selected=model.bindKey(agents[8]),state={...model.reconcileDeck(model.emptyDeckState(),input,now),selected};
for(const frame of [{width:821.3,height:1088},{width:1088,height:821.3},{width:554.7,height:876.4},{width:876.4,height:554.7},{width:821.3,height:1088}]){
 const n=getCapacity(frame),layout=projects.recentView([],agents.map(model.bindKey),n),view=model.deriveDeckView(state,{...input,now,link:'LIVE',journalReady:true,busy:false,caps:{input:true,approve:false,speech:true}},layout);
 assert.equal(view.keys.length,n);assert.equal(view.display.agent?.id,'a8','an off-key selected pane survives reorientation and cover capacity');assert.equal(projects.stepWithinProject(layout,selected,'right'),model.bindKey(agents[9]),'navigation reaches beyond visible capacity');assert.equal(state.selected,selected);
}
console.log('PASS: actual DeckHome responsive capacity; selected pane and complete navigation survive 6/9 transitions');
