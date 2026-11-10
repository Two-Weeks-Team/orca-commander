import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

// Actual provider and ActionComposer send handler, with fake hooks/ports. No native mount,
// real storage, host channel, network or device. Deferred accepted results are synthetic.
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../src/',import.meta.url));
const sources=new Map(),digest=value=>createHash('sha256').update(value).digest('hex');
const read=file=>{const source=readFileSync(file,'utf8');sources.set(file,source);return source;};
const composerText=read(resolve(root,'ui/action-composer.tsx'));
const composerSource=ts.createSourceFile('action-composer.tsx',composerText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let sendText;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(composerSource)==='send')sendText=node.initializer?.getText(composerSource);ts.forEachChild(node,visit);}visit(composerSource);assert.ok(sendText);
const compile=(source,file='fixture.ts')=>ts.transpileModule(source,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const walk=node=>Array.isArray(node)?node.flatMap(walk):node?.props?[node,...walk(node.props.children)]:[];
let count=0;const same=(actual,expected,label)=>{count++;assert.deepEqual(actual,expected,label);};
const Composer=()=>null;
function owner(){
 const slots=[],cache=new Map();let cursor=0;
 const react={createContext:()=>({Provider:'FixtureContext'}),useContext(){throw Error('unused')},useEffect(){},
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
  useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});}};
 function load(file){if(cache.has(file))return cache.get(file);const module={exports:{}};cache.set(file,module.exports);
  const code=compile(read(file),file),req=name=>{
   if(name==='react')return react;if(name==='react-native')return{Keyboard:{dismiss(){}},KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'ios'},Modal:'Modal',Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',TextInput:'TextInput',View:'View'};
   if(name==='react-native-safe-area-context')return{SafeAreaProvider:'SafeAreaProvider',SafeAreaView:'SafeAreaView'};
   if(name==='../i18n/provider')return{useMessages:()=>({t:key=>key})};
   if(name==='./action-composer')return{ActionComposer:Composer};if(name==='./theme')return{S:{}};
   if(name.startsWith('.')){const base=resolve(dirname(file),name),found=[base,base+'.ts',base+'.tsx'].find(existsSync);return load(found);}
   return require(name);
  };vm.runInNewContext('(function(require,module,exports){'+code+'})',{Date,Map,Object,Number,JSON},{filename:file})(req,module,module.exports);return module.exports;
 }
 const Provider=load(resolve(root,'ui/deck-input-sheet.tsx')).DeckInputProvider,now=Date.now(),generation=7;
 const agent=id=>({id,provider:'codex',title:'Full fixture '+id,state:'working',target:{hostId:'fixture-host',worktreeId:'fixture-worktree',terminalId:id,dispatchId:'dispatch-'+id,connectionGeneration:generation}});
 const A=agent('A'),B=agent('B'),snapshot={phase:'live',connection:{paired:true,online:true,hostId:'fixture-host',generation,lastConfirmedAt:new Date(now).toISOString()},host:{hostId:'fixture-host'},inventory:{hostId:'fixture-host',generation,observedAt:now,worktreeIds:['fixture-worktree']},agents:[A,B]};
 let props={snapshot,session:{},client:{},presentationKey:'fixture-deck',children:null};
 const render=()=>{cursor=0;return Provider(props);};
 const port=()=>render().props.value,composer=()=>walk(render()).find(node=>node.type===Composer);
 return{A,B,generation,port,composer,ageRead:()=>{const at=now-300000;snapshot.connection.lastConfirmedAt=new Date(at).toISOString();snapshot.inventory.observedAt=at;},entries:()=>slots[0].current,render,voiceFlow:load(resolve(root,'core/voice-confirmation.ts')).createVoiceConfirmation,setPresentation:key=>{props={...props,presentationKey:key};}};
}
function send(props){
 let finish;const pending=new Promise(resolve=>{finish=resolve;}),calls=[],mutations=[],canceled=[];
 const confirmation=Object.freeze({id:'fixture-confirmation',text:props.initialText}),mounted={current:true};
 const environment={result:undefined,resultRef:{current:undefined},sending:{current:false},setResult:value=>mutations.push(['result',value]),confirmation,confirmationRef:{current:confirmation},busy:false,blocked:false,context:{isCurrent:()=>true},armed:{current:Symbol()},cancel(){throw Error('unexpected cancel')},
  client:{confirm:async value=>{calls.push(value);return pending;},cancel:value=>canceled.push(value)},AppState:{currentState:'active'},mounted,
  draft:{current:{text:props.initialText,origin:props.initialOrigin}},rememberDraft:{current:props.onDraftChange},captureAcceptedDraft:props.captureAcceptedDraft,captureVoiceReply:props.captureVoiceReply,agent:props.agent,
  setBusy:value=>mutations.push(['busy',value]),setConfirmation:value=>mutations.push(['confirmation',value]),setNotice:value=>mutations.push(['notice',value]),setText:value=>mutations.push(['text',value]),setOrigin:value=>mutations.push(['origin',value]),actionOutcomeKey:()=> 'input.accepted'};
 const module={exports:undefined};vm.runInNewContext(compile('module.exports=('+sendText+');'),{...environment,module});
 const task=module.exports();return{calls,mutations,canceled,environment,unmount(){mounted.current=false;},replaceCallback(callback){environment.rememberDraft.current=callback;},async finish(status='accepted'){finish({status});await task;}};
}
function open(o,text='Sent fixture draft',origin='typed'){o.port().open(o.A,o.generation,origin,text);return o.composer().props;}

