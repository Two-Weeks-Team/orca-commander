import {SecureRequestJournal,type RequestReceipt,REQUEST_JOURNAL_PREFIX} from '../src/adapters/structured-request-journal';
import type {SecureValueStore} from '../src/adapters/pairing-store';
let n=0;const check=(v:unknown,m:string)=>{n++;if(!v)throw new Error(m);};
const values=new Map<string,string>();let fail=false;
const store:SecureValueStore={get:async k=>values.get(k)??null,set:async(k,v)=>{if(fail)throw new Error('native');values.set(k,v);},remove:async()=>{throw new Error('no deletion');}};
const receipt=(i:number):RequestReceipt=>({operationId:`1793640000000-${i.toString(16).padStart(32,'0')}`,hostId:'host',hostVersion:'1.4.246',worktreeId:'wt',tabId:'tab',sessionId:'codex_owned',itemId:'request',revision:1,fence:3,at:1793640000000,kind:'approval',status:'unknown',acknowledged:false});
async function rejects(p:Promise<unknown>,m:string){let did=false;try{await p;}catch{did=true;}check(did,m);}
async function main(){
 const a=new SecureRequestJournal(store);check((await a.load()).length===0,'empty native namespace');await a.reserve(receipt(1));
 const asyncReceipt={...receipt(30),kind:'async_reply' as const};
 await a.reserve(asyncReceipt);
 check((await new SecureRequestJournal(store).load()).some(r=>r.kind==='async_reply'&&r.status==='unknown'),'async reply uncertainty restores beside schema-1 approval without content');
 await a.update({...asyncReceipt,status:'accepted'});
 const b=new SecureRequestJournal(store);const restored=await b.load();check(restored.length===2&&restored.find(r=>r.kind==='approval')?.status==='unknown','write-ahead uncertainty survives new process-owned journal');
 await rejects(b.reserve(receipt(1)),'operation ids cannot duplicate');
 await rejects(b.update({...receipt(1),sessionId:'other',status:'accepted'}),'target cannot change on update');
 await b.update({...receipt(1),status:'accepted'});check((await new SecureRequestJournal(store).load())[0].status==='accepted','settlement persists');
 await rejects(b.reserve({...receipt(2),body:'private answer'} as RequestReceipt),'extra owner content never stored');
 for(let i=2;i<=17;i++)await b.reserve(receipt(i));await rejects(b.reserve(receipt(18)),'unresolved capacity cannot evict uncertainty');
 await b.update({...receipt(2),acknowledged:true});await b.reserve(receipt(18));check((await new SecureRequestJournal(store).load()).some(r=>r.operationId===receipt(18).operationId),'explicit durable reconciliation frees admission');
 fail=true;await rejects(b.update({...receipt(3),status:'accepted'}),'native write failure reported');await rejects(b.reserve(receipt(19)),'failed writer remains blocked');fail=false;
 check([...values.keys()].every(k=>k.startsWith(REQUEST_JOURNAL_PREFIX)),'separate namespace never touches pairing/terminal journal');
 const validSlot=JSON.parse(values.get(REQUEST_JOURNAL_PREFIX+'00')!);
 for(const invalid of [{...validSlot,version:'2'},{...validSlot,version:1,receipt:{...validSlot.receipt,kind:'async_reply'}}]){
  const isolated=new Map([[REQUEST_JOURNAL_PREFIX+'00',JSON.stringify(invalid)]]);
  await rejects(new SecureRequestJournal({...store,get:async k=>isolated.get(k)??null}).load(),'schema version must be numeric and schema-1 cannot claim a new reply kind');
 }
 values.set(REQUEST_JOURNAL_PREFIX+'31','{"version":2}');await rejects(new SecureRequestJournal(store).load(),'unknown schema blocks startup instead of reset');
 console.log(`PASS: ${n} structured journal assertions (fake native store; no device)`);
}
void main();
