import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

// Actual hook, PTT gesture, HostDictation and inbox with controlled React/native/network ports.
// No React Native mount, device audio, host RPC or external storage is exercised.
const root=fileURLToPath(new URL('../src/',import.meta.url));
let checks=0;const same=(actual,expected,message)=>{checks++;assert.deepEqual(actual,expected,message);};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
export function harness(options={}){
 const h={clock:0,starts:0,opens:0,closes:0,permissions:0,finished:0,reservations:0,gateCalls:0,updatesAfterUnmount:0,modelsEnabled:true,drafts:[],navigations:[],events:[],stageLogs:[],partialText:'synthetic partial',finalText:'synthetic owner response'};
 const slots=[],effects=[],queued=[],modules=new Map();let cursor=0,effectCursor=0,dirty=false,unmounted=false,serial=0,appEvent;
 const context={key:'pane-A',generation:1,frameId:'frame-A',labels:[{key:'pane-A',label:'API'}]};
 const react={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{if(unmounted)h.updatesAfterUnmount++;slots[i]=typeof value==='function'?value(slots[i]):value;dirty=true;}];},
  useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
  useEffect(fn,deps){const i=effectCursor++,previous=effects[i];if(!previous||deps.some((value,j)=>!Object.is(value,previous.deps[j])))queued.push(()=>{previous?.cleanup?.();effects[i]={deps,cleanup:fn()};});},
 };
 const mic={permission:async()=>{h.permissions++;return h.permissionGate?await h.permissionGate.promise:true;},open:async(data,interrupt)=>{h.opens++;h.data=data;h.interrupt=interrupt;return true;},close:()=>{h.closes++;}};
 const channel={hostId:'fixture-host',generation:1,confirmedAt:1000,agents:[],transport:{async request(method,params){
  if(method==='speech.models.list')return{enabled:h.modelsEnabled,selectedModelId:'fixture-local',models:[{id:'fixture-local',provider:'local',status:'ready'}]};
  if(method==='speech.dictation.start'){h.starts++;return{dictationId:params.dictationId,modelId:'fixture-local'};}
  if(method==='speech.dictation.chunk')return{dictationId:params.dictationId,text:h.partialText};
  if(method==='speech.dictation.finish')return{dictationId:params.dictationId,text:h.finalText};
  if(method==='speech.dictation.cancel')return{};
  throw new Error('Unapproved synthetic network operation: '+method);
 }}};
 const session={actionChannel:()=>channel};
 const appState={currentState:'active',addEventListener(_name,fn){appEvent=fn;return{remove(){appEvent=undefined;}};}};
 const DatePort=class extends Date{static now(){return 1000;}};
 function load(file){
  if(modules.has(file))return modules.get(file).exports;
  const module={exports:{}};modules.set(file,module);
  const source=readFileSync(file,'utf8');
  const code=ts.transpileModule(source,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const req=name=>{
   if(name==='react')return react;if(name==='react-native')return{AppState:appState};
   if(name==='expo-crypto')return{randomUUID:()=>`fixture-dictation-${++serial}`};
   if(name==='../i18n/provider')return{useMessages:()=>({t:key=>key})};
   if(name==='../adapters/native-microphone')return{createNativeMicrophone:()=>mic};
   if(name==='../adapters/host-dictation'){
    const Real=load(resolve(root,'adapters/host-dictation.ts')).HostDictation;
    return{HostDictation:class extends Real{constructor(...args){super(...args);h.voice=this;}}};
   }
   if(name.startsWith('.')){
    const base=resolve(dirname(file),name),target=[base+'.ts',base+'.tsx',base+'/index.ts'].find(existsSync);
    if(!target)throw new Error('Missing controlled source: '+name);return load(target);
   }
   throw new Error('Unmocked dependency: '+name);
  };
  vm.runInNewContext('(function(require,module,exports){'+code+'})',{setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);timer.unref();return timer;},clearTimeout,performance:{now:()=>h.clock},Date:DatePort,Uint8Array,Buffer,btoa,atob,console:{...console,info:(...args)=>h.stageLogs.push(args)}},{filename:file})(req,module,module.exports);
  return module.exports;
 }
 const inbox=load(resolve(root,'core/voice-draft-inbox.ts'));
 h.inbox=inbox.emptyVoiceDraftInbox();
 const hook=load(resolve(root,'ui/use-global-deck-voice.ts')).useGlobalDeckVoice;
 let props={session,enabled:true,confirmationOpen:false,captureAvailable:true,getContext:()=>context,
  onCaptureStart(){const result=inbox.beginVoiceCapture(h.inbox);if(!result.started)return false;h.inbox=result.state;h.reservations++;h.captureId=result.captureId;props={...props,captureAvailable:false};dirty=true;return true;},
  onCaptureFinished(){h.events.push('finished');h.finished++;h.inbox=inbox.cancelVoiceCapture(h.inbox,h.captureId);props={...props,captureAvailable:true};dirty=true;},
  onDraft(draft,meta){h.events.push('draft');h.drafts.push({draft,meta});const result=inbox.appendVoiceDraft(h.inbox,draft,h.captureId);assert.equal(result.accepted,true);h.inbox=result.state;},
  onNavigate(intent){h.captureDuringNavigation=h.api.isCapturing();h.events.push('navigate');h.navigations.push(intent);},
  ...options,
 };
 h.render=()=>{cursor=0;effectCursor=0;dirty=false;h.api=hook(props);while(queued.length)queued.shift()();};
 h.flush=async()=>{for(let i=0;i<24;i++){await Promise.resolve();if(dirty&&!unmounted)h.render();}};
 h.update=patch=>{props={...props,...patch};h.render();};
 h.context=context;h.session=session;
 h.emitAppState=state=>{appState.currentState=state;appEvent?.(state);};
 h.unmount=()=>{unmounted=true;for(const effect of effects)effect?.cleanup?.();};
 h.render();return h;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
{
 const gate=deferred();const h=harness({beforeCapture:()=>gate.promise});await h.flush();
 h.api.pressIn();h.clock=10;h.api.pressOut();await h.flush();
 same(h.starts,0,'waiting for confirmed TTS stop must not start host dictation');
 same(h.api.snapshot.phase,'starting','pending audio gate is visible as starting');
 same(h.inbox.activeCaptureId!==null,true,'pending audio gate retains the inbox reservation');
 gate.resolve(true);await h.flush();same(h.opens,1,'confirmed audio gate starts one microphone');
 h.api.pressIn();h.api.pressOut();await h.flush();same(h.finished,1,'completed capture releases the reservation once');
 h.unmount();
}
for(const outcome of ['false','throw']){
 const gate=deferred();const h=harness({beforeCapture:()=>gate.promise});await h.flush();
 h.api.pressIn();h.clock=1;h.api.pressOut();await h.flush();
 await h.voice.refresh();await h.flush();
 same([h.api.snapshot.phase,h.finished,h.inbox.activeCaptureId!==null],['starting',0,true],'idle refresh cannot settle a gate-waiting reservation');
 if(outcome==='false')gate.resolve(false);else gate.reject(new Error('synthetic audio gate'));
 await h.flush();same([h.starts,h.opens,h.permissions],[0,0,0],'refused/throwing audio gate cannot start microphone permission or host capture');
 same([h.finished,h.inbox.activeCaptureId,h.drafts.length],[1,null,0],'refused gate releases its exact reservation once without inventing a draft');h.unmount();
}
for(const hold of [349,350]){
 const gate=deferred();const h=harness({beforeCapture:()=>gate.promise});await h.flush();
 h.api.pressIn();h.clock=hold;h.api.pressOut();await h.flush();
 same([h.api.snapshot.phase,h.finished,h.inbox.activeCaptureId!==null],['starting',0,true],'held pending start retains its virtual starting reservation');
 gate.resolve(true);await h.flush();
 if(hold===350){same([h.starts,h.opens,h.finished,h.inbox.activeCaptureId],[0,0,1,null],'release at 350ms before audio gate completion never starts a late recording');}
 else{same([h.starts,h.opens,h.finished],[1,1,0],'349ms keeps toggle capture pending until the gate confirms');h.api.pressIn();h.api.pressOut();await h.flush();same([h.drafts.length,h.finished],[1,1],'toggle completion retains the real final draft');}
 h.unmount();
}
{
 const gate=deferred();const h=harness({beforeCapture:()=>gate.promise});await h.flush();
 h.api.pressIn();h.clock=10;h.api.pressOut();await h.flush();
 h.modelsEnabled=false;await h.voice.refresh();await h.flush();
 same([h.api.snapshot.phase,h.api.available,h.finished],['starting',true,0],'waiting PTT remains stoppable even if an idle model refresh becomes unavailable');
 h.api.pressIn();h.api.pressOut();await h.flush();same([h.reservations,h.finished],[1,0],'a rapid second tap requests finish without another reservation');
 gate.resolve(true);await h.flush();same([h.starts,h.opens,h.finished,h.inbox.activeCaptureId],[0,0,1,null],'second tap while waiting prevents late recording and settles once');h.unmount();
}
for(const cancel of ['explicit','background','inactive','disabled','confirmation','generation','generation-without-render','session']){
 const gate=deferred();const h=harness({beforeCapture:()=>gate.promise});await h.flush();
 h.api.pressIn();h.clock=10;h.api.pressOut();await h.flush();
 if(cancel==='explicit')h.api.cancelCapture();
 if(cancel==='background'||cancel==='inactive')h.emitAppState(cancel);
 if(cancel==='disabled')h.update({enabled:false});
 if(cancel==='confirmation')h.update({confirmationOpen:true});
 if(cancel==='generation'){h.context.generation=2;h.render();}
 if(cancel==='generation-without-render')h.context.generation=2;
 if(cancel==='session')h.update({session:{actionChannel:()=>h.session.actionChannel()}});
 await h.flush();same([h.finished,h.inbox.activeCaptureId!==null],[0,true],'cancellation during bounded audio gate preserves reservation until gate settles');
 gate.resolve(true);await h.flush();same([h.starts,h.opens,h.permissions,h.finished,h.inbox.activeCaptureId],[0,0,0,1,null],'canceled/background/changed source cannot start from a late successful gate');
 h.api.cancelCapture();await h.flush();same(h.finished,1,'duplicate cancellation cannot release another reservation');h.unmount();
}
{
 const gate=deferred();const h=harness({beforeCapture:()=>gate.promise});await h.flush();
 h.api.pressIn();h.clock=10;h.api.pressOut();await h.flush();h.unmount();
 same([h.finished,h.inbox.activeCaptureId],[1,null],'unmount explicitly releases its pending reservation once');
 gate.resolve(true);await h.flush();same([h.starts,h.opens,h.finished,h.updatesAfterUnmount,h.drafts.length],[0,0,1,0,0],'late gate after unmount neither records nor updates UI nor duplicates draft/release');
}
{
 const gate=deferred();let newFinished=0,newGateCalls=0;
 const h=harness({beforeCapture:()=>gate.promise});await h.flush();
 h.api.pressIn();h.clock=10;h.api.pressOut();await h.flush();
 h.context.key='pane-B';h.context.frameId='frame-B';h.context.labels[0].label='changed label';
 h.update({beforeCapture:async()=>{newGateCalls++;return true;},onCaptureFinished:()=>{newFinished++;}});
 gate.resolve(true);await h.flush();same([h.starts,h.opens,newGateCalls],[1,1,0],'pressed run awaits its original gate callback');
 h.api.pressIn();h.api.pressOut();await h.flush();
 same([h.drafts[0].draft.targetKey,h.drafts[0].draft.generation,h.drafts[0].draft.frameId],['pane-A',1,'frame-A'],'completed draft keeps the copied context from the original press');
 same([h.drafts[0].draft.destinationResolved,h.drafts[0].meta.completed],[false,false],'changed starting target is retained without an automatic confirmation');
 same([h.finished,newFinished,h.events],[1,0,['draft','finished']],'draft arrives before the original reserved-owner finish callback');h.unmount();
}
{
 const h=harness();await h.flush();h.permissionGate=deferred();
 h.api.pressIn();h.clock=350;h.api.pressOut();await h.flush();
 same([h.starts,h.permissions,h.api.snapshot.phase],[0,1,'idle'],'hold release during permission stops preparation immediately');
 h.emitAppState('inactive');h.permissionGate.resolve(true);h.emitAppState('active');await h.flush();
 same([h.opens,h.drafts.length,h.finished],[0,0,1],'a delayed permission response cannot start recording after the held press has ended');h.unmount();
}
for(const cleanup of ['cancel','unmount']){
 const h=harness({beforeCapture:async()=>true});await h.flush();h.partialText='next';
 h.api.pressIn();h.clock=10;h.api.pressOut();await h.flush();h.data(new Uint8Array(16000));await h.flush();
 if(cleanup==='cancel')h.api.cancelCapture();else h.unmount();await h.flush();
 same([h.drafts.length,h.navigations.length,h.finished,h.inbox.entries.length],[1,0,1,1],'canceled/unmounted partial remains one inbox draft and never becomes navigation');
 same([h.drafts[0].draft.text,h.drafts[0].draft.targetKey,h.drafts[0].draft.destinationResolved,h.drafts[0].meta.completed],['next','pane-A',false,false],'partial text and original target are preserved with incomplete provenance');
 if(cleanup==='cancel')h.unmount();same(h.updatesAfterUnmount,0,'cleanup publishes no React state after unmount');
}
{
 const h=harness();await h.flush();h.api.pressIn();h.clock=10;h.api.pressOut();await h.flush();h.api.pressIn();h.api.pressOut();await h.flush();
 same([h.inbox.entries.length,h.finished],[1,1],'first real capture produces the retained owner draft');
 const gate=deferred();h.update({beforeCapture:()=>gate.promise});h.clock=100;h.api.pressIn();h.clock=110;h.api.pressOut();await h.flush();
 await h.voice.refresh();await h.flush();same([h.drafts.length,h.finished,h.inbox.activeCaptureId!==null,h.api.snapshot.text],[1,1,true,''],'pending refresh never re-delivers or displays an old retained draft as a new capture');
 gate.resolve(false);await h.flush();same([h.drafts.length,h.inbox.entries.length,h.finished,h.inbox.activeCaptureId],[1,1,2,null],'rejected gate preserves existing draft without copying it to another inbox entry');h.unmount();
}
{
 const h=harness();await h.flush();h.api.pressIn();h.clock=10;h.api.pressOut();await h.flush();
 h.context.key='pane-B';h.render();h.context.key='pane-A';h.render();
 h.api.pressIn();h.api.pressOut();await h.flush();
 same([h.drafts[0].draft.targetKey,h.drafts[0].draft.destinationResolved,h.drafts[0].meta.completed],['pane-A',false,false],'A to B to A during capture cannot restore automatic target authority');
 h.unmount();
}
for(const lost of ['missing','duplicate']){
 const h=harness();await h.flush();h.api.pressIn();h.clock=10;h.api.pressOut();await h.flush();
 const original=[...h.context.labels];h.context.labels=lost==='missing'?[]:[...original,...original];h.render();
 h.context.labels=original;h.render();h.api.pressIn();h.api.pressOut();await h.flush();
 same([h.drafts[0].draft.targetKey,h.drafts[0].draft.destinationResolved,h.drafts[0].meta.completed],['pane-A',false,false],lost+' captured pane cannot regain authority merely by reappearing');
 h.unmount();
}
{
 const h=harness();await h.flush();h.finalText='next';
 h.api.pressIn();h.clock=10;h.api.pressOut();await h.flush();h.api.pressIn();h.api.pressOut();await h.flush();
 same(h.captureDuringNavigation,false,'a completed spoken navigation command runs after the capture lock is released');
 same([h.navigations.length,h.finished,h.drafts.length],[1,1,0],'post-recording navigation remains available without making a prompt');h.unmount();
}
for(const navigate of [true,false]){
 const h=harness();await h.flush();h.context.key=null;h.render();h.finalText=navigate?'next':'Untargeted owned draft';
 h.api.pressIn();h.clock=10;h.api.pressOut();await h.flush();h.api.pressIn();h.api.pressOut();await h.flush();
 same(h.navigations.length,navigate?1:0,'no starting selection must not suppress a completed navigation command');
 if(!navigate)same([h.drafts[0].draft.targetKey,h.drafts[0].draft.destinationResolved,h.drafts[0].draft.targetChanged??false],[null,false,false],'an untargeted draft is not falsely classified as a changed target');
 same([h.finished,h.api.isCapturing()],[1,false],'untargeted capture releases once');h.unmount();
}
console.log(`PASS: ${checks} global voice audio-start assertions (actual hook/gesture/controller; controlled ports)`);

}
