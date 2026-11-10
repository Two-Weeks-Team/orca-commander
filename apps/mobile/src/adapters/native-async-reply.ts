import type {RpcTransport} from './read-only-orca-client';
import {isRecord,type NativeTarget,type RequestEvidence} from './structured-request-wire';

export interface NativeAsyncQuestion {
 itemId:string; revision:number; callSlot:number; callId:string;
 questions:{title:string;options:string[]}[];
}
export type NativeAsyncAnswer={option:number}|{text:string};
export interface NativeAsyncEvidence extends RequestEvidence {
 questions:NativeAsyncQuestion[];
 /** Ephemeral original context, never persisted in the request journal. */
 context:string;
}
const nonempty=(v:unknown,max=512):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const emptyQueue=(v:unknown)=>v===null||Array.isArray(v)&&v.length===0;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/** Bounded original 246 projection. Unsupported evidence is null, a settled empty projection is [].
 * Source: original Codex async metadata, native-chat-ask and native-chat-ask-answer (MIT).
 * This slice deliberately requires complete history and root Codex questions.
 */
export function projectNativeAsyncQuestions(value:unknown,target:NativeTarget):NativeAsyncQuestion[]|null {
 if(target.agent!=='codex'||!isRecord(value)||value.sessionId!==target.sessionId||!nonempty(value.epoch)||!integer(value.fence)||value.hasOlder!==false||value.hasNewer!==false||!Array.isArray(value.items)||value.items.length>200||!Array.isArray(value.submissions)||!('queuedMessages' in value)||!emptyQueue(value.queuedMessages)||!isRecord(value.latestTurn)||!isRecord(value.latestTurn.turn)||value.latestTurn.turn.state!=='completed')return null;
 if(new TextEncoder().encode(JSON.stringify(value)).byteLength>2_000_000)return null;
 const rejected=new Set<string>(),accepted=new Set<string>(),submissionIds=new Set<string>();
 for(const s of value.submissions){
  if(!isRecord(s)||!nonempty(s.clientMessageId,1024)||submissionIds.has(s.clientMessageId)||!['accepted','rejected'].includes(String(s.dispatchState)))return null;
  submissionIds.add(s.clientMessageId);
  if(s.source!==undefined&&(!isRecord(s.source)||!['user','agent'].includes(String(s.source.kind))))return null;
  if(s.dispatchState==='rejected'){
   rejected.add('orca:'+encodeURIComponent(s.clientMessageId));
   if(typeof s.providerItemId==='string')rejected.add(s.providerItemId);
  }else accepted.add('orca:'+encodeURIComponent(s.clientMessageId));
 }
 let questions:NativeAsyncQuestion[]=[];const ids=new Set<string>();let calls=new Map<string,NativeAsyncQuestion>();
 for(const row of value.items){
  if(!isRecord(row)||!nonempty(row.itemId,1024)||ids.has(row.itemId)||typeof row.revision!=='number'||!Number.isSafeInteger(row.revision)||row.revision<0||!isRecord(row.body)||row.shortened!==undefined&&row.shortened!==false)return null;
  ids.add(row.itemId);const b=row.body;
  if(!['message','status','turn','tool-call','diff','approval','question'].includes(String(b.kind)))return null;
  if(b.kind==='status'){
   if(b.contextClear!==undefined||!b.turnLifecycle&&b.text==='Conversation interrupted'){questions=[];calls=new Map();}
   continue;
  }
  if(b.kind==='approval'||b.kind==='question'){
   if(!isRecord(b.resolution)||!['resolved','cancelled'].includes(String(b.resolution.state)))return null;
   continue;
  }
  if(b.kind!=='message')continue;
  if(!Array.isArray(b.blocks)||b.blocks.length>64||!['user','assistant','system','tool','reasoning'].includes(String(b.role)))return null;
  if(b.role==='user'){
   if(b.from!==undefined&&(!isRecord(b.from)||!['agent','user'].includes(String(b.from.kind))))return null;
   if(rejected.has(row.itemId)||isRecord(b.from)&&b.from.kind==='agent')continue;
   // Original journal-submission-fold creates local human echoes at revision 0.
   if(row.revision===0&&!accepted.has(row.itemId))return null;
   if(['queued','unsent','stoppedBeforeStart','awaitsRetry','sentWhileStopping'].some(k=>b[k]===true))return null;
   questions=[];calls=new Map();continue;
  }
  if(b.role==='system'&&b.blocks.some(block=>isRecord(block)&&block.type==='text'&&block.text==='Conversation interrupted')){
   questions=[];calls=new Map();continue;
  }
  if(b.role!=='assistant')continue;
  for(const [callSlot,block] of b.blocks.entries()){
   if(!isRecord(block)||!['text','reasoning','tool-call','tool-result','image','image-ref'].includes(String(block.type)))return null;
   if(block.type!=='tool-call'||block.name!=='request_user_input_async')continue;
   // Shared journals contain subagent rows. They need separately verified routing/provenance.
   if(!integer(row.revision)||row.agentId!==undefined||row.parentAgentId!==undefined||row.producerKind!==undefined&&row.producerKind!=='agent'||!nonempty(block.callId,1024)||!isRecord(block.input)||!Array.isArray(block.input.questions)||block.input.questions.length<1||block.input.questions.length>16)return null;
   const parsed:NativeAsyncQuestion={itemId:row.itemId,revision:row.revision,callSlot,callId:block.callId,questions:[]};
   for(const q of block.input.questions){
    if(!isRecord(q)||!nonempty(q.title,2_000_000)||q.options!==undefined&&q.options!==null&&!Array.isArray(q.options))return null;
    const options=q.options??[];
    if(!Array.isArray(options)||options.length>64||!options.every(o=>nonempty(o,2_000_000)))return null;
    parsed.questions.push({title:q.title,options:[...options] as string[]});
   }
   const prior=calls.get(parsed.callId);
   if(prior){if(!same(prior.questions,parsed.questions))return null;continue;}
   calls.set(parsed.callId,parsed);questions.push(parsed);
  }
 }
 return questions;
}

