import { getAttentionQueue, getOverview } from '../src/core/attention';
import { checkCommand } from '../src/core/policy';
import type { AgentSnapshot } from '../src/core/types';

let count = 0;
function check(condition: unknown, message: string): asserts condition {
  count++;
  if (!condition) throw new Error(message);
}
const now = Date.parse('2026-11-01T14:00:00.000Z');
const active = {hostId:'h',generation:2};
const a: AgentSnapshot = {
  id: 'x', provider: 'codex', title: 'test', summary: 'test', state: 'permission',
  eventType: 'permission_request', updatedAt: new Date(now).toISOString(),
  target: {hostId:'h',connectionGeneration:2,worktreeId:'w',terminalId:'t'}, requestId: 'req-1', permissionEvidence: 'structured_verified',
};
const conn = { hostId:'h', generation:2, online:true, paired:true, lastConfirmedAt:a.updatedAt, controlsVerified:true, enabledCommands:['approve_permission','reject_permission','send_prompt'] as const };
const approve = {kind:'approve_permission' as const, target:a.target, requestId:'req-1'};
check(getAttentionQueue([ {...a,id:'done',state:'done',eventType:'informational'}, a])[0]?.id === 'x', 'permission should rank first');
check(getOverview([a]).needsYou === 1, 'attention count wrong');
check(checkCommand(approve,a,conn,now,active).allowed, 'verified request should pass policy precheck');
check(checkCommand(approve,a,conn,now+300000,active).allowed,'D29 policy eligibility is not a confirmation clock; owner obtains fresh evidence');
check(!checkCommand({...approve,requestId:'wrong'},a,conn,now,active).allowed, 'mismatched request should fail');
check(!checkCommand(approve,{...a,permissionEvidence:'missing'},conn,now,active).allowed, 'unverified permission must fail');
check(!checkCommand(approve,a,{...conn,online:false},now,active).allowed, 'offline must fail');
check(checkCommand(approve,a,conn,now+31_000,active).allowed, 'elapsed view age is not write authority');
check(!checkCommand({...approve,target:{...a.target,terminalId:'different'}},a,conn,now,active).allowed, 'wrong target must fail');
check(!checkCommand({kind:'resolve_gate',target:a.target,gateId:'g',resolution:'accept'},a,conn,now,active).allowed, 'gate disabled until G4');
check(!checkCommand(approve,a,{...conn,controlsVerified:false},now,active).allowed, 'G0 evidence required');
check(!checkCommand(approve,a,{...conn,controlsVerified:undefined},now,active).allowed, 'missing G0 evidence fails closed');
check(!checkCommand(approve,a,{...conn,enabledCommands:[]},now,active).allowed, 'missing RPC capability fails closed');
check(!checkCommand(approve,a,{...conn,enabledCommands:['send_prompt']},now,active).allowed, 'text capability cannot approve');
check(!checkCommand(approve,a,{...conn,lastConfirmedAt:undefined},now,active).allowed, 'connection confirmation required');
check(!checkCommand(approve,a,{...conn,lastConfirmedAt:'invalid'},now,active).allowed, 'malformed connection time fails');
check(checkCommand(approve,a,{...conn,lastConfirmedAt:new Date(now-30001).toISOString()},now,active).allowed, 'old view metadata requires owner fresh proof, not expiry');
check(checkCommand(approve,a,{...conn,lastConfirmedAt:new Date(now+1).toISOString()},now,active).allowed, 'wall clock shifts do not expire eligibility');
check(!checkCommand(approve,a,conn,NaN,active).allowed, 'invalid clock fails');
check(!checkCommand({...approve,target:{...a.target,dispatchId:'other'}},a,conn,now,active).allowed, 'extra dispatch ID fails');
check(!checkCommand(approve,{...a,target:{...a.target,dispatchId:'expected'}},conn,now,active).allowed, 'missing dispatch ID fails');
check(!checkCommand({...approve,target:{...a.target,dispatchId:'other'}},{...a,target:{...a.target,dispatchId:'expected'}},conn,now,active).allowed, 'wrong dispatch ID fails');
check(checkCommand({...approve,target:{...a.target,dispatchId:'same'}},{...a,target:{...a.target,dispatchId:'same'}},conn,now,active).requiresConfirmation, 'matching dispatch still requires human');
check(!checkCommand(approve,{...a,state:'done'},conn,now,active).allowed, 'done cannot reuse old permission evidence');
check(!checkCommand(approve,{...a,state:'unknown'},conn,now,active).allowed, 'unknown cannot approve');
check(!checkCommand(approve,{...a,eventType:'user_question'},conn,now,active).allowed, 'natural-language question cannot approve');
check(!checkCommand({...approve,target:{...a.target,hostId:'wrong'}},a,conn,now,active).allowed, 'wrong host fails');
check(!checkCommand({...approve,target:{...a.target,worktreeId:'wrong'}},a,conn,now,active).allowed, 'wrong worktree fails');
check(!checkCommand(approve,a,{...conn,hostId:'other'},now,active).allowed, 'other host evidence rejected');
check(!checkCommand(approve,a,{...conn,hostId:undefined},now,active).allowed, 'missing evidence host rejected');
check(!checkCommand(approve,a,conn,now).allowed, 'missing active connection rejected');
check(!checkCommand(approve,a,conn,now,{...active,hostId:'other'}).allowed, 'active host must match command and agent');
check(!checkCommand(approve,a,{...conn,generation:1},now,active).allowed, 'prior generation evidence rejected');
check(!checkCommand(approve,a,{...conn,generation:undefined},now,active).allowed, 'missing evidence generation rejected');
check(!checkCommand(approve,a,conn,now,{...active,generation:3}).allowed, 'old complete evidence cannot survive reconnect');
check(!checkCommand({...approve,target:{...a.target,connectionGeneration:1}},a,conn,now,active).allowed, 'old command generation rejected');
check(!checkCommand(approve,{...a,target:{...a.target,connectionGeneration:1}},conn,now,active).allowed, 'old agent generation rejected');
check(!checkCommand({...approve,target:{...a.target,connectionGeneration:undefined}},a,conn,now,active).allowed, 'missing command generation rejected');
check(!checkCommand(approve,{...a,target:{...a.target,connectionGeneration:undefined}},conn,now,active).allowed, 'missing agent generation rejected');
for (const generation of [NaN,Infinity,-1,1.5]) {
 const target={...a.target,connectionGeneration:generation};
 check(!checkCommand({...approve,target},{...a,target},{...conn,generation},now,{hostId:'h',generation}).allowed, 'malformed matching generations rejected');
}
const nextTarget={...a.target,connectionGeneration:3};
check(checkCommand({...approve,target:nextTarget},{...a,target:nextTarget},{...conn,generation:3},now,{...active,generation:3}).requiresConfirmation, 'fresh reconnect evidence still requires confirmation');
check(checkCommand({kind:'view',target:a.target},a,{online:false,paired:false},now).allowed, 'local view needs no connection evidence');
const idle={...a,state:'idle' as const,eventType:'informational' as const,requestId:undefined,permissionEvidence:'missing' as const};
const prompt={kind:'send_prompt' as const,target:a.target,text:'y'};
for (const state of ['permission','question','unknown'] as const) {
 check(!checkCommand(prompt,{...idle,state},conn,now,active).allowed, 'raw prompt cannot bypass permission/question/unknown state');
}
check(checkCommand(prompt,idle,conn,now,active).requiresConfirmation,'ordinary idle prompt retains confirmation');
check(!checkCommand(prompt,{...idle,eventType:'permission_request'},conn,now,active).allowed,'inconsistent event cannot bypass approval');
check(!checkCommand(prompt,{...idle,eventType:'user_question'},conn,now,active).allowed,'question event alone requires structured resolution');
check(!checkCommand(prompt,{...idle,requestId:'pending'},conn,now,active).allowed,'request ID alone prevents raw text');
check(!checkCommand(prompt,{...idle,permissionEvidence:'structured_verified'},conn,now,active).allowed,'permission evidence alone prevents raw text');
console.log(`PASS: ${count} domain assertions`);

