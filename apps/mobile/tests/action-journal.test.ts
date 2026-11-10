import { SecureActionJournal,ActionJournalError,ACTION_JOURNAL_PREFIX,ACTION_JOURNAL_SLOTS,ACTION_JOURNAL_MAX_BYTES } from '../src/adapters/action-journal';
import type { ActionReceipt } from '../src/adapters/action-client';
import { FakeJournalStore } from './helpers/action-journal-store';
let checks=0;function check(v:unknown,m:string){checks++;if(!v)throw new Error(m);}
async function rejects(p:Promise<unknown>,code:ActionJournalError['code']){checks++;try{await p;}catch(e){if(e instanceof ActionJournalError&&e.code===code&&!JSON.stringify(e).includes('NATIVE_RAW'))return;throw new Error('wrong coded journal error');}throw new Error('expected '+code);}
const receipt=(id:string):ActionReceipt=>({id,at:1000,hostId:'host',hostVersion:'1.4.246',handle:'term_fixture',incarnationId:'incarnation',worktreeId:'owner/worktree',paneKey:'tab:leaf',status:'unknown',bodyAccepted:false,submitAttempted:false,acknowledged:false});
async function main(){
 const store=new FakeJournalStore();const journal=new SecureActionJournal(store);
 check((await journal.load()).length===0&&store.reads===ACTION_JOURNAL_SLOTS,'first load scans the complete fixed slot namespace');
 await journal.reserve(receipt('pending'));
 let reopened=await new SecureActionJournal(store).load();check(reopened.length===1&&reopened[0]?.status==='unknown','a reserved intent survives a new journal instance');
 await journal.update({...receipt('pending'),status:'partial',bodyAccepted:true});
 reopened=await new SecureActionJournal(store).load();check(reopened[0]?.bodyAccepted&&reopened[0]?.submitAttempted===false,'known accepted body survives restart before submit');
 await journal.update({...receipt('pending'),bodyAccepted:true,submitAttempted:null});
 reopened=await new SecureActionJournal(store).load();check(reopened[0]?.submitAttempted===null,'write-ahead submit intent preserves uncertainty instead of inventing an attempt');
 for(let i=0;i<110;i++){const r=receipt(`other-${i}`);await journal.reserve(r);await journal.update({...r,status:'accepted',bodyAccepted:true,submitAttempted:true});}
 reopened=await new SecureActionJournal(store).load();check(reopened.some(r=>r.id==='pending'&&!r.acknowledged),'settled history churn never evicts an uncertain target');check(store.values.size===ACTION_JOURNAL_SLOTS&&store.removals===0,'bounded slots are reused without deleting storage');
 const raw=[...store.values.values()];check(raw.every(v=>new TextEncoder().encode(v).length<=ACTION_JOURNAL_MAX_BYTES),'every published native value stays below the chosen byte budget');check(raw.every(v=>!v.includes('"text"')&&!v.includes('"audio"')&&!v.includes('"deviceToken"')),'journal contains no draft/audio/credential fields');
 await rejects(journal.reserve(receipt('pending')),'duplicate_id');
 await rejects(journal.update({...receipt('pending'),handle:'term_replacement',bodyAccepted:true,submitAttempted:null}),'target_mismatch');
 await rejects(journal.update({...receipt('pending'),bodyAccepted:false,submitAttempted:false}),'invalid_record');
 await journal.update({...receipt('pending'),bodyAccepted:true,submitAttempted:null,acknowledged:true});
 check((await new SecureActionJournal(store).load()).find(r=>r.id==='pending')?.acknowledged,'explicit acknowledgement persists without relabelling success');
 await rejects(journal.update({...receipt('pending'),bodyAccepted:true,submitAttempted:null}),'invalid_record');
 await rejects(journal.reserve({...receipt('oversize'),worktreeId:'한'.repeat(600)}),'invalid_record');
 await rejects(journal.reserve({...receipt('extra'),text:'NATIVE_RAW'} as ActionReceipt),'invalid_record');
 const fullStore=new FakeJournalStore();const full=new SecureActionJournal(fullStore);await full.load();for(let i=0;i<50;i++)await full.reserve(receipt(`uncertain-${i}`));await rejects(full.reserve(receipt('overflow')),'capacity');
 const broken=new FakeJournalStore();broken.beforeGet=()=>{throw new Error('NATIVE_RAW');};await rejects(new SecureActionJournal(broken).load(),'storage_unavailable');
 const bad=new FakeJournalStore();bad.values.set(ACTION_JOURNAL_PREFIX+'00','{"version":');await rejects(new SecureActionJournal(bad).load(),'invalid_record');
 const duplicate=new FakeJournalStore();const good=[...store.values.values()][0]!;duplicate.values.set(ACTION_JOURNAL_PREFIX+'00',good);duplicate.values.set(ACTION_JOURNAL_PREFIX+'01',good);await rejects(new SecureActionJournal(duplicate).load(),'invalid_record');
 const failed=new FakeJournalStore();const f=new SecureActionJournal(failed);await f.load();failed.beforeSet=()=>{throw new Error('NATIVE_RAW');};await rejects(f.reserve(receipt('failed')),'storage_unavailable');await rejects(f.reserve(receipt('later')),'storage_unavailable');
 const mismatch=new FakeJournalStore();const m=new SecureActionJournal(mismatch);await m.load();mismatch.beforeGet=key=>{if(mismatch.values.has(key))mismatch.values.set(key,'different');};await rejects(m.reserve(receipt('mismatch')),'storage_unavailable');
 const concurrentStore=new FakeJournalStore();const concurrent=new SecureActionJournal(concurrentStore);await concurrent.load();await Promise.all([concurrent.reserve(receipt('one')),concurrent.reserve(receipt('two'))]);check((await new SecureActionJournal(concurrentStore).load()).length===2,'concurrent mutations serialize and retain both intents');
 const cursorStore=new FakeJournalStore(),cursorJournal=new SecureActionJournal(cursorStore);await cursorJournal.load();await cursorJournal.reserve(receipt('digit-ignored'));
 await cursorJournal.update({...receipt('digit-ignored'),status:'cursor_required',bodyAccepted:true});
 const restored=(await new SecureActionJournal(cursorStore).load())[0];check(restored?.status==='cursor_required'&&restored.bodyAccepted&&restored.submitAttempted===false,'ignored numeric shortcut survives cold load without claiming submission');
 await rejects(cursorJournal.update({...receipt('digit-ignored'),status:'cursor_required',bodyAccepted:true,submitAttempted:true}),'invalid_record');
 check([...cursorStore.values.values()].every(raw=>!raw.includes('text')&&!raw.includes('screen')),'cursor fallback journal remains metadata only');
 console.log(`PASS: ${checks} action journal assertions (fake native store; no device)`);
}
void main();
