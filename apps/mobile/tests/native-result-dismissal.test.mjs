import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),{createConfirmationContext}=require('../.test-build/src/ui/confirmation-context.js');
const jsx=(type,props,key)=>({type,key,props:props??{}}),walk=n=>Array.isArray(n)?n.flatMap(walk):n?.props?[n,...walk(n.props.children)]:[];
const source=readFileSync(new URL('../src/ui/native-reply-editor.tsx',import.meta.url),'utf8');
let checks=0;const same=(a,b,m)=>{checks++;assert.deepEqual(a,b,m);};
function fixture(os,status='accepted'){
 const slots=[],effects=[],queue=[],appListeners=new Set();let at=0,dirty=false,tree,mounted=true;const counts={send:0,cancel:0,parentClose:0};
 const react={useRef(initial){const i=at++;return slots[i]??(slots[i]={current:initial});},useState(initial){const i=at++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{const value=typeof next==='function'?next(slots[i]):next;if(!Object.is(value,slots[i])){slots[i]=value;dirty=true;}}];},useEffect(fn,deps){const i=at++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))queue.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()};});},useSyncExternalStore(_listen,snapshot){return snapshot();}};
 const snapshot={busy:false,journal:'ready'},ticket=Object.freeze({id:'owned',preparedAt:Date.now(),title:'Owned reply',text:'Owned answer'});
 const client={subscribe:()=>()=>{},getSnapshot:()=>snapshot,prepareReply:async()=>({ok:true,confirmation:ticket}),confirmReply:async value=>{same(value,ticket);counts.send++;return{status};},cancel:()=>counts.cancel++};
 const deps={react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{Platform:{OS:os},AppState:{addEventListener:(_event,fn)=>{appListeners.add(fn);return{remove:()=>appListeners.delete(fn)};}},Keyboard:{dismiss(){}},Modal:'Modal',Pressable:'Pressable',ScrollView:'ScrollView',KeyboardAvoidingView:'KeyboardAvoidingView',Text:'Text',View:'View'},'react-native-safe-area-context':{SafeAreaProvider:'SafeAreaProvider',SafeAreaView:'SafeAreaView'},'../i18n/messages':{createTranslator:()=>key=>key},'../i18n/provider':{useMessages:()=>({t:key=>key,locale:'ko',presentationRevision:1})},'./confirmation-context':{createConfirmationContext},'../adapters/native-async-reply':{formatNativeAsyncReply:()=> 'Answer'},'./host-voice-draft-field':{HostVoiceDraftField:'Draft'},'./native-confirmation':{NativeConfirmationDialog:'Dialog'},'./theme':{C:{},S:{}}};
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(source,{fileName:'native-reply-editor.tsx',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:id=>{assert.ok(Object.hasOwn(deps,id),id);return deps[id];},Date,JSON,Object,Number});
 let props={entry:{hostId:'host',generation:1,target:{title:'Owned reply'},questions:[{questions:[{title:'Question',options:[]}]}]},session:{},client,live:true,generation:1,otherBusy:false,initialAnswers:[{text:'Answer'}],presentationKey:'original',onDraftChange(){},onResult(){},onClose:()=>counts.parentClose++};
 function render(){for(let i=0;i<15;i++){at=0;dirty=false;tree=module.exports.NativeReplyEditor(props);while(queue.length)queue.shift()();if(!dirty)return;}throw Error('render did not settle');}
 const dialog=()=>walk(tree).find(n=>n.type==='Dialog').props;
 async function flush(){for(let i=0;i<15;i++){await Promise.resolve();if(dirty&&mounted)render();}}
 render();return{counts,ticket,dialog,render,flush,parent:()=>tree.props,async prepare(){walk(tree).find(n=>n.props.accessibilityLabel==='native.reviewReplyLabel').props.onPress();await flush();},async send(){dialog().onConfirm();await flush();},background(){for(const fn of appListeners)fn('background');render();},update(patch){props={...props,...patch};render();},unmount(){mounted=false;for(const e of effects)e?.cleanup?.();}};
}
for(const phase of ['normal','background']){
 const h=fixture('ios');await h.prepare();await h.send();same(h.counts.send,1);const original=h.dialog().confirmation;
 h.dialog().onCancel();h.render();same(h.counts.parentClose,0,'iOS retains the fullScreen parent until native child dismiss');same(h.dialog().confirmation,original);same(h.dialog().visible,false);same(h.parent().visible,true);
 h.parent().onRequestClose();h.dialog().onCancel();h.render();same(h.counts.parentClose,0,'parent Back and repeated result Close cannot race child dismissal');
 if(phase==='background'){h.background();same(h.dialog().confirmation,original);same(h.parent().visible,true);}
 const dismissed=h.dialog().onDismiss;dismissed();h.render();same(h.counts.parentClose,1);same(h.dialog().confirmation,undefined);dismissed();h.parent().onRequestClose();h.render();same(h.counts.parentClose,1,'all close paths consume the same parent close once');same(h.counts.send,1);same(h.counts.cancel,1,'only the original confirm cleanup cancels the consumed ticket');h.unmount();
}
{
 const h=fixture('android');await h.prepare();await h.send();h.dialog().onCancel();h.render();same(h.counts.parentClose,1,'Android retains immediate Close');h.unmount();
}
for(const changed of ['presentation','aba','unmount']){
 const h=fixture('ios');await h.prepare();await h.send();h.dialog().onCancel();h.render();const dismissed=h.dialog().onDismiss;
 if(changed==='presentation')h.update({presentationKey:'new owner'});else if(changed==='aba'){h.update({presentationKey:'new owner'});h.update({presentationKey:'original'});}else h.unmount();dismissed();if(changed!=='unmount')h.render();same(h.counts.parentClose,0,'stale dismissal cannot close a different owner');
}
console.log(`PASS: ${checks} actual native reply result-dismiss ownership assertions (controlled ports; no native send)`);