/** Opening one-shot stream is closed before the later explicit queue/history read. */
export async function readNativeAsyncEvidence(transport:RpcTransport,target:NativeTarget,requests:RequestEvidence,opening?:unknown):Promise<NativeAsyncEvidence|null>{
 if(target.agent!=='codex'||requests.items.length||!transport.readStructuredSnapshot)return null;
 try{
  const snapshot=opening??await transport.readStructuredSnapshot(target.sessionId);
  if(!isRecord(snapshot)||snapshot.type!=='snapshot'||snapshot.sessionId!==target.sessionId||snapshot.fence!==requests.fence||!isRecord(snapshot.currentRequests)||Object.entries(requests.marker).some(([k,v])=>(snapshot.currentRequests as Record<string,unknown>)[k]!==v)||!isRecord(snapshot.page)||snapshot.page.sessionId!==target.sessionId||snapshot.page.epoch!==requests.marker.epoch||!Array.isArray(snapshot.page.items)||snapshot.page.hasNewer!==false||'queuedMessages' in snapshot&&!emptyQueue(snapshot.queuedMessages))return null;
  const result=await transport.request('agentSession.history',{sessionId:target.sessionId,direction:'tail',limit:200});
  if(!isRecord(result)||result.ok!==true||!isRecord(result.page)||result.page.epoch!==requests.marker.epoch||result.page.fence!==requests.fence)return null;
  const questions=projectNativeAsyncQuestions(result.page,target);
  if(!questions||!Array.isArray(result.page.items)||!Array.isArray(result.page.submissions))return null;
  // The 200-row history may cover more than the byte-bounded opening snapshot.
  // Original submissions are page-local, keyed by the local human item ID.
  const tail=result.page.items.slice(-snapshot.page.items.length);
  const openingIds=new Set(snapshot.page.items.map(row=>isRecord(row)?row.itemId:undefined));
  const overlapSubmissions=result.page.submissions.filter(s=>isRecord(s)&&typeof s.clientMessageId==='string'&&openingIds.has('orca:'+encodeURIComponent(s.clientMessageId)));
  if(!snapshot.page.items.length&&result.page.items.length||!same(tail,snapshot.page.items)||!same(result.page.latestTurn,snapshot.page.latestTurn)||!same(overlapSubmissions,snapshot.page.submissions))return null;
  const p=result.page;
  // hostNow advances on every read. Bind semantic conversation state, not the host's clock.
  const context=JSON.stringify({sessionId:p.sessionId,epoch:p.epoch,fence:p.fence,items:p.items,submissions:p.submissions,latestTurn:p.latestTurn,queuedMessages:p.queuedMessages,backgroundTasks:p.backgroundTasks});
  return {...requests,questions,context};
 }catch{return null;}
}

/** Original quote formatter; offered labels remain verbatim, free text is trimmed. */
export function formatNativeAsyncReply(groups:readonly NativeAsyncQuestion[],answers:readonly NativeAsyncAnswer[]):string{
 const questions=groups.flatMap(g=>g.questions);if(answers.length>questions.length)throw new Error('invalid_answer');
 const parts:string[]=[];
 for(const [i,q] of questions.entries()){
  const answer=answers[i];if(!answer)continue;
  let text:string;
  if('option' in answer){if(!Number.isSafeInteger(answer.option)||answer.option<0||answer.option>=q.options.length)throw new Error('invalid_answer');text=q.options[answer.option];}
  else{if(typeof answer.text!=='string')throw new Error('invalid_answer');text=answer.text.trim();}
  if(text)parts.push(`> ${q.title.replaceAll(/[\r\n]+/g,' ')}\n\n${text}`);
 }
 const text=parts.join('\n\n');
 if(!text||new TextEncoder().encode(JSON.stringify([{type:'text',text}])).byteLength>256*1024)throw new Error('invalid_answer');
 return text;
}

/** A journal admission is not provider delivery, and delivery is not task completion. */
export function readAsyncSendOutcome(value:unknown,operationId:string,fingerprint:string):'accepted'|'refused'|'unknown'{
 if(!isRecord(value)||value.ok!==true||!isRecord(value.value)||'queued' in value.value||value.value.clientMessageId!==operationId||!isRecord(value.value.submission))return 'unknown';
 const s=value.value.submission;
 if(s.clientMessageId!==operationId||s.payloadFingerprint!==fingerprint)return 'unknown';
 return s.dispatchState==='accepted'?'accepted':s.dispatchState==='rejected'?'refused':'unknown';
}
