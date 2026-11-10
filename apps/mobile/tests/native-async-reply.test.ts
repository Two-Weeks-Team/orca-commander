import {projectNativeAsyncQuestions,formatNativeAsyncReply,readAsyncSendOutcome,readNativeAsyncEvidence} from '../src/adapters/native-async-reply';
import {readRequestEvidence,structuredFingerprint,type NativeTarget} from '../src/adapters/structured-request-wire';
import type {RpcTransport} from '../src/adapters/read-only-orca-client';
let n=0;const check=(v:unknown,m:string)=>{n++;if(!v)throw new Error(m);};
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const target:NativeTarget={worktreeId:'wt',tabId:'tab',sessionId:'codex_owned',agent:'codex',title:'Owner title /Users/owner/path'};
const row=(id:string,body:Record<string,unknown>)=>({itemId:id,revision:1,sequence:Number(id.replace(/\D/g,''))||1,observedAt:100,body});
const user=row('u1',{kind:'message',role:'user',blocks:[{type:'text',text:'Ask me'}]});
const ask=row('q2',{kind:'message',role:'assistant',blocks:[{type:'tool-call',name:'request_user_input_async',callId:'call1',input:{questions:[{title:'Choose\r\na path',options:['Alpha','Beta']},{title:'Explain',options:null}]}}]});
const page=()=>({sessionId:target.sessionId,epoch:'epoch',fence:3,hasOlder:false,hasNewer:false,items:clone([user,ask]),submissions:[] as Record<string,unknown>[],queuedMessages:[] as unknown[],latestTurn:{turn:{state:'completed'}}});
function projects(p:unknown){return projectNativeAsyncQuestions(p,target);}
async function main(){
 const q=projects(page());check(q?.length===1&&q[0].questions[1].title==='Explain','original assistant tool metadata yields complete owner questions');
 if(!q)throw new Error('no questions');
 check(formatNativeAsyncReply(q,[{option:1},{text:'  Because\nthis  '}])==='> Choose a path\n\nBeta\n\n> Explain\n\nBecause\nthis','original quote and selection/free-text format is exact');
 check(formatNativeAsyncReply(q,[{text:''},{text:' partial '}])==='> Explain\n\npartial','unanswered questions are omitted without invented answers');
 for(const answers of [[{option:2}],[],[{text:' '.repeat(5)}],[{text:'가'.repeat(90000)}]]){let rejected=false;try{formatNativeAsyncReply(q,answers);}catch{rejected=true;}check(rejected,'empty, unoffered or oversized answers cannot form a send');}
 for(const mutate of [(p:any)=>p.hasOlder=true,(p:any)=>p.hasNewer=true,(p:any)=>delete p.queuedMessages,(p:any)=>p.queuedMessages=[{}],(p:any)=>p.latestTurn.turn.state='running',(p:any)=>p.items[1].shortened=true,(p:any)=>p.items[1].body.blocks[0].input.questions[0].options=[4],(p:any)=>p.items.push(row('new3',{kind:'future-kind'})),(p:any)=>p.submissions=[{clientMessageId:'pending',dispatchState:'pending'}],(p:any)=>p.submissions=[{clientMessageId:'unknown',dispatchState:'unknown'}],(p:any)=>p.items[1].agentId='child',(p:any)=>p.items[1].body.blocks.push({type:'future-control'})]){
  const p=page();mutate(p);check(projects(p)===null,'unverified/clipped/queued/unsettled/unknown/child evidence stays closed');
 }
 for(const body of [{kind:'message',role:'user',blocks:[{type:'text',text:'Already answered'}]},{kind:'status',text:'Conversation interrupted'},{kind:'message',role:'system',blocks:[{type:'text',text:'Conversation interrupted'}]},{kind:'status',text:'Cleared',contextClear:{}}]){
  const p=page();p.items.push(row('r3',body));check(projects(p)?.length===0,'delivered human reply, interruption and context clear supersede old question');
 }
 {const p=page();p.items.push(row('a3',{kind:'message',role:'user',from:{kind:'agent',agentId:'other'},blocks:[{type:'text',text:'Agent notice'}]}));check(projects(p)?.length===1,'another agent notice does not clear human question');}
 {const p=page();p.items.push(row('reason3',{kind:'message',role:'reasoning',blocks:[{type:'text',text:'Original provider reasoning'}]}));check(projects(p)?.length===1,'original reasoning rows neither clear nor invalidate a pending async question');}
 {const p=page();p.items[0]={...user,itemId:'orca:accepted',revision:0};p.submissions=[{clientMessageId:'accepted',dispatchState:'accepted',providerItemId:null}];check(projects(p)?.length===1,'original admitted human row has revision zero with accepted delivery');}
 {const p=page();p.items[0]={...user,itemId:'orca:missing',revision:0};check(projects(p)===null,'zero-revision local echo requires a matching delivered submission');}
 {const p=page();p.items[1].revision=0;check(projects(p)===null,'zero-revision synthetic row cannot create async question authority');}
 {const p=page();p.items.push(row('orca:rejected',{kind:'message',role:'user',blocks:[{type:'text',text:'Not delivered'}]}));p.submissions=[{clientMessageId:'rejected',dispatchState:'rejected',providerItemId:null}];check(projects(p)?.length===1,'rejected local echo does not clear pending question');}
 {const p=page();p.items.push(clone({...ask,itemId:'q3'}));check(projects(p)?.length===1,'same provider call echo is not a duplicate prompt');p.items[2].body={...ask.body,blocks:[{type:'tool-call',name:'request_user_input_async',callId:'call1',input:{questions:[{title:'Changed'}]}}]};check(projects(p)===null,'conflicting duplicate provider call cannot choose arbitrary question');}
 {const p=page();p.items[1].body={kind:'message',role:'assistant',blocks:[{type:'text',text:'request_user_input_async: Choose a path'}]};check(projects(p)?.length===0,'assistant prose never grants question authority');}
 {const p=page();p.items.push(row('p3',{kind:'approval',resolution:{state:'pending'}}));check(projects(p)===null,'blocking native prompt prevents free message reply');}
 const operationId='1793640000000-00000000000000000000000000000001',fp='a'.repeat(64);
 const reply=(state:string)=>({ok:true,value:{clientMessageId:operationId,submission:{clientMessageId:operationId,payloadFingerprint:fp,dispatchState:state}}});
 check(readAsyncSendOutcome(reply('accepted'),operationId,fp)==='accepted','correlated accepted provider delivery is known');
 check(readAsyncSendOutcome(reply('rejected'),operationId,fp)==='refused','correlated rejected delivery is refused');
 for(const value of [reply('pending'),reply('unknown'),{ok:true,value:{clientMessageId:operationId}}, {...reply('accepted'),value:{...reply('accepted').value,clientMessageId:'other'}},{ok:true,value:{clientMessageId:operationId,submission:{...reply('accepted').value.submission,payloadFingerprint:'b'.repeat(64)}}},{ok:true,value:{...reply('accepted').value,queued:{messageId:'queued-arm'}}}])check(readAsyncSendOutcome(value,operationId,fp)==='unknown','admission/uncorrelated/hybrid queued reply never becomes delivery');
 let snapshotQueue:unknown=undefined,historyFence=3,historyEpoch='epoch',changed=false,pending=false;
 const marker={contract:'agent-session.current-requests.v1',sessionId:target.sessionId,epoch:'epoch',publisher:'pub',revision:1,owner:'owner',version:'v1'};
 const snapshot=()=>({type:'snapshot',sessionId:target.sessionId,fence:3,currentRequests:marker,page:{...page(),items:changed?[user]:[user,ask]},...(snapshotQueue!==undefined?{queuedMessages:snapshotQueue}:{})});
 const transport:RpcTransport={readStructuredSnapshot:async()=>snapshot(),request:async(method)=>{if(method==='agentSession.currentRequests')return {marker,json:pending?'[{}]':'[]',nextCursor:null};if(method==='agentSession.history')return {ok:true,page:{...page(),fence:historyFence,epoch:historyEpoch}};throw new Error('unexpected');}};
 const requests=await readRequestEvidence(transport,target);
 check((await readNativeAsyncEvidence(transport,target,requests))?.questions.length===1,'opening snapshot and later explicit complete history yield reply evidence');
 {
  const history=page();history.items[0]={...user,itemId:'orca:older%3Asend',revision:0};
  history.submissions=[{clientMessageId:'older:send',dispatchState:'accepted',providerItemId:null}];
  const narrow={...snapshot(),page:{...history,hasOlder:true,items:[history.items[1]],submissions:[]}};
  const paged:RpcTransport={...transport,request:async()=>({ok:true,page:history})};
  check((await readNativeAsyncEvidence(paged,target,requests,narrow))?.questions.length===1,'accepted submission outside bounded opening window does not invalidate stable complete history');
  const overlapping={...narrow,page:{...history,hasOlder:true}};
  check((await readNativeAsyncEvidence(paged,target,requests,overlapping))?.questions.length===1,'matching submissions inside common item window remain available');
  for(const submissions of [[],[{...history.submissions[0],dispatchState:'rejected'}],[...history.submissions,{clientMessageId:'unrelated',dispatchState:'accepted'}]]){
   const changed={...overlapping,page:{...overlapping.page,submissions}};
   check(await readNativeAsyncEvidence(paged,target,requests,changed)===null,'missing, changed or unrelated opening submission refuses evidence');
  }
  history.submissions[0].dispatchState='pending';
  check(await readNativeAsyncEvidence(paged,target,requests,narrow)===null,'pending full-history submission outside opening still blocks reply');
 }
 for(const mutate of [()=>snapshotQueue=[{}],()=>{snapshotQueue=undefined;historyFence=4;},()=>{historyFence=3;historyEpoch='other';},()=>{historyEpoch='epoch';changed=true;}]){mutate();check(await readNativeAsyncEvidence(transport,target,requests)===null,'known queue, epoch/fence or snapshot overlap changes refuse async authority');}
 check(structuredFingerprint('agentSession.send',target.sessionId,{body:{kind:'message',role:'user',blocks:[{type:'text',text:'> Choose a path\n\nAlpha'}]}}).length===64,'existing original fingerprint accepts ordinary quoted message');
 console.log(`PASS: ${n} native async reply assertions (original-shaped synthetic wire; no device)`);
}
void main();
