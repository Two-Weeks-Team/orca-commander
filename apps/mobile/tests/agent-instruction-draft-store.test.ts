import assert from 'node:assert/strict';
import {createAgentInstructionDraftStore} from '../src/core/agent-instruction-draft-store';

let count=0;const same=(actual:unknown,expected:unknown)=>{count++;assert.deepEqual(actual,expected);};
const owner=createAgentInstructionDraftStore(),initial=owner.getSnapshot();let emissions=0;
const off=owner.subscribe(()=>{emissions++;});
same(initial,{draft:'',worktreeId:''});same(owner.getSnapshot()===initial,true);same(Object.isFrozen(initial),true);
owner.setDraft('');owner.setWorktreeId('');same(emissions,0);same(owner.getSnapshot()===initial,true);
const complete='Full instructions\n한글 e\u0301 😀\u0000\u202e '+ 'x'.repeat(10000),id=' exact worktree\nID ';
owner.setDraft(complete);same(emissions,1);same(owner.getSnapshot().draft,complete);same(owner.getSnapshot().worktreeId,'');same(initial.draft,'');
const draftSnapshot=owner.getSnapshot();same(Object.isFrozen(draftSnapshot),true);owner.setDraft(complete);same(owner.getSnapshot()===draftSnapshot,true);same(emissions,1);
owner.setWorktreeId(id);same(emissions,2);same(owner.getSnapshot().worktreeId,id);same(owner.getSnapshot().draft,complete);owner.setWorktreeId(id);same(emissions,2);
// A modal/child lifetime owns no storage. Reusing this owner preserves both exact strings.
const closed=owner.getSnapshot(),remounted=owner;off();same(remounted.getSnapshot()===closed,true);same(remounted.getSnapshot().draft,complete);
let currentEmissions=0;const reopen=remounted.subscribe(()=>{currentEmissions++;});
remounted.setDraft('Explicit replacement preset');same(currentEmissions,1);same(owner.getSnapshot().worktreeId,id);same(owner.getSnapshot().draft,'Explicit replacement preset');same(emissions,2);reopen();
// Re-registering a consumer during notification must not revisit it in the same emission.
let visits=0;let unsubscribe=owner.subscribe(()=>{visits++;unsubscribe();unsubscribe=owner.subscribe(()=>{visits++;});});owner.setDraft('New owner body');same(visits,1);unsubscribe();
const beforeInvalid=owner.getSnapshot();Reflect.apply(owner.setDraft,owner,[null]);Reflect.apply(owner.setWorktreeId,owner,[3]);same(owner.getSnapshot()===beforeInvalid,true);
const typed=createAgentInstructionDraftStore();let typedEmissions=0;typed.subscribe(()=>{typedEmissions++;});for(let n=1;n<=144;n++)typed.setDraft('a'.repeat(n));same(typed.getSnapshot().draft,'a'.repeat(144));same(typedEmissions,144);typed.setDraft('a'.repeat(144));same(typedEmissions,144);
console.log(`PASS: ${count} instruction draft owner assertions (memory only; no native/host/storage)`);
