import {SecureHostDefaultAgentJournal,HOST_DEFAULT_AGENT_JOURNAL_PREFIX,unresolvedHostDefaultLaunch,type HostDefaultLaunchReceipt} from '../src/adapters/host-default-agent-journal';
import type {SecureValueStore} from '../src/adapters/pairing-store';
let n=0;const check=(v:unknown,m:string)=>{n++;if(!v)throw new Error(m);};
const rejected=async(f:()=>Promise<unknown>)=>{try{await f();return false;}catch{return true;}};
const receipt=(i=1):HostDefaultLaunchReceipt=>({operationId:'1793678400000-'+i.toString(16).padStart(32,'0'),hostId:'owned-host',hostVersion:'1.4.246',worktreeId:'owned::/Users/owner/Project',agent:'codex',at:1793678400000+i,status:'unknown',acknowledged:false,sessionId:null,messageId:null});
const delivered=(r:HostDefaultLaunchReceipt):HostDefaultLaunchReceipt=>({...r,status:'journaled',sessionId:'codex_owned_'+r.operationId.slice(-2),messageId:'message-'+r.operationId.slice(-2)});
async function main(){
 // Existing v1 slots can mix versions without migration or losing unknown fences.
 {
  const values=new Map<string,string>();let writes=0;
  for(const [i,hostVersion] of ['1.4.246','1.4.248','1.4.249'].entries())values.set(HOST_DEFAULT_AGENT_JOURNAL_PREFIX+String(i).padStart(2,'0'),JSON.stringify({version:1,sequence:i+1,receipt:{...receipt(i+1),hostVersion}}));
  const store:SecureValueStore={get:async key=>values.get(key)??null,set:async(key,value)=>{writes++;values.set(key,value);},remove:async()=>{throw new Error('no deletion');}};
  const journal=new SecureHostDefaultAgentJournal(store),loaded=await journal.load();check(loaded.length===3&&loaded[0].hostVersion==='1.4.246'&&loaded[1].hostVersion==='1.4.248'&&String(loaded[2].hostVersion)==='1.4.249'&&loaded.every(unresolvedHostDefaultLaunch),'mixed246/248 v1 rows load with their actual versions and unknown authority');check(writes===0,'mixed version load performs no migration writes');
  const from248={...loaded[1],operationId:receipt(4).operationId};await journal.reserve(from248);await journal.update(delivered(from248));const restored=await new SecureHostDefaultAgentJournal(store).load();check(restored.some(r=>r.operationId===from248.operationId&&r.hostVersion==='1.4.248'&&r.status==='journaled'),'248 reserve/update/reload preserves actual version');
  const from249={...loaded[2],operationId:receipt(5).operationId};await journal.reserve(from249);await journal.update(delivered(from249));check((await new SecureHostDefaultAgentJournal(store).load()).some(r=>r.operationId===from249.operationId&&String(r.hostVersion)==='1.4.249'&&r.status==='journaled'),'249 reserve/update/reload preserves actual version');
  check(await rejected(()=>journal.update({...loaded[1],hostVersion:'1.4.246'})),'supported host version is immutable for a reserved operation');
  const key=HOST_DEFAULT_AGENT_JOURNAL_PREFIX+'01',raw=values.get(key)!,unsupported=JSON.parse(raw);unsupported.receipt.hostVersion='1.4.250';values.set(key,JSON.stringify(unsupported));const before=values.get(key);check((await new SecureHostDefaultAgentJournal(store).load()).some(r=>r.hostVersion==='1.4.250'&&unresolvedHostDefaultLaunch(r))&&values.get(key)===before,'unknown diagnostic label preserves the original v1 uncertainty fence without migration');
 }

 const values=new Map<string,string>();let writes=0,badReadback=false;
 const store:SecureValueStore={get:async key=>badReadback?'invalid-readback':values.get(key)??null,set:async(key,value)=>{writes++;values.set(key,value);},remove:async()=>{throw new Error('journal must not delete native slots');}};
 const journal=new SecureHostDefaultAgentJournal(store);
 check(await rejected(()=>journal.reserve(receipt())),'unloaded protected journal cannot reserve authority');
 check((await journal.load()).length===0,'fresh protected namespace loads empty');
 const first=receipt(),reservation=journal.reserve(first);first.hostId='mutated-caller';await reservation;
 const restored=await new SecureHostDefaultAgentJournal(store).load();check(restored.length===1&&restored[0].hostId==='owned-host'&&unresolvedHostDefaultLaunch(restored[0]),'metadata-only unknown survives a new process-owned reader without caller alias');
 check(await rejected(()=>journal.reserve(receipt())),'duplicate launch operation cannot reserve another effect');
 const before=writes;check(await rejected(()=>journal.reserve({...receipt(2),prompt:'owner text must not persist'} as HostDefaultLaunchReceipt))&&writes===before,'extra source/prompt fields are refused before persistence');
 check(await rejected(()=>journal.update({...receipt(),worktreeId:'other'})),'reserved target cannot change');
 await journal.update(delivered(receipt()));
 check(await rejected(()=>journal.update(receipt())),'journaled receipt cannot regress to retryable unknown');
 const current=await new SecureHostDefaultAgentJournal(store).load();check(current[0].status==='journaled'&&current[0].sessionId==='codex_owned_01'&&current[0].messageId==='message-01','original returned observation identities survive restart distinctly from completion');
 await journal.reserve(receipt(2));await journal.update({...receipt(2),acknowledged:true});
 check(!(await journal.load()).some(unresolvedHostDefaultLaunch),'explicit durable unknown acknowledgement releases its uncertainty');
 check(await rejected(()=>journal.update({...receipt(2),acknowledged:false})),'acknowledgement cannot be revoked by stale state');
 check([...values.keys()].every(k=>k.startsWith(HOST_DEFAULT_AGENT_JOURNAL_PREFIX)),'launch journal stays separate from pairing and native request namespaces');
 check(![...values.values()].some(v=>/prompt|answer|fingerprint|audio|token|key|owner text/.test(v)),'stored records contain no request, answer, digest, audio or credential');
 const capped=new SecureHostDefaultAgentJournal(store);await capped.load();
 for(let i=3;i<=18;i++)await capped.reserve(receipt(i));
 check(await rejected(()=>capped.reserve(receipt(19))),'sixteen unresolved launches cannot be silently rotated away');
 const all=await capped.load();check(all.filter(unresolvedHostDefaultLaunch).length===16,'failed extra reservation preserves every unresolved record');
 const pending=all.find(unresolvedHostDefaultLaunch)!;badReadback=true;
 check(await rejected(()=>capped.update({...pending,acknowledged:true})),'failed native readback cannot release an unknown launch');
 badReadback=false;check(await rejected(()=>capped.update(delivered(receipt()))),'failed native publication blocks an otherwise valid settled update until reload');
 const rotateValues=new Map<string,string>();const rotateStore:SecureValueStore={get:async k=>rotateValues.get(k)??null,set:async(k,v)=>{rotateValues.set(k,v);},remove:async()=>{throw new Error('no deletion');}};
 const rotating=new SecureHostDefaultAgentJournal(rotateStore);await rotating.load();await rotating.reserve(receipt(100));
 for(let i=101;i<=132;i++){await rotating.reserve(receipt(i));await rotating.update(delivered(receipt(i)));}
 const rotated=await rotating.load();check(rotated.length===32&&rotated.some(r=>r.operationId===receipt(100).operationId&&unresolvedHostDefaultLaunch(r)),'only settled slots rotate and oldest unknown remains after more than32 operations');
 const sample=[...rotateValues.values()][0];const malformed=JSON.parse(sample);malformed.version=99;
 rotateValues.set([...rotateValues.keys()][0],JSON.stringify(malformed));
 check(await rejected(()=>new SecureHostDefaultAgentJournal(rotateStore).load()),'future schema fails closed without erasure');
 console.log(`PASS: ${n} host default-agent journal assertions (fake native store; no device)`);
}
void main();
