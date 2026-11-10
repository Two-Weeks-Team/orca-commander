import assert from 'node:assert/strict';
import {createPttGesture,routeCapturedVoice} from '../src/core/ptt-gesture';
let count=0;const same=(a:unknown,b:unknown)=>{count++;assert.deepEqual(a,b);};
let now=0,phase='idle',starts=0,finishes=0,cancels=0,enabled=true;
const gesture=createPttGesture({now:()=>now,enabled:()=>enabled,phase:()=>phase,start:()=>{starts++;phase='loading';},finish:()=>{finishes++;phase='finishing';},cancel:()=>{cancels++;phase='idle';}});
gesture.pressIn();same(starts,1); // no threshold delay before capture request
now=349;gesture.pressOut();same(finishes,0);
phase='recording';gesture.observe(phase);same(finishes,0);
gesture.pressIn();same(finishes,1);gesture.pressOut();same(finishes,1);same(starts,1);
phase='draft';gesture.observe(phase);
now=1000;gesture.pressIn();now=1350;gesture.pressOut();same(finishes,2); // a held release stops preparation immediately
phase='recording';gesture.observe(phase);same(finishes,2);
gesture.observe(phase);gesture.pressOut();gesture.pressIn();same(finishes,2);same(starts,2);
phase='draft';gesture.observe(phase);
now=2000;gesture.pressIn();phase='recording';gesture.observe(phase);now=2350;gesture.pressOut();same(finishes,3);
phase='draft';gesture.observe(phase);
now=3000;gesture.pressIn();gesture.cancel();gesture.cancel();same(cancels,1);
phase='recording';gesture.observe(phase);same(finishes,3); // canceled startup cannot finish later
enabled=false;gesture.pressIn();same(starts,4);
enabled=true;phase='idle';gesture.observe(phase);gesture.pressIn();gesture.pressIn();same(starts,5);now+=349;gesture.pressOut();gesture.pressIn();same(starts,5); // second tap during startup queues one stop
phase='recording';gesture.observe(phase);same(finishes,4);
phase='error';gesture.observe(phase);gesture.cancel();same(cancels,1);
const context={key:'starting-pane',generation:2,frameId:'frame-start',labels:[{key:'a',label:'API'}]};
same(routeCapturedVoice('next',context,false),{kind:'navigate',intent:{kind:'focus.step',direction:'next'}});
for(const text of ['Go to the login page and fix the failing tests','이 옵션을 선택','go to API']){
 const source=text==='go to API'?{...context,labels:[{key:'a',label:'API'},{key:'b',label:'API'}]}:context;
 same(routeCapturedVoice(text,source,false),{kind:'draft',draft:{text,targetKey:'starting-pane',generation:2,frameId:'frame-start',ambiguous:true,destinationResolved:false}});
}
same(routeCapturedVoice('send',context,false),{kind:'draft',draft:{text:'send',targetKey:'starting-pane',generation:2,frameId:'frame-start',ambiguous:false,destinationResolved:true}});
same(routeCapturedVoice('next',context,true),{kind:'draft',draft:{text:'next',targetKey:'starting-pane',generation:2,frameId:'frame-start',ambiguous:false,destinationResolved:false}});
same(routeCapturedVoice('original unchanged',{key:null,generation:2,labels:[]},false),{kind:'draft',draft:{text:'original unchanged',targetKey:null,generation:2,frameId:undefined,ambiguous:false,destinationResolved:false}});
// Current label evidence can change during capture; draft provenance stays at the starting frame.
const afterCaptureDuplicate=[...context.labels,{key:'added-after-start',label:'API'}];
same(routeCapturedVoice('go to API',context,false,afterCaptureDuplicate),{kind:'draft',draft:{text:'go to API',targetKey:'starting-pane',generation:2,frameId:'frame-start',ambiguous:true,destinationResolved:false}});
same(routeCapturedVoice('go to API',context,false,[]),{kind:'draft',draft:{text:'go to API',targetKey:'starting-pane',generation:2,frameId:'frame-start',ambiguous:true,destinationResolved:false}});
same(routeCapturedVoice('go to newly visible',context,false,[{key:'current-only',label:'newly visible'}]),{kind:'navigate',intent:{kind:'focus.select',key:'current-only'}});
same(routeCapturedVoice('keep exact owner draft',context,false,[]),{kind:'draft',draft:{text:'keep exact owner draft',targetKey:'starting-pane',generation:2,frameId:'frame-start',ambiguous:false,destinationResolved:false}});
console.log(`PASS: ${count} PTT gesture and captured draft assertions (pure; no microphone or host)`);

