import assert from 'node:assert/strict';
import {compareSidebarText,orderAgentLineage,orderProjectEntries,recentActivityWithCreateGrace,worktreeComparator,worktreeStatus,type WorktreeOrderRow} from '../src/core/orca-order';
let count=0;const same=(a:unknown,b:unknown,label='orca order')=>{count++;assert.deepEqual(a,b,label);};
// Sidebar text: case/accent folding and natural digits, then canonical code points.
same(['item10','Item2','item1'].sort(compareSidebarText),['item1','Item2','item10']);
same(['éclair','eclair','Zeta'].sort(compareSidebarText),['eclair','éclair','Zeta']);
same(compareSidebarText('a01','a1')!==0,true,'leading zeros tie only on digits, then code points break the tie');
// Create grace: a new workspace is floored at createdAt + 5 minutes while the window is open.
same(recentActivityWithCreateGrace(10,1000,1000),1000+300000);same(recentActivityWithCreateGrace(10,1000,1000+300000),10);same(recentActivityWithCreateGrace(10,undefined,0),10);
const w=(id:string,extra:Partial<WorktreeOrderRow>={}):WorktreeOrderRow=>({worktreeId:id,label:id,repo:'r',...extra});
const ids=(rows:WorktreeOrderRow[])=>rows.map(r=>r.worktreeId);
const rows=[w('b',{lastActivityAt:5,sortOrder:1}),w('a',{lastActivityAt:9,sortOrder:3}),w('c',{lastActivityAt:9,sortOrder:2,manualOrder:7})];
same(ids([...rows].sort(worktreeComparator('recent',0))),['a','c','b'],'recent desc, label tie-break');
same(ids([...rows].sort(worktreeComparator('name',0))),['a','b','c']);
same(ids([...rows].sort(worktreeComparator('smart',0))),['a','c','b'],'smart: saved rank desc');
same(ids([...rows].sort(worktreeComparator('manual',0))),['c','a','b'],'manual: manualOrder ?? sortOrder desc');
same(ids([w('x',{status:'done'}),w('y',{status:'permission'}),w('z',{hasHostSidebarActivity:true})].sort(worktreeComparator('smart',0))),['y','x','z'],'smart without ranks: attention order');
same(worktreeStatus(w('q',{hasHostSidebarActivity:false,status:'working'})),'inactive');same(worktreeStatus(w('q',{liveTerminalCount:2})),'active');
same(ids([w('n',{createdAt:1000,lastActivityAt:0}),w('o',{lastActivityAt:2000})].sort(worktreeComparator('recent',1500))),['n','o'],'new workspace not buried in its first minutes');
// Projects: manual uses the catalog rank; recent uses newest activity, then rank.
const e=(repoId:string,firstSeen:number,at?:number)=>({key:`repo:${repoId}`,label:repoId,repoId,firstSeen,worktrees:[w(repoId+'-w',{lastActivityAt:at})]});
const entries=[e('b',0,10),e('a',1,30),e('c',2)];
same(orderProjectEntries(entries,{sortBy:'recent',projectOrderBy:'manual'}).map(x=>x.repoId),['b','a','c'],'manual without catalog: first appearance');
same(orderProjectEntries(entries,{sortBy:'recent',projectOrderBy:'manual',repoOrder:new Map([['c',0],['a',1],['b',2]])}).map(x=>x.repoId),['c','a','b']);
same(orderProjectEntries(entries,{sortBy:'recent',projectOrderBy:'recent',repoOrder:new Map([['c',0]])}).map(x=>x.repoId),['a','b','c'],'activity first, inactive last');
// Lineage: depth-first under parents, host order otherwise; self-parent and cycles become roots.
const L=(k:string,p?:string)=>({k,p});
same(orderAgentLineage([L('a'),L('b'),L('c','a'),L('d','c'),L('e','e')],x=>x.k,x=>x.p).map(x=>x.k),['a','c','d','b','e']);
same(orderAgentLineage([L('a','b'),L('b','a')],x=>x.k,x=>x.p).map(x=>x.k),['a','b'],'cycle rows stay visible');
console.log(`PASS: ${count} Orca sidebar order assertions (ported comparators; no host)`);
