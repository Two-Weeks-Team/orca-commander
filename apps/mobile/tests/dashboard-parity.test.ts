import assert from 'node:assert/strict';
import {normalizeWorktreePs} from '../src/adapters/orca-read-model';
import {bindKey} from '../src/core/deck-model';
import type {AgentSnapshot} from '../src/core/types';

// Hand-checked original 1.4.247 renderer contract: three working (one monitoring),
// 18 unread done and four acknowledged done. Connected orphan PTYs are not dashboard rows.
const now=1_800_000_000_000;
const hooks=Array.from({length:25},(_,i)=>({paneKey:`tab-${i}:leaf`,agentType:i===1?'claude':'codex',
 state:i<3?'working':'done',workingMode:i===1?'monitoring':undefined,
 stateStartedAt:now-100_000-i*1000,updatedAt:now-100,hasLivePty:true,
 conversationName:i===1?'Monitoring conversation':'Conversation '+i,taskTitle:'Task '+i}));
const listing={worktrees:[{worktreeId:'workspace',repoId:'repo',repo:'Project',displayName:'rudd',hostId:'local',unverifiableTerminalCount:0,agents:hooks}],totalCount:1,truncated:false,hostScope:{hostIds:['local'],omittedHostIds:[]}};
const orphans=Array.from({length:29},(_,i)=>({handle:`orphan-${i}`,worktreeId:'workspace',tabId:`orphan-tab-${i}`,leafId:'leaf',agentIdentity:'claude',title:'Redraw | rudd',connected:true,orphaned:true,lastOutputAt:now}));
const ui={ui:{acknowledgedAgentsByPaneKey:Object.fromEntries(hooks.slice(21).map(a=>[a.paneKey,a.stateStartedAt]))}};
const evidence={catalog:{terminals:orphans,totalCount:29,truncated:false,hostScope:{hostIds:['local'],omittedHostIds:[]}},statuses:new Map(orphans.map(t=>[t.handle,{agentStatus:{handle:t.handle,isRunningAgent:true,status:'idle'}}])),ui};
const result=Reflect.apply(normalizeWorktreePs,undefined,[listing,{hostId:'paired',generation:1,observedAt:now},evidence]) as ReturnType<typeof normalizeWorktreePs>;
assert.ok(result.ok);
assert.equal(result.agents.length,25,'orphan redraw terminals never create desktop rows');
type Row=AgentSnapshot&{dashboard?:{bucket:string;visible:boolean;stateChangedAt:number|null}};
const visible=(result.agents as Row[]).filter(a=>a.dashboard?.visible);
assert.equal(visible.length,21,'three working plus 18 unread done, exactly the desktop badge');
assert.equal(visible.filter(a=>a.dashboard?.bucket==='working').length,3);
assert.equal(visible.filter(a=>a.dashboard?.bucket==='done').length,18);
assert.equal(result.agents.length-visible.length,4,'acknowledgment hides rows for presentation, not inventory absence');
assert.equal(visible[1]?.title,'Monitoring conversation','conversationName precedes taskTitle and raw terminal title');
// Preserve the original dashboard projection as metadata. D25 deliberately supersedes its key membership/order;
// output-recency.test exercises the new connected-pane presentation without changing these historical facts.
assert.equal(new Set(result.agents.map(bindKey)).size,25);
console.log('PASS: original dashboard metadata (25 hook rows / 29 orphan PTYs / 21 visible / buckets; key policy superseded by D25)');
