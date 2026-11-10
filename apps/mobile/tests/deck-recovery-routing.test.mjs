import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

// Actual pure model/view functions, DeckHome AST statements and JSX/Alert callbacks.
// Ports only record calls: no native mount, protected store, unpairing, host or device I/O.
const root=fileURLToPath(new URL('../src/',import.meta.url)),homeUrl=new URL('../src/ui/deck-home.tsx',import.meta.url);
const sources=new Map(),read=file=>{const text=readFileSync(file,'utf8');sources.set(file,text);return text;};
const homeText=read(fileURLToPath(homeUrl)),home=ts.createSourceFile('deck-home.tsx',homeText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const compile=(code,file='fixture.ts')=>ts.transpileModule(code,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function expression(code,environment){return vm.runInNewContext(compile('('+code+')'),environment);}
const modules=new Map();
function load(file){
 if(modules.has(file))return modules.get(file);const module={exports:{}};modules.set(file,module.exports);
 const require=name=>{assert.ok(name.startsWith('.'),'pure fixtures never load a native port');const base=resolve(dirname(file),name),found=[base,base+'.ts',base+'.tsx'].find(existsSync);assert.ok(found);return load(found);};
 vm.runInNewContext('(function(require,module,exports){'+compile(read(file),file)+'})',{Date,Map,Set,Object,Number,JSON},{filename:file})(require,module,module.exports);return module.exports;
}
const model=load(resolve(root,'core/deck-model.ts')),live=load(resolve(root,'ui/live-view.ts'));
const fn=home.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='DeckHome');assert.ok(fn?.body);
const declarations=new Map();for(const node of fn.body.statements)if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations)declarations.set(d.name.getText(home),d.initializer);
const initializer=name=>{const node=declarations.get(name);assert.ok(node,`DeckHome still declares ${name}`);return node.getText(home);};
const routeStatements=fn.body.statements.filter(node=>ts.isIfStatement(node)&&ts.isIdentifier(node.expression)&&['repair','unpairing'].includes(node.expression.text)).map(node=>node.getText(home));
const routeCode=`const link=${initializer('link')};const context=${initializer('context')};const view=${initializer('view')};const repair=${initializer('repair')};${routeStatements.join('\n')}module.exports={view,repair,context};`;
let count=0;const same=(actual,expected,label)=>{count++;assert.deepEqual(actual,expected,label);};
const now=Date.parse('2026-11-03T00:00:00.000Z'),host=Object.freeze({hostId:'fixture-host',endpointHost:'fixture.invalid:6768',pairedAt:'2026-11-03T00:00:00.000Z'});
const agent={id:'fixture-pane',provider:'codex',title:'Full fixture work title',summary:'Owner body retained',state:'working',eventType:'informational',updatedAt:new Date(now).toISOString(),target:{hostId:host.hostId,worktreeId:'fixture-worktree',terminalId:'fixture-pane',connectionGeneration:1}};
const inventory={live:true,complete:true,agents:[agent],generation:1,confirmedAt:now,unresolvedPanes:new Set(),uncertaintyKnown:true,unresolvedCount:0};
let deck=model.reconcileDeck(model.emptyDeckState(),inventory,now);deck=model.pressKey(deck,0,now).state;
function route(snapshot,unpairing=false){
 const liveView=live.describeLiveView(snapshot,now),environment={snapshot,inventory:{...inventory,live:liveView.status.live},deck,now,unresolvedCount:null,actions:{busy:false},requests:{busy:false},voice:{available:true},session:{actionChannel:()=>({transport:{acquireTerminalInput(){}}})},unpairing,layout:undefined,deriveDeckView:model.deriveDeckView,needsPairingRepair:live.needsPairingRepair};
 const module={exports:undefined};vm.runInNewContext(compile(routeCode),{...environment,module});return{...module.exports,liveView};
}
const snapshot=(extra={})=>({phase:'live',host,agents:[agent],attempt:0,connection:{paired:true,online:true,hostId:host.hostId,generation:1,lastConfirmedAt:new Date(now).toISOString()},...extra});
for(const error of ['auth_rejected','host_mismatch']){
 const value=route(snapshot({phase:'stopped',error}));same(value.liveView.needsRepair,true);same(value.repair,true);same(value.view.commands.scanQr,true);same(value.view.commands.reconnect,false);same(value.view.commands.input,false);same(value.liveView.agents[0].state,'unknown');same(value.liveView.counts,null);
 const pending=route(snapshot({phase:'stopped',error}),true);same(pending.view.commands.scanQr,false);same(pending.view.commands.reconnect,false);
}
for(const extra of [{phase:'stopped',error:'transport_failed'},{phase:'stopped'},{phase:'reconnecting',error:'transport_failed'},{phase:'connecting'}]){
 const value=route(snapshot(extra));same(value.repair,false);same(value.view.commands.scanQr,false);same(value.view.commands.reconnect,true);same(value.view.commands.input,false);
}
same(route(snapshot({phase:'unpaired',host:undefined})).view.commands.scanQr,true);same(route(snapshot()).view.commands.input,true,'live selected pane still keeps its existing input route');