// Integrate the real asynchronous dictation controller: release may precede model/start/microphone readiness.
import {HostDictation,type Microphone} from '../src/adapters/host-dictation';
import type {ActionChannel} from '../src/adapters/action-client';
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
async function asyncStartup(){
 let resolveModels!:(value:unknown)=>void,resolveOpen!:(value:boolean)=>void;
 let clock=0,finishCalls=0,startCalls=0,closeCalls=0,cancelCalls=0;
 let interrupt=()=>{};
 const mic:Microphone={permission:async()=>true,open:async(_data,onInterrupt)=>{interrupt=onInterrupt;return new Promise(resolve=>{resolveOpen=resolve;});},close:()=>{closeCalls++;}};
 const model={enabled:true,selectedModelId:'selected',models:[{id:'selected',provider:'local',status:'ready'}]};
 let models:Promise<unknown>|unknown=new Promise(resolve=>{resolveModels=resolve;});
 const channel:ActionChannel={runtimeId:'runtime-fixture',hostId:'fixture-host',generation:1,confirmedAt:0,agents:[],transport:{async request(method,params){
  if(method==='speech.models.list')return models;
  if(method==='speech.dictation.start'){startCalls++;return{dictationId:params?.dictationId,modelId:'selected'};}
  if(method==='speech.dictation.finish'){finishCalls++;return{dictationId:params?.dictationId,text:'editable original'};}
  if(method==='speech.dictation.cancel'){cancelCalls++;return{};}
  throw new Error('unexpected speech operation');
 }}};
 const voice=new HostDictation(()=>channel,mic,()=> 'fixture-dictation',()=>clock);
 const ptt=createPttGesture({now:()=>clock,enabled:()=>true,phase:()=>voice.getSnapshot().phase,start:()=>{void voice.start();},finish:()=>{void voice.finish();},cancel:()=>{void voice.cancel();}});
 const off=voice.subscribe(snapshot=>ptt.observe(snapshot.phase));
 ptt.pressIn();await flush();clock=350;ptt.pressOut();same(voice.getSnapshot().phase,'idle');same(finishCalls,0);
 resolveOpen(true);resolveModels(model);await flush();same(startCalls,0);same(finishCalls,0); // canceled native init cannot launch late
 models=model;clock=1000;ptt.pressIn();clock=1349;ptt.pressOut();await flush();resolveOpen(true);await flush();same(voice.getSnapshot().phase,'recording');same(finishCalls,0);
 ptt.pressIn();ptt.pressOut();await flush();same(finishCalls,1);same(startCalls,1);
 clock=2000;ptt.pressIn();await flush();ptt.cancel();ptt.cancel();resolveOpen(true);await flush();same(finishCalls,1);same(cancelCalls,0);same(voice.getSnapshot().phase,'idle');
 clock=3000;ptt.pressIn();await flush();resolveOpen(true);await flush();interrupt();await flush();same(voice.getSnapshot().phase,'error');same(finishCalls,1);same(cancelCalls,1);same(closeCalls>0,true);
 off();
 console.log(`PASS: ${count} total PTT gesture, async startup and captured draft assertions (fake host/microphone)`);
}
void asyncStartup();
