import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Execute actual TSX and journal/client modules with fake hooks and storage ports.
// This is a subscription/callback harness, not a mounted React or native-storage/device test.
const root=fileURLToPath(new URL('../src/',import.meta.url)),require=createRequire(import.meta.url);
const component=path.join(root,'ui/deck/journal-recovery.tsx');
assert.ok(existsSync(component),'Deck needs an explicit, subscribed recovery surface for both action journals');
let count=0,cursor=0,notifications=0;
const slots=[],modules=new Map(),same=(a,b)=>{count++;assert.deepEqual(a,b);};
const hooks={
 useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>{slots[i]=v;}];},
 useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
 useSyncExternalStore(subscribe,get){const i=cursor++;if(!slots[i])slots[i]={off:subscribe(()=>{notifications++;})};return get();},
};
function load(file){
 if(modules.has(file))return modules.get(file).exports;
 const module={exports:{}};modules.set(file,module);
 const output=ts.transpileModule(readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const scoped=name=>{
   // These handler tests retain their legacy surface; D30 real skins are covered separately.
   if(name.endsWith('/sheet-controls'))return {SheetButton:'Pressable',SheetText:'Text',LCD:'View',useSheetSkin:()=>false};
  if(name==='react')return hooks;if(name==='react-native')return{View:'View',Text:'Text',Pressable:'Pressable'};
  if(name.endsWith('/i18n/provider'))return{useMessages:()=>({t:key=>key})};
  if(name.endsWith('/theme'))return{S:{}};
  if(name.startsWith('.')){const base=path.resolve(path.dirname(file),name);return load(['.ts','.tsx'].map(ext=>base+ext).find(existsSync));}
  return require(name);
 };
 vm.runInNewContext('(function(require,module,exports){'+output+'})',{TextEncoder,setTimeout,clearTimeout,Date},{filename:file})(scoped,module,module.exports);
 return module.exports;
}
const {DeckActionClient}=load(path.join(root,'adapters/action-client.ts'));
const {StructuredActionClient}=load(path.join(root,'adapters/structured-action-client.ts'));
const {SecureActionJournal,ACTION_JOURNAL_PREFIX}=load(path.join(root,'adapters/action-journal.ts'));
const {SecureRequestJournal,REQUEST_JOURNAL_PREFIX}=load(path.join(root,'adapters/structured-request-journal.ts'));
const {JournalRecovery}=load(component);
const flush=async()=>{for(let i=0;i<400;i++)await Promise.resolve();};
let hostReads=0,writes=0;
function store(){let fail=true,reads=0,gate;const values=new Map();return{
 port:{get:async key=>{reads++;if(gate)await gate;if(fail)throw Error('synthetic protected-store failure');return values.get(key)??null;},set:async(key,value)=>{writes++;values.set(key,value);}},
 seed(key,value){values.set(key,JSON.stringify(value));},recover(){fail=false;},fail(){fail=true;},pause(promise){gate=promise;},get reads(){return reads;},
};}
const actionStore=store(),requestStore=store(),channel=()=>{hostReads++;return null;};
actionStore.seed(ACTION_JOURNAL_PREFIX+'00',{version:1,sequence:1,receipt:{id:'fixture-action',hostId:'fixture-host',hostVersion:'1.4.246',worktreeId:'fixture-worktree',paneKey:'fixture-pane',handle:'fixture-handle',incarnationId:'fixture-incarnation',at:1000,status:'unknown',acknowledged:false,bodyAccepted:false,submitAttempted:false}});
requestStore.seed(REQUEST_JOURNAL_PREFIX+'00',{version:2,sequence:1,receipt:{operationId:'1700000000000-0123456789abcdef0123456789abcdef',hostId:'fixture-host',hostVersion:'1.4.246',worktreeId:'fixture-worktree',tabId:'fixture-tab',sessionId:'fixture-session',itemId:'fixture-item',revision:1,fence:1,at:1000,kind:'async_reply',status:'unknown',acknowledged:false}});
const client=new DeckActionClient(channel,()=>1000,async()=>{},{refreshChannel:async()=>channel(),journal:new SecureActionJournal(actionStore.port),newId:()=> 'fixture-id'});
const structured=new StructuredActionClient(channel,{journal:new SecureRequestJournal(requestStore.port),uuid:()=> 'fixture-uuid'});
const walk=node=>Array.isArray(node)?node.flatMap(walk):node?.props?typeof node.type==='function'?walk(node.type(node.props)):[node,...walk(node.props.children)]:[];
const render=()=>{cursor=0;return walk(JournalRecovery({client,structured}));};
const button=(tree,key)=>tree.find(node=>node.type==='Pressable'&&walk(node.props.children).some(child=>child.type==='Text'&&child.props.children===key));
await flush();let tree=render();
same(client.getSnapshot().journal,'unavailable');same(structured.getSnapshot().journal,'unavailable');
same(!!button(tree,'journal.reload'),true);same(!!button(tree,'native.reloadHistory'),true);
same(tree.some(node=>node.type==='Text'&&node.props.children==='journal.unavailable'),true);same(tree.some(node=>node.type==='Text'&&node.props.children==='native.journalUnavailable'),true);
const initialReads=actionStore.reads+requestStore.reads;
actionStore.recover();requestStore.recover();await flush();tree=render();
same(actionStore.reads+requestStore.reads,initialReads);same(client.getSnapshot().journal,'unavailable');
// Real reload methods and real journal readers: a recovered port does not itself unlock writes.
const actionClick=button(tree,'journal.reload').props.onPress;
let release;actionStore.pause(new Promise(resolve=>{release=resolve;}));
actionClick();actionClick();await flush();tree=render();
same(client.getSnapshot().journal,'loading');same(tree.some(node=>node.type==='Text'&&node.props.children==='journal.loading'),true);same(actionStore.reads,initialReads-requestStore.reads+1);
same(button(tree,'native.reloadHistory').props.disabled,true);
button(tree,'native.reloadHistory').props.onPress();await flush();same(requestStore.reads,1);
release();await flush();await flush();tree=render();
same(client.getSnapshot().journal,'ready');same(!!button(tree,'journal.reload'),false);same(structured.getSnapshot().journal,'unavailable');
const beforeNative=requestStore.reads,oldNotifications=notifications;
const nativeClick=button(tree,'native.reloadHistory').props.onPress;nativeClick();nativeClick();await flush();await flush();tree=render();
same(requestStore.reads-beforeNative,32);same(structured.getSnapshot().journal,'ready');same(tree.length,0);same(notifications>oldNotifications,true);
same(client.getSnapshot().journal==='ready'&&structured.getSnapshot().journal==='ready',true);
for(const observer of [client,structured]){same(observer.getSnapshot().receipts[0].status,'unknown');same(observer.getSnapshot().receipts[0].acknowledged,false);}
const settledReads=requestStore.reads;nativeClick();await flush();same(requestStore.reads,settledReads);
// Failed explicit reload stays unavailable and remains explicitly retryable.
requestStore.fail();await structured.reloadJournal();tree=render();same(structured.getSnapshot().journal,'unavailable');
button(tree,'native.reloadHistory').props.onPress();await flush();tree=render();same(structured.getSnapshot().journal,'unavailable');same(!!button(tree,'native.reloadHistory'),true);
// Stale callbacks cannot reload during an action or after the selected journal already recovered.
const originalActionSnapshot=client.getSnapshot,beforeStale=requestStore.reads;client.getSnapshot=()=>({busy:true,journal:'ready',operation:'send',receipts:[]});nativeClick();await flush();same(requestStore.reads,beforeStale);
client.getSnapshot=()=>({busy:false,journal:'ready',operation:null,receipts:[]});
const requestSnapshot=structured.getSnapshot();structured.getSnapshot=()=>({...requestSnapshot,busy:true});nativeClick();await flush();same(requestStore.reads,beforeStale);
client.getSnapshot=originalActionSnapshot;same(hostReads,0);same(writes,0);
for(const slot of slots)slot?.off?.();
console.log(`PASS: ${count} actual journal recovery assertions (source hooks/clients; fake protected stores; no React renderer, host or device)`);
