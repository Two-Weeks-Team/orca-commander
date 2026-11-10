import {parseNativeTargets,readRequestEvidence,structuredFingerprint,structuredOperationId} from '../src/adapters/structured-request-wire';
import type {RpcTransport} from '../src/adapters/read-only-orca-client';
let n=0;const check=(v:unknown,m:string)=>{n++;if(!v)throw new Error(m);};
const marker={contract:'agent-session.current-requests.v1',sessionId:'codex_owned',epoch:'epoch',publisher:'pub',revision:1,owner:'owner',version:'version'};
const body={kind:'approval',title:'Run a command?',detail:"printf 'owned'",options:[{id:'accept',label:'Allow'},{id:'cancel',label:'Stop'}],resolution:{state:'pending',selectedOptionId:null,resolvedBy:null,resolvedAt:null}};
const item={itemId:'request1',revision:2,body};
const target={worktreeId:'wt',tabId:'tab',sessionId:'codex_owned',agent:'codex',title:'full /owner/path/title'};
function transport(items:unknown[]=[item]):RpcTransport{return{request:async(method,params)=>{if(method!=='agentSession.currentRequests')throw new Error('unexpected');check(params?.version==='version'&&params.cursor===0,'read exactly opening marker');return {marker,json:JSON.stringify(items),nextCursor:null};},readStructuredSnapshot:async()=>({type:'snapshot',sessionId:'codex_owned',page:{sessionId:'codex_owned',epoch:'epoch'},fence:3,currentRequests:marker})};}
async function rejects(work:Promise<unknown>,label:string){let fail=false;try{await work;}catch{fail=true;}check(fail,label);}
async function main(){
 const listing={worktree:'wt',publicationEpoch:'published',snapshotVersion:1,tabs:[{type:'agent-session',id:'tab',sessionId:'codex_owned',agent:'codex',title:target.title}]};
 check(parseNativeTargets(listing,'wt').targets[0].title===target.title,'native title and identity preserved');
 for(const bad of [{...listing,worktree:'other'},{...listing,agentSessionsUnverifiable:true},{...listing,publicationEpoch:'none'},{...listing,tabs:[listing.tabs[0],listing.tabs[0]]},{...listing,tabs:[{...listing.tabs[0],sessionId:undefined}]}]){let threw=false;try{parseNativeTargets(bad,'wt');}catch{threw=true;}check(threw,'incomplete, duplicate, or wrong-worktree inventory is refused');}
 const evidence=await readRequestEvidence(transport(),target);check(evidence.fence===3&&evidence.items[0].body.detail===body.detail,'fresh marker-qualified requests keep original full evidence');
 check(evidence.items[0].supported,'known Codex command approval supported');
 for(const changed of [{...item,revision:0},{...item,body:{...body,resolution:{state:'resolved'}}},{...item,body:{...body,resolution:{...body.resolution,selectedOptionId:'accept'}}},{...item,body:{...body,options:[body.options[0],body.options[0]]}},{...item,body:{...body,kind:'made-up'}}])await rejects(readRequestEvidence(transport([changed]),target),'invalid requests never become answerable');
 check(!(await readRequestEvidence(transport([{...item,body:{...body,subject:{kind:'future-plan'}}}]),target)).items[0].supported,'unknown approval subject remains visible but disabled');
 check(!(await readRequestEvidence(transport([{...item,body:{kind:'question',question:'Choose',options:body.options,resolution:body.resolution}}]),target)).items[0].supported,'question stays visible and disabled until distinct live proof');
 await rejects(readRequestEvidence(transport([item,item]),target),'duplicate request identity refused');
 let calls=0;const changed=transport();changed.request=async()=>{calls++;return{marker:{...marker,owner:'changed'},json:'[]',nextCursor:null};};await rejects(readRequestEvidence(changed,target),'owner cannot change within request chunks');check(calls===1,'no writes or unlimited retries on invalid marker');
 const huge=transport();huge.request=async()=>({marker,json:'x'.repeat(2_000_001),nextCursor:1});await rejects(readRequestEvidence(huge,target),'bounded request read');
 const partial=transport();partial.request=async()=>({marker,json:'[',nextCursor:0});await rejects(readRequestEvidence(partial,target),'non-advancing chunk cursor refused');
 const mismatched=transport();mismatched.readStructuredSnapshot=async()=>({type:'snapshot',sessionId:'other',page:{sessionId:'other',epoch:'epoch'},fence:3,currentRequests:marker});await rejects(readRequestEvidence(mismatched,target),'another session snapshot refused');
 const vector=structuredFingerprint('agentSession.create','codex_DECK_CONTRACT_HASH_ONLY',{worktree:'id:owned-worktree',agent:'codex',options:{permissionMode:'ask'}});
 check(vector==='3a1f302e3e5e5ec62f3155c5bd51109387c96081df4410a31914c7de2d2bd46b','synthetic fixture agrees with exact pinned original helper');
 check(structuredFingerprint('method','s',{b:2,a:1,absent:undefined})===structuredFingerprint('method','s',{a:1,b:2}),'canonical key order/undefined match original protocol');
 check(structuredOperationId(()=> '12345678-1234-4234-8234-123456789abc',1793640000000)==='1793640000000-12345678123442348234123456789abc','original timestamp/UUID operation identity format');
 const mcp={...item,body:{...body,title:'Run a command?',options:[{id:'accept',label:'Allow'},{id:'cancel',label:'Deny'}]}};
 check(!(await readRequestEvidence(transport([mcp]),target)).items[0].supported,'original MCP title collision with cancel=Deny cannot enter command response path');
 check(!(await readRequestEvidence(transport([{...item,body:{...body,options:[{id:'accept',label:'different semantics'}]}}]),target)).items[0].supported,'unknown command option semantics stay disabled');
 const originalOption={id:'accept',label:'Allow',description:'Customer-facing; cannot be undone',extra:{path:'/owned/full/path'}};
 const faithful=await readRequestEvidence(transport([{...item,body:{...body,options:[originalOption]}}]),target);
 check(JSON.stringify(faithful.items[0].body.options[0])===JSON.stringify(originalOption),'all original option fields and explanations survive for owner inspection');
 const longQuestion='Q'.repeat(70_000);const long=await readRequestEvidence(transport([{...item,body:{kind:'question',question:longQuestion,options:[],resolution:body.resolution}}]),target);
 check(long.items[0].body.question===longQuestion&&!long.items[0].supported,'valid host-bounded long question stays visible and read-only');
 const wrongEpoch=transport();wrongEpoch.readStructuredSnapshot=async()=>({type:'snapshot',sessionId:target.sessionId,page:{sessionId:target.sessionId,epoch:'epoch'},fence:3,currentRequests:{...marker,epoch:'other'}});await rejects(readRequestEvidence(wrongEpoch,target),'opening marker cannot silently substitute another epoch');
 for(const title of ['Apply file changes?','Approve this action?'])check(!(await readRequestEvidence(transport([{...item,body:{...body,title}}]),target)).items[0].supported,'file-change and unknown approval titles cannot enter the command-only action surface');
 console.log(`PASS: ${n} structured request wire assertions (synthetic; no live host)`);
}
void main();