const surfaces=new Map(),pressables=[];
const opening=node=>ts.isJsxElement(node)?node.openingElement:node;
const attr=(node,name)=>opening(node).attributes.properties.find(item=>ts.isJsxAttribute(item)&&item.name.getText(home)===name);
function jsxExpression(node,name){const attribute=attr(node,name);assert.ok(attribute?.initializer&&ts.isJsxExpression(attribute.initializer));return attribute.initializer.expression.getText(home);}
function containsMessage(node,key){let found=false;function visit(item){if(ts.isCallExpression(item)&&item.expression.getText(home)==='t'&&item.arguments[0]&&ts.isStringLiteral(item.arguments[0])&&item.arguments[0].text===key)found=true;ts.forEachChild(item,visit);}visit(node);return found;}
function visit(node){
 if(ts.isJsxSelfClosingElement(node)||ts.isJsxElement(node)){
  const tag=opening(node).tagName.getText(home);if(['DeckScreen','DeckList'].includes(tag))surfaces.set(tag,node);if(tag==='Pressable')pressables.push(node);
 }
 ts.forEachChild(node,visit);
}
visit(home);same(surfaces.size,2);
for(const surface of surfaces.values()){
 const sheets=[],calls=[],environment={setSheet:value=>sheets.push(value),session:{start:()=>{calls.push('start');return Promise.resolve();}}};
 expression(jsxExpression(surface,'onScan'),environment)();same(sheets,['pair']);same(calls,[],'scan opens owner pairing UI without starting or unpairing a host');
 expression(jsxExpression(surface,'onStatus'),environment)();same(sheets.at(-1),'status');
 expression(jsxExpression(surface,'onReconnect'),environment)();same(calls,['start']);
}
const manage=pressables.find(node=>containsMessage(node,'link.manage'));assert.ok(manage);
for(const pending of [false,true]){const sheets=[],environment={unpairingRef:{current:pending},unpairing:pending,setSheet:value=>sheets.push(value)};same(expression(jsxExpression(manage,'disabled'),environment),pending);expression(jsxExpression(manage,'onPress'),environment)();same(sheets,pending?[]:['pair']);}
const unpairButton=pressables.find(node=>containsMessage(node,'link.unpair'));assert.ok(unpairButton);
function unpairFixture(options={}){
 const {initialBusy=false,initialFlag=false}=options,initialHost=Object.hasOwn(options,'initialHost')?options.initialHost:host;
 let currentHost=initialHost,resolveUnpair,rejectUnpair,calls=0;const flags=[],alerts=[],settled=[],notices=[];
 const completion=new Promise((done,fail)=>{resolveUnpair=done;rejectUnpair=fail;}),unpairingRef={current:initialFlag},busy={typed:false,structured:false,launch:false};
 const originalFinally=completion.finally.bind(completion);completion.finally=callback=>{const result=originalFinally(callback);settled.push(result);result.catch(()=>undefined);return result;};
 const environment={snapshot:{host:initialHost},unpairBusy:initialBusy,unpairingRef,mounted:{current:true},setNativeResult:value=>notices.push(value),
  Alert:{alert:(title,body,actions)=>alerts.push(actions)},t:key=>key,setUnpairing:value=>flags.push(value),
  session:{getSnapshot:()=>({host:currentHost}),unpair:()=>{calls++;return completion;}},
  client:{getSnapshot:()=>({busy:busy.typed})},structured:{getSnapshot:()=>({busy:busy.structured})},hostDefaultAgentClient:{getSnapshot:()=>({busy:busy.launch})},
 };
 const confirm=expression(initializer('confirmUnpair'),environment);environment.confirmUnpair=confirm;
 same(expression(jsxExpression(unpairButton,'onPress'),environment),confirm);same(expression(jsxExpression(unpairButton,'disabled'),environment),initialBusy);
 return{confirm,alerts,flags,busy,notices,unpairingRef,get calls(){return calls;},setHost:value=>{currentHost=value;},async finish(fail=false){if(fail)rejectUnpair(Error('fixture unpair failure'));else resolveUnpair();await Promise.allSettled(settled);}};
}
for(const options of [{initialBusy:true},{initialFlag:true},{initialHost:undefined}]){
 const f=unpairFixture(options);f.confirm();same(f.alerts.length,0);same(f.calls,0);
}
const canceled=unpairFixture();canceled.confirm();same(canceled.alerts.length,1);canceled.alerts[0].find(action=>action.style==='cancel').onPress?.();same(canceled.calls,0);same(canceled.unpairingRef.current,false);
for(const changedHost of [{...host,hostId:'another-fixture-host'},{...host}]){
 const stale=unpairFixture();stale.confirm();stale.setHost(changedHost);stale.alerts[0].find(action=>action.style==='destructive').onPress();same(stale.calls,0,'even a new summary object for the same host invalidates the displayed identity');same(stale.unpairingRef.current,false);
}
for(const kind of ['typed','structured','launch']){
 const busy=unpairFixture();busy.confirm();busy.busy[kind]=true;busy.alerts[0].find(action=>action.style==='destructive').onPress();same(busy.calls,0);same(busy.flags,[]);
}
const other=unpairFixture();other.confirm();other.unpairingRef.current=true;other.alerts[0].find(action=>action.style==='destructive').onPress();same(other.calls,0);
const current=unpairFixture();current.confirm();const positive=current.alerts[0].find(action=>action.style==='destructive').onPress;positive();positive();
same(current.calls,1);same(current.unpairingRef.current,true);same(current.flags,[true]);current.confirm();same(current.alerts.length,1);await current.finish();same(current.unpairingRef.current,false);same(current.flags,[true,false]);positive();same(current.calls,1,'consumed Alert cannot unpair again after settling');
const failed=unpairFixture();failed.confirm();failed.alerts[0].find(action=>action.style==='destructive').onPress();same(failed.unpairingRef.current,true);await failed.finish(true);same(failed.unpairingRef.current,false);same(failed.flags,[true,false]);same(failed.calls,1);await Promise.resolve();same(failed.notices,['live.storageUnpairFailed']);
const digest=value=>createHash('sha256').update(value).digest('hex');for(const[file,text]of sources)same(digest(readFileSync(file,'utf8')),digest(text),'source unchanged during run');
console.log(`PASS: ${count} recovery route/unpair callback assertions (actual source; no native pairing/host/store/device)`);
