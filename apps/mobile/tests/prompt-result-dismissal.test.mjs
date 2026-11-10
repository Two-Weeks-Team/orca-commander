import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),{createConfirmationContext}=require('../.test-build/src/ui/confirmation-context.js');
const jsx=(type,props,key)=>({type,key,props:props??{}}),walk=n=>Array.isArray(n)?n.flatMap(walk):n?.props?[n,...walk(n.props.children)]:[];
const source=readFileSync(new URL('../src/ui/action-composer.tsx',import.meta.url),'utf8');
let checks=0;const same=(a,b,m)=>{checks++;assert.deepEqual(a,b,m);};
function fixture(os,status='accepted'){
 const slots=[],effects=[],queue=[],timers=[],appListeners=new Set();let at=0,dirty=false,tree,mounted=true;const counts={send:0,cancel:0,parentClose:0,parentReveal:0,parentUnlock:0,acceptedClear:0};
 const react={useRef(initial){const i=at++;return slots[i]??(slots[i]={current:initial});},useState(initial){const i=at++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{const value=typeof next==='function'?next(slots[i]):next;if(!Object.is(value,slots[i])){slots[i]=value;dirty=true;}}];},useEffect(fn,deps){const i=at++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))queue.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()};});},useSyncExternalStore(_listen,snapshot){return snapshot();}};
 const snapshot={busy:false,journal:'ready',receipts:[]},ticket=Object.freeze({id:'owned',hostId:'host',worktreeId:'worktree',paneKey:'pane',handle:'handle',incarnationId:'incarnation',generation:1,hostVersion:'1.4.248',preparedAt:Date.now(),title:'Owned tab',text:'Owned full body'});
 const client={subscribe:()=>()=>{},getSnapshot:()=>snapshot,prepare:async()=>({ok:true,confirmation:ticket}),confirm:async value=>{same(value,ticket);counts.send++;return{status};},cancel:()=>counts.cancel++};
 const deps={react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{Platform:{OS:os},AppState:{currentState:'active',addEventListener:(_event,fn)=>{appListeners.add(fn);return{remove:()=>appListeners.delete(fn)};}},Keyboard:{dismiss(){}},Pressable:'Pressable',Text:'Text',TextInput:'TextInput',View:'View'},'expo-crypto':{randomUUID:()=> 'fixed'},'../i18n/messages':{createTranslator:()=>key=>key},'../i18n/provider':{useMessages:()=>({t:key=>key,locale:'ko',presentationRevision:1})},'./confirmation-context':{createConfirmationContext},'./voice-messages':{voiceAvailabilityKeys:{available:'available'},voiceErrorKeys:{}},'../adapters/host-dictation':{HostDictation:class{getSnapshot(){return{phase:'idle',availability:'available'};}subscribe(){return()=>{};}async refresh(){}async cancel(){}handleAppState(){}}},'../adapters/native-microphone':{createNativeMicrophone:()=>({})},'./action-outcome':{actionOutcomeKey:()=> 'outcome'},'./voice-draft':{mergeVoiceDraft:()=>undefined},'./prompt-confirmation':{PromptConfirmationDialog:'Dialog'},'./use-handsfree-prompt':{useHandsfreePrompt:()=>({phase:'idle'})},'../core/read-freshness':{READ_FRESH_MS:30000},'./theme':{C:{},S:{}}};
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(source,{fileName:'action-composer.tsx',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:id=>{assert.ok(Object.hasOwn(deps,id),id);return deps[id];},Date,JSON,Object,Number,setTimeout:fn=>{timers.push(fn);return fn;},clearTimeout(){}});
 let props={agent:{id:'A',provider:'codex',title:ticket.title,state:'working',target:{hostId:'host',worktreeId:'worktree',terminalId:'pane'}},session:{getSnapshot:()=>({host:{hostId:'host',endpointHost:'host label'}}),actionChannel:()=>({hostId:'host',generation:1,confirmedAt:Date.now()})},client,live:true,initialText:ticket.text,presentationKey:'original',onReviewResultClose:()=>counts.parentClose++,onReviewResultClosing:()=>{counts.parentReveal++;return()=>counts.parentUnlock++;},captureAcceptedDraft:()=>()=>counts.acceptedClear++};
 function render(){for(let i=0;i<15;i++){at=0;dirty=false;tree=module.exports.ActionComposer(props);while(queue.length)queue.shift()();if(!dirty)return;}throw Error('render did not settle');}
 const dialog=()=>walk(tree).find(n=>n.type==='Dialog').props;
 async function flush(){for(let i=0;i<15;i++){await Promise.resolve();if(dirty&&mounted)render();}}
 render();return{counts,ticket,dialog,render,flush,background(){for(const fn of appListeners)fn('background');render();},async prepare(){walk(tree).find(n=>n.props.testID==='deck-prompt-review').props.onPress();await flush();},async send(){dialog().onConfirm();await flush();},update(patch){props={...props,...patch};render();},unmount(){mounted=false;for(const e of effects)e?.cleanup?.();},runTimers(){for(const fn of timers.splice(0))fn();render();}};
}
for(const status of ['accepted','unknown','partial']){
 const h=fixture('ios',status);await h.prepare();await h.send();same(h.counts.send,1);const original=h.dialog().confirmation;
 h.dialog().onCancel();h.render();same(h.counts.parentClose,0,'iOS cannot dismiss the parent in the child result Close transaction');same(h.dialog().confirmation,original,'native dismissal keeps the exact confirmation mounted');same(h.dialog().visible,false,'first dismiss only the child native Modal');same(h.counts.parentReveal,1,'the input can be revealed while its close remains locked');
 h.dialog().onCancel();h.render();same(h.counts.parentReveal,1,'repeated Close cannot enqueue another close');h.runTimers();same(h.counts.parentClose,0,'no timer may guess that native dismissal completed');
 const dismissed=h.dialog().onDismiss;dismissed();h.render();same(h.counts.parentClose,1);same(h.counts.parentUnlock,1);same(h.dialog().confirmation,undefined);dismissed();h.render();same(h.counts.parentClose,1,'late duplicate native callbacks are inert');same(h.counts.send,1,'dismiss never sends again');same(h.counts.cancel,0,'settled dismissal never replays or acknowledges a receipt');same(h.counts.acceptedClear,status==='accepted'?1:0);h.unmount();
}
{
 const h=fixture('android');await h.prepare();await h.send();h.dialog().onCancel();h.render();same(h.counts.parentClose,1,'Android keeps its immediate result Close');same(h.counts.parentReveal,0);same(h.dialog().confirmation,undefined);h.unmount();
}
{
 const h=fixture('ios');await h.prepare();h.dialog().onCancel();h.render();same(h.counts.parentClose,0,'editing cancels only the child confirmation');same(h.counts.cancel,1);same(h.dialog().confirmation,undefined);h.unmount();
}
{
 const h=fixture('ios');await h.prepare();await h.send();h.dialog().onCancel();h.render();const original=h.dialog().confirmation;h.background();same(h.dialog().confirmation,original,'background preserves the dismissing native child');same(h.counts.parentClose,0);h.dialog().onDismiss();h.render();same(h.counts.parentClose,1);same(h.counts.parentUnlock,1);h.unmount();
}
for(const changed of ['presentation','aba','unmount']){
 const h=fixture('ios');await h.prepare();await h.send();h.dialog().onCancel();h.render();const dismissed=h.dialog().onDismiss;
 if(changed==='presentation')h.update({presentationKey:'new owner'});else if(changed==='aba'){h.update({presentationKey:'new owner'});h.update({presentationKey:'original'});}else h.unmount();dismissed();if(changed!=='unmount')h.render();same(h.counts.parentClose,0,'a stale native dismissal cannot close another or unmounted owner');
}
console.log(`PASS: ${checks} actual prompt result native-dismiss ownership assertions (controlled ports; no native UIKit or send)`);