// D19: preserve one already-open confirmation owner across the accepted draft clear.
{
 const o=owner(),props=open(o);props.onReviewVisibilityChange(true);const before=o.composer().key;
 const pending=send(o.composer().props);await pending.finish('accepted');
 same(o.composer().key,before,'accepted body clear must not replace the open confirmation modal owner');
 same(o.composer().props.initialText,'');same(o.port().savedDraftCount,0);
 same(pending.mutations.filter(([kind])=>kind==='confirmation').length,0,'send keeps the review mounted until its result');
 o.composer().props.onReviewResultClose();same(o.port().isOpen,false,'settled Close returns to the deck');
}
{
 const o=owner(),props=open(o);props.onReviewVisibilityChange(true);const pending=send(props);
 o.port().close();pending.unmount();o.port().open(o.B,o.generation,'typed','New B draft');const before=o.composer().key;
 props.onReviewVisibilityChange(true);await pending.finish();same(o.composer().key,before,'late visibility/results cannot pin a different owner');same(o.composer().props.initialText,'New B draft');
 props.onReviewResultClose();same(o.port().isOpen,true,'an old result Close cannot close a new owner');same(o.composer().props.initialText,'New B draft');
}
for(const status of ['unknown','partial']){
 const o=owner(),props=open(o);props.onReviewVisibilityChange(true);const before=o.composer().key,pending=send(props);await pending.finish(status);
 same(o.composer().key,before);same(o.composer().props.initialText,props.initialText,'uncertain outcomes retain the original draft');same(pending.calls.length,1);
 same(pending.mutations.filter(([kind])=>kind==='confirmation').length,0,'uncertain result does not dismiss the confirmation');
 same(pending.mutations.filter(([kind,value])=>kind==='result'&&value).at(-1)[1].status,status);
}
// Native result dismissal owns the parent until the child's onDismiss, including header/Back.
for(const parentRequest of ['port','header','back']){
 const o=owner(),props=open(o);props.onReviewVisibilityChange(true);const pinned=o.composer().key;
 const release=o.composer().props.onReviewResultClosing();same(typeof release,'function');
 if(parentRequest==='port')o.port().close();
 else if(parentRequest==='back')walk(o.render()).find(n=>n.type==='Modal').props.onRequestClose();
 else walk(o.render()).find(n=>n.props.testIDPrefix==='deck-input').props.onClose();
 same(o.port().isOpen,true,'parent close is inert during the child native transition');same(o.composer().key,pinned);
 release();props.onReviewResultClose();same(o.port().isOpen,false);release();props.onReviewResultClose();same(o.port().isOpen,false,'duplicate dismiss is inert');
}
{
 const o=owner(),props=open(o);props.onReviewVisibilityChange(true);const pinned=o.composer().key,release=o.composer().props.onReviewResultClosing();
 o.port().open(o.B,o.generation,'typed','Queued B draft');same(o.composer().key,pinned,'queued new draft cannot unmount a dismissing child');
 same([...o.entries().values()].find(e=>e.original.id==='B').text,'Queued B draft','incoming text is retained immediately');
 release();props.onReviewResultClose();same(o.port().isOpen,true,'stale owner cannot close the queued new owner');same(o.composer().props.initialText,'Queued B draft');
}
// Original defect: the child unmounts before acceptance; the closed owner's saved draft must clear.
{
 const o=owner(),props=open(o),pending=send(props);same(pending.calls.length,1);o.port().close();pending.unmount();const before=pending.mutations.length;await pending.finish();
 same(o.port().savedDraftCount,0,'accepted original draft clears after child unmount');same(pending.mutations.length,before,'no React state writes after unmount');
 same([...o.entries().values()][0].text,'');
}
// Send captures the original owner, never a newer callback/selected target.
{
 const o=owner(),props=open(o),pending=send(props);pending.unmount();o.port().close();o.port().open(o.B,o.generation,'typed','New B body');const B=o.composer().props;
 pending.replaceCallback(B.onDraftChange);await pending.finish();same(o.port().savedDraftCount,1);same(o.composer().props.initialText,'New B body');same([...o.entries().values()].find(entry=>entry.original.id==='A').text,'');
}
// The same bind identity at a new generation is a separate owner, not a migration target.
{
 const o=owner(),props=open(o),pending=send(props);pending.unmount();o.port().close();
 const next={...o.A,target:{...o.A.target,connectionGeneration:o.generation+1}};
 o.port().open(next,o.generation+1,'typed','New generation body');await pending.finish();
 const entries=[...o.entries().values()];same(entries.find(entry=>entry.generation===o.generation).text,'');same(entries.find(entry=>entry.generation===o.generation+1).text,'New generation body');same(o.port().savedDraftCount,1);
}
// A reopened editor with real edits, including an ABA edit back to the sent text, retains them.
for(const aba of [false,true]){
 const o=owner(),props=open(o),pending=send(props);o.port().close();pending.unmount();o.port().open(o.A,o.generation);const reopened=o.composer().props;
 reopened.onDraftChange('New manual body','typed');if(aba)reopened.onDraftChange(props.initialText,'typed');await pending.finish();
 same(o.composer().props.initialText,aba?props.initialText:'New manual body');same(o.port().savedDraftCount,1);
}
// A reopen/no-op mount callback is not an edit and may still clear the exact accepted body.
{
 const o=owner(),props=open(o),pending=send(props);o.port().close();pending.unmount();o.port().open(o.A,o.generation);const reopened=o.composer().props,key=o.composer().key;
 reopened.onDraftChange(reopened.initialText,reopened.initialOrigin);await pending.finish();same(o.port().savedDraftCount,0);same(o.composer().props.initialText,'');same(o.composer().key===key,false,'clear remounts a currently reopened unchanged editor');
 reopened.onDraftChange(reopened.initialText,reopened.initialOrigin);same(o.port().savedDraftCount,0,'old epoch callback cannot resurrect an accepted draft');
}
// Incoming voice appends or retained edited payloads belong to a later epoch and remain intact.
for(const retained of [false,true]){
 const o=owner();o.port().open(o.A,o.generation,'voice','Voice source','voice-id');const props=o.composer().props,pending=send(props);pending.unmount();o.port().close();
 o.port().open(o.A,o.generation,'voice',retained?'Edited source payload':'New transcript',retained?'voice-id':'new-id');const current=[...o.entries().values()][0],text=current.text;
 await pending.finish();const saved=[...o.entries().values()][0];same(saved.text,text);same(saved.retained.length,retained?1:0);if(retained)same(saved.retained[0].text,'Edited source payload');same(o.port().savedDraftCount,1);
}
// Already retained payloads survive clearing an otherwise unchanged accepted primary body.
{
 const o=owner();o.port().open(o.A,o.generation,'voice','Original body','voice-id');o.port().open(o.A,o.generation,'voice','Retained edited payload','voice-id');const before=[...o.entries().values()][0],props=o.composer().props,pending=send(props);o.port().close();pending.unmount();await pending.finish();
 const saved=[...o.entries().values()][0];same(saved.text,'');same(saved.retained.length,1);same(saved.retained[0].text,'Retained edited payload');same(saved.original===before.original,true);same(saved.retained===before.retained,true);same(saved.incoming===before.incoming,true);same(saved.original.target.terminalId,'A');same(saved.generation,o.generation);same(o.port().savedDraftCount,1);
}
// If the editor's own draft advances while awaiting acceptance, only its sent version may clear.
{
 const o=owner(),props=open(o),pending=send(props);const newer={text:'New same-child voice partial',origin:'voice'};
 pending.environment.draft.current=newer;props.onDraftChange(newer.text,newer.origin);await pending.finish();
 same(pending.environment.draft.current===newer,true);same(o.composer().props.initialText,newer.text);
 same(pending.mutations.some(([kind])=>kind==='text'||kind==='origin'),false);
}
for(const status of ['unknown','partial','refused']){
 const o=owner(),props=open(o),pending=send(props);o.port().close();pending.unmount();await pending.finish(status);same(o.port().savedDraftCount,1);same([...o.entries().values()][0].text,props.initialText);
}
// Preparation belongs to the retained owner epoch; remounting cannot repeat its automatic prompt.
{
 const o=owner();o.port().open(o.A,o.generation,'voice','Voice source','auto-once',{autoPrepare:true});
 const props=o.composer().props;same(props.autoPrepare,true);same(typeof props.consumeAutoPrepare,'function');
 same(props.consumeAutoPrepare(),true);same(props.consumeAutoPrepare(),false);
 o.port().open(o.A,o.generation,'voice','Voice source','auto-once',{autoPrepare:true});
 same(o.composer().props.autoPrepare,false,'duplicate incoming transcript cannot re-arm a consumed epoch');
 o.port().close();o.port().open(o.A,o.generation);same(o.composer().props.autoPrepare,false);
 o.port().open(o.A,o.generation,'voice','Second source','auto-next',{autoPrepare:true});
 same(props.consumeAutoPrepare(),false,'old epoch cannot consume a new transcript');
 same(o.composer().props.consumeAutoPrepare(),true);
}
// A scoped final answer joins the real typed send handler and compare-and-clear owner.
for(const [answer,changed,wanted] of [['send',false,1],['cancel',false,0],['send',true,0]]){
 const o=owner();o.port().open(o.A,o.generation,'voice','Voice source','spoken',{autoPrepare:true});
 const props=o.composer().props,epoch=o.composer().key,ticket=Object.freeze({id:'scoped-voice-fixture'});let finishSpeech,pending,sends=0;
 const spoken=new Promise(resolve=>{finishSpeech=resolve;});
 const flow=o.voiceFlow({now:()=>0,isCurrent:value=>value===ticket&&o.composer().key===epoch&&o.composer().props.initialText===props.initialText,
  speak:()=>spoken,listen:async()=>({kind:'final',text:answer}),cancelAudio(){},
  confirm:async()=>{sends++;pending=send(props);await pending.finish('accepted');}});
 const result=flow.start(ticket,'en');same(sends,0,'TTS is not submission authority');
 if(changed)props.onDraftChange('Newer body','voice');finishSpeech('finished');await result;
 same(sends,wanted);same(o.port().savedDraftCount,wanted?0:1);
 if(wanted)same(pending.calls[0].text,'Voice source');
 else same(o.composer().props.initialText,changed?'Newer body':'Voice source');
}
for(const [file,source]of sources)same(digest(readFileSync(file,'utf8')),digest(source),'source unchanged during run');
// Optional response speech observes the original accepted voice request, never typed/failed delivery.
for(const origin of ['voice','typed'])for(const status of ['accepted','unknown','refused']){
 const o=owner(),props=open(o,'Sent fixture draft',origin);let captured=0,notified=0;
 const pending=send({...props,initialOrigin:origin,captureVoiceReply:async(ticket,agent)=>{captured++;same(agent,props.agent,'reply observer keeps the original source pane');return()=>{notified++;};}});
 await pending.finish(status);same(captured,origin==='voice'?1:0);same(notified,origin==='voice'&&status==='accepted'?1:0);
}
{
 const o=owner(),props=open(o,'Sent fixture draft','voice');let release,notified=0;
 const pending=send({...props,initialOrigin:'voice',captureVoiceReply:()=>new Promise(resolve=>{release=resolve;})});
 same(pending.calls.length,0,'read-only baseline precedes submission');o.port().close();pending.unmount();release(()=>{notified++;});await pending.finish();
 same(notified,0,'closing before dispatch cannot arm response speech');same(pending.calls.length,0,'closing during baseline read cancels before dispatch');same(pending.canceled.length,1);same(o.port().savedDraftCount,1,'the canceled draft remains');
}
{
 const o=owner(),props=open(o,'Sent fixture draft','voice');let notified=0;
 const pending=send({...props,captureVoiceReply:async()=>()=>{notified++;}});
 await new Promise(resolve=>setImmediate(resolve));same(pending.calls.length,1,'an unchanged live intent dispatches after its baseline');pending.unmount();await pending.finish();same(notified,1,'already-dispatched acceptance keeps its original observer');
}
for(const changed of ['background','context']){
 const o=owner(),props=open(o,'Sent fixture draft','voice');let release;
 const pending=send({...props,captureVoiceReply:()=>new Promise(resolve=>{release=resolve;})});
 if(changed==='background')pending.environment.AppState.currentState='background';else pending.environment.context.isCurrent=()=>false;
 release(()=>{throw Error('must not notify');});await pending.finish();same(pending.calls.length,0,'a stale pre-dispatch intent cannot send');same(pending.canceled.length,1);
}
for(const armed of [true,false,undefined]){
 const o=owner(),props=open(o,'Sent fixture draft','voice');
 const pending=send({...props,initialOrigin:'voice',captureVoiceReply:async()=>()=>armed});await pending.finish('accepted');
 same(pending.mutations.filter(([kind,value])=>kind==='result'&&value).at(-1)[1].readReply,armed===true,'the reply hint requires successful activation after acceptance');
}
for(const failure of ['capture','notification']){
 const o=owner(),props=open(o,'Sent fixture draft','voice'),pending=send({...props,initialOrigin:'voice',captureVoiceReply:async()=>{if(failure==='capture')throw Error('optional read failed');return()=>{throw Error('optional notification failed');};}});
 await pending.finish();same(o.port().savedDraftCount,0,'optional speech failure cannot rewrite or block an accepted send');
}
{
 const o=owner();open(o,'Owner unsent draft','typed');const originalKey=[...o.entries().keys()][0];
 const originalEpoch=o.entries().get(originalKey).epoch;
 o.port().open(o.A,o.generation,'typed','이어서 계속 진행하세요',undefined,{autoPrepare:true,isolated:true});
 const current=o.composer().props;
 same(current.initialText,'이어서 계속 진행하세요','D26 review contains only the saved phrase, never an existing user draft');
 same(current.autoPrepare,true,'D26 goes directly to the existing confirmation owner');
 same(o.entries().get(originalKey).text,'Owner unsent draft','the original user draft is preserved');
 o.port().open(o.A,o.generation,'typed','Second phrase',undefined,{autoPrepare:true,isolated:true});
 same(o.composer().props.initialText,'Second phrase','a later shortcut does not append to an unsubmitted shortcut');
 same(o.port().savedDraftCount,1,'shortcut drafts do not become saved owner input');
 o.port().close();same(o.entries().size,1,'closing discards all one-off shortcut entries');
 for(let i=0;i<3;i++){
  o.port().open(o.A,o.generation,'typed','One-off phrase',undefined,{autoPrepare:true,isolated:true});
  // Confirmation cancellation leaves its editor visible; even manual changes remain one-off.
  o.composer().props.onReviewVisibilityChange(false);o.composer().props.onDraftChange('Edited one-off phrase','typed');o.port().close();
  same(o.port().savedDraftCount,1,'cancel then close never accumulates shortcut drafts');
  same(o.entries().get(originalKey).text,'Owner unsent draft');same(o.entries().get(originalKey).epoch,originalEpoch);
 }
 o.port().open(o.A,o.generation,'typed','One-off phrase',undefined,{autoPrepare:true,isolated:true});o.port().openSavedDrafts();same(o.entries().size,1,'opening saved input discards the shortcut');
 o.port().open(o.A,o.generation,'typed','One-off phrase',undefined,{autoPrepare:true,isolated:true});o.port().open(o.B,o.generation,'typed','Other owner input');same(o.entries().size,2,'switching to another input preserves owner drafts and discards shortcuts');
 o.port().open(o.A,o.generation,'typed','One-off phrase',undefined,{autoPrepare:true,isolated:true});
 const saved=walk(o.render()).find(n=>n.props.testID==='deck-input-saved-list');saved.props.onPress();same(o.entries().size,2);
}
{const o=owner();o.port().open(o.A,o.generation,'typed','Slow owner review');same(o.composer()?.props.live,true);o.ageRead();same(o.composer()?.props.live,true,'D29 read age alone cannot remove the held editor; its owner must reread before send');}
console.log(`PASS: ${count} accepted draft owner assertions (actual source; fake hooks, no native mount/host/storage)`);
