import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const core=require('../.test-build/src/core/project-focus.js');
const {bindKey}=require('../.test-build/src/core/deck-model.js');
const source=readFileSync(new URL('../src/ui/deck-home.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('deck-home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let effect;
function visit(node){
 if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('returnToDesktop('))effect=node.arguments[0];
 ts.forEachChild(node,visit);
}
visit(ast);assert.ok(effect,'exercise the actual DeckHome idle effect');
const code=ts.transpileModule(`(${effect.getText(ast)})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const row=id=>({id,provider:'codex',title:id,state:'working',updatedAt:'2026-11-05T00:00:00Z',target:{hostId:'synthetic',worktreeId:id,terminalId:`${id}:leaf`,connectionGeneration:1},place:{repoId:id,repo:id}});
const agents=[row('selected-project'),row('other-project')],selected=bindKey(agents[0]);
for(const focus of [undefined,{worktreeId:'missing',tabId:'absent:leaf'}])for(const captureLocked of [false,true]){
 let clock=0,deadline,callback;
 const deckRef={current:{selected,present:agents.map(bindKey)}};
 const original={mode:'manual',repoId:'selected-project',mark:'previous-known-activation'};
 const focusRef={current:original};
 const context={...core,Date:{now:()=>clock},Set,latest:{current:{agents}},focusRef,deckRef,
  desktopFocusRef:{current:focus},currentFrontendFocus:value=>value,
  captureTargetLock:{current:captureLocked},
  detour:core.deckDetour(original,agents,new Set(deckRef.current.present),focus,selected),
  setFocus:value=>{focusRef.current=value;},setDeck:update=>{deckRef.current=update(deckRef.current);},
  setTimeout(fn,ms){callback=fn;deadline=clock+ms;return 1;},clearTimeout(){callback=undefined;}};
 const run=vm.runInNewContext(code,context);
 const cleanup=run();
 if(captureLocked){assert.equal(callback,undefined,'recording cannot arm an automatic selection/project return');assert.equal(focusRef.current.mode,'manual');assert.equal(deckRef.current.selected,selected);continue;}
 assert.equal(deadline,20_000,'unknown focus must still arm the 20-second project detour timeout');
 clock=19_999;assert.equal(focusRef.current.mode,'manual');assert.equal(deckRef.current.selected,selected);
 clock=20_000;callback();
 assert.equal(focusRef.current.mode,'follow','return to all-project recent tabs even without an exact desktop target');
 assert.equal(deckRef.current.selected,selected,'unknown focus cannot replace the selected row');
 assert.equal(core.recencyOrder(agents,new Set(deckRef.current.present)).length,2,'follow view includes every project');
 cleanup();assert.equal(callback,undefined);
}
console.log('PASS actual DeckHome idle effect: unknown/missing desktop, 20-second follow return, selection retained');
