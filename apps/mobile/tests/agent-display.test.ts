import assert from 'node:assert/strict';
import {AGENT_STATUS_STALE_AFTER_MS,agentDisplay,formatAge} from '../src/core/agent-display';
import type {AgentSnapshot} from '../src/core/types';
let count=0;const same=(a:unknown,b:unknown)=>{count++;assert.deepEqual(a,b);};
const now=Date.parse('2026-11-04T12:00:00Z');
const at=(ms:number)=>new Date(ms).toISOString();
const row=(extra:Partial<AgentSnapshot>):AgentSnapshot=>({id:'a',provider:'claude',title:'t',summary:'',state:'working',eventType:'informational',updatedAt:at(now-1000),target:{hostId:'h',worktreeId:'w',terminalId:'p',connectionGeneration:1},...extra});
// Ages count from when the state began, not the last heartbeat.
same(agentDisplay(row({stateSince:at(now-3_600_000)}),now),{kind:'working',since:now-3_600_000});
same(agentDisplay(row({}),now),{kind:'working',since:now-1000});
// Monitoring and stopping are their own marks.
same(agentDisplay(row({monitoring:true}),now).kind,'monitoring');
same(agentDisplay(row({stopping:true,monitoring:true}),now).kind,'stopping');
// A non-done row silent past 30 minutes no longer proves its state: stale with a live terminal, idle without.
const silent=at(now-AGENT_STATUS_STALE_AFTER_MS-1);
same(agentDisplay(row({updatedAt:silent,livePty:true,monitoring:true}),now),{kind:'stale',since:now-AGENT_STATUS_STALE_AFTER_MS-1});
same(agentDisplay(row({updatedAt:silent,state:'question'}),now).kind,'idle');
same(agentDisplay(row({updatedAt:at(now-AGENT_STATUS_STALE_AFTER_MS),livePty:true}),now).kind,'working');
// Done, failed and host-owned rows never go stale; an unproven end is its own mark.
same(agentDisplay(row({updatedAt:silent,state:'done',livePty:true}),now).kind,'done');
same(agentDisplay(row({updatedAt:silent,state:'failed',livePty:true}),now).kind,'failed');
same(agentDisplay(row({updatedAt:silent,hostOwned:true,livePty:true}),now).kind,'working');
same(agentDisplay(row({state:'unknown',unconfirmed:true}),now).kind,'unconfirmed');
same([formatAge(now-5000,now),formatAge(now-120_000,now),formatAge(now-7_200_000,now),formatAge(now-3*86_400_000,now),formatAge(null,now),formatAge(now+1,now)],['5s','2m','2h','3d',null,null]);
console.log(`PASS: ${count} agent display assertions (pure; Orca row display and freshness rules)`);
