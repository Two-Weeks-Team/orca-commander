import {readHostDefaultSelection,hasHostDefaultAgentLaunchSupport,buildHostDefaultAgentLaunch,readHostDefaultAgentLaunchResult,HOST_DEFAULT_AGENT_CAPABILITIES} from '../src/adapters/host-default-agent-wire';
let n=0;const check=(value:unknown,message:string)=>{n++;if(!value)throw new Error(message);};
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const selected=(agent:unknown,disabled:unknown=[])=>({settings:{defaultTuiAgent:agent,disabledTuiAgents:disabled}});
check(JSON.stringify(readHostDefaultSelection(selected('codex')))==='{"ok":true,"agent":"codex"}','explicit host Codex is selected without a new fallback');
for(const [value,reason] of [[selected(null),'automatic'],[selected('blank'),'none'],[selected('codex',['codex']),'disabled'],[selected('claude'),'unsupported'],[selected('gemini'),'unsupported'],[selected('unexpected'),'unsupported'],[selected(' codex '),'unsupported'],[selected(undefined),'unavailable'],[selected('codex',[4]),'unavailable'],[selected('codex',null),'unavailable'],[{},'unavailable'],[null,'unavailable']] as const){
 const r=readHostDefaultSelection(value);check(!r.ok&&r.reason===reason,'unproven, disabled, automatic or absent host default never silently launches Codex');
}
const privateFields={settings:{defaultTuiAgent:'codex',disabledTuiAgents:[],get agentCmdOverrides(){throw new Error('custom command inspected');},get agentDefaultArgs(){throw new Error('arguments inspected');},get agentDefaultEnv(){throw new Error('environment inspected');}}};
check(JSON.stringify(readHostDefaultSelection(privateFields))==='{"ok":true,"agent":"codex"}','selection consumes and returns no custom launch text or environment');
for(const version of ['1.4.246','1.4.248','1.4.249']){
 const status={appVersion:version,capabilities:[...HOST_DEFAULT_AGENT_CAPABILITIES]};
 check(hasHostDefaultAgentLaunchSupport(status,version),'exact supported '+version+' launch surface is available');
 for(const capability of HOST_DEFAULT_AGENT_CAPABILITIES)check(!hasHostDefaultAgentLaunchSupport({...status,capabilities:status.capabilities.filter(v=>v!==capability)},version),'each original launch capability remains mandatory');
 for(const bad of [{...status,capabilities:null},{...status,capabilities:[...status.capabilities,5]},{}])check(!hasHostDefaultAgentLaunchSupport(bad,version),'malformed capability evidence stays unavailable');
}
for(const version of ['1.4.245','1.4.247','1.4.250','9.0.0','v1.4.249','1.4.249-beta','1.4.249.0','v1.4.248','1.4.248-beta'])check(hasHostDefaultAgentLaunchSupport({appVersion:version,capabilities:[...HOST_DEFAULT_AGENT_CAPABILITIES]},version),'launch capability shape is independent of release labels');
const operationId='1793678400000-00000000000000000000000000000001';
const input={worktreeId:'repo::/Users/owner/Project',operationId,prompt:'  Summarize this full context\nowner@example.com /Users/owner/Project  '};
const params=buildHostDefaultAgentLaunch(input);
check(JSON.stringify(params)===JSON.stringify({agent:'codex',operationId,target:{kind:'existing',worktree:'id:repo::/Users/owner/Project'},surface:'chat',prompt:{text:input.prompt,delivery:'submit'}}),'original minimal launch shape preserves owner text and omits account/model/permission/argument overrides');
for(const bad of [{...input,worktreeId:''},{...input,worktreeId:'id:repo::/path'},{...input,operationId:'new-operation'},{...input,prompt:' \n '},{...input,prompt:'가'.repeat(90_000)}])check(buildHostDefaultAgentLaunch(bad)===null,'empty, double-prefixed, invalid identity or oversized intent cannot form a launch');
const result={worktreeId:input.worktreeId,outcome:{kind:'structured',sessionId:'codex_owned',handle:'owned'},receipt:{mode:'structured',preferred:'structured',reason:'requested',detail:'Original chat'},prompt:{delivery:'submit',outcome:'journaled',messageId:'owned-message'}};
const parsed=readHostDefaultAgentLaunchResult(result,input.worktreeId);
check(parsed.kind==='journaled'&&parsed.sessionId==='codex_owned'&&parsed.messageId==='owned-message','correlated original structured/journaled result supplies exact observation identity, not completion');
for(const mutate of [(r:any)=>r.worktreeId='other',(r:any)=>r.outcome.sessionId='claude_other',(r:any)=>r.outcome.kind='terminal',(r:any)=>delete r.outcome.handle,(r:any)=>r.receipt.mode='terminal',(r:any)=>delete r.receipt.detail,(r:any)=>r.prompt.outcome='unconfirmed',(r:any)=>r.prompt.outcome='handed-to-terminal',(r:any)=>r.prompt.outcome='not-delivered',(r:any)=>delete r.prompt.messageId,(r:any)=>r.prompt.delivery='draft',(r:any)=>delete r.prompt]){
 const r=clone(result);mutate(r);check(readHostDefaultAgentLaunchResult(r,input.worktreeId).kind==='unknown','unconfirmed, wrong target/provider/surface or malformed launch remains unknown');
}
check(readHostDefaultAgentLaunchResult({ok:true},input.worktreeId).kind==='unknown','generic success does not prove a journaled prompt or task completion');
console.log(`PASS: ${n} host default-agent wire assertions (synthetic; real API proof recorded separately)`);
