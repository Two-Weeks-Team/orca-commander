import assert from 'node:assert/strict';
import {normalizeWorktreePs} from '../src/adapters/orca-read-model';

const now=1_800_000_000_000,ctx={hostId:'paired-host',generation:4,observedAt:now};
const hook={paneKey:'tab-hook:leaf-hook',agentType:'codex',state:'working',updatedAt:now-1000,stateStartedAt:now-2000,conversationName:'Working tab',lastAssistantMessage:'Original owner content'};
const listing={worktrees:[{worktreeId:'workspace',repoId:'repo',repo:'Project',displayName:'Workspace',hostId:'local',unverifiableTerminalCount:0,agents:[hook]}],totalCount:1,truncated:false,hostScope:{hostIds:['local'],omittedHostIds:[]}};
const terminal={handle:'terminal-supervisor',worktreeId:'workspace',tabId:'tab-supervisor',leafId:'leaf-supervisor',agentIdentity:'claude',title:'감독 e\u0301 😀',connected:true,writable:true,orphaned:false,lastOutputAt:now-500};
const catalog=(rows:unknown[])=>({terminals:rows,totalCount:rows.length,truncated:false,hostScope:{hostIds:['local'],omittedHostIds:[]}});
const status=(handle:string,status:string|null='idle',isRunningAgent=true)=>({agentStatus:{handle,status,isRunningAgent}});
type Evidence={catalog:unknown;statuses:ReadonlyMap<string,unknown>};
const normalize=(evidence:Evidence)=>Reflect.apply(normalizeWorktreePs,undefined,[listing,ctx,evidence]) as ReturnType<typeof normalizeWorktreePs>;
let checks=0;
const equal=(actual:unknown,expected:unknown,label:string)=>{checks++;assert.deepEqual(actual,expected,label);};

// A visible, process-identified pane can supplement hooks; an orphan process cannot.
const ready=normalize({catalog:catalog([terminal]),statuses:new Map([[terminal.handle,status(terminal.handle)]])});
assert.ok(ready.ok);equal(ready.agents.length,2,'the hook-less agent must be present beside the hook agent');
const supervisor=ready.agents.find(a=>a.target.terminalId==='tab-supervisor:leaf-supervisor');assert.ok(supervisor);
equal(supervisor.title,terminal.title,'preserve the complete host tab title');
const suffixed=normalize({catalog:catalog([{...terminal,title:'Supervisor | Workspace'}]),statuses:new Map([[terminal.handle,status(terminal.handle)]])});assert.ok(suffixed.ok);equal(suffixed.agents[1]?.title,'Supervisor','remove only the exact workspace suffix');
equal(supervisor.provider,'claude','use the original terminal agent identity');
equal(supervisor.state,'idle','use the exact original terminal status');
equal(supervisor.target,{hostId:'paired-host',connectionGeneration:4,worktreeId:'workspace',terminalId:'tab-supervisor:leaf-supervisor'},'bind the original host/worktree/tab/leaf and generation');
equal(supervisor.dashboard?.stateChangedAt,null,'a title-derived pane has no published state event time');
equal(supervisor.dashboard?.visible,false,'plain process identity is idle and hidden like the default desktop dashboard');
equal(supervisor.permissionEvidence,'missing','a visible pane never supplies structured approval authority');
equal(supervisor.livePty,true,'a connected original PTY backs the row with verified visual membership');
equal(ready.agents[0]?.summary,hook.lastAssistantMessage,'leave original hook content intact');

const samePane={...terminal,tabId:'tab-hook',leafId:'leaf-hook'};
const joined=normalize({catalog:catalog([samePane]),statuses:new Map([[samePane.handle,status(samePane.handle,'idle')]])});
assert.ok(joined.ok);equal(joined.agents.length,1,'do not duplicate an existing hook pane');equal(joined.agents[0]?.state,'working','hook evidence is not overwritten by a fallback');

for(const row of [{...terminal,orphaned:true},{...terminal,orphaned:undefined},{...terminal,agentIdentity:null},{...terminal,connected:false},{...terminal,worktreeId:'other-workspace'}]){
 const value=normalize({catalog:catalog([row]),statuses:new Map([[terminal.handle,status(terminal.handle)]])});assert.ok(value.ok);equal(value.agents.length,1,'shell, disconnected and foreign-workspace rows are not agents for this workspace');
}
const shell=normalize({catalog:catalog([terminal]),statuses:new Map([[terminal.handle,status(terminal.handle,null,false)]])});
assert.ok(shell.ok);equal(shell.agents.length,1,'a released agent identity must not brand its shell');

for(const states of [new Map<string,unknown>(),new Map([[terminal.handle,status('wrong-handle','working')]])]){
 const value=normalize({catalog:catalog([terminal]),statuses:states});assert.ok(value.ok);
 equal(value.agents.find(a=>a.target.terminalId==='tab-supervisor:leaf-supervisor')?.state,'unknown','missing or mismatched status stays visibly unknown');
 equal(value.inventory.complete,false,'uncertain supplementary evidence cannot prove global absence');
}
const previewGuard={...terminal};Object.defineProperty(previewGuard,'preview',{get(){throw new Error('terminal preview must never be inspected');},enumerable:true});
const metadataOnly=normalize({catalog:catalog([previewGuard]),statuses:new Map([[terminal.handle,status(terminal.handle)]])});assert.ok(metadataOnly.ok);equal(metadataOnly.agents[1]?.summary,'','catalog previews never enter snapshots or persisted display metadata');
const permission=normalize({catalog:catalog([terminal]),statuses:new Map([[terminal.handle,status(terminal.handle,'permission')]])});
assert.ok(permission.ok);equal(permission.agents[1]?.state,'question','original attention status remains visible');equal(permission.agents[1]?.permissionEvidence,'missing','attention is not an offered permission request');

const duplicate={...terminal,handle:'other-handle'};
const ambiguous=normalize({catalog:catalog([terminal,duplicate]),statuses:new Map([[terminal.handle,status(terminal.handle)],[duplicate.handle,status(duplicate.handle,'working')]])});
assert.ok(ambiguous.ok);equal(ambiguous.agents.filter(a=>a.target.terminalId==='tab-supervisor:leaf-supervisor').length,1,'ambiguous panes have one inert row');
equal(ambiguous.agents.find(a=>a.target.terminalId==='tab-supervisor:leaf-supervisor')?.state,'unknown','no arbitrary terminal wins duplicate identity');
equal(ambiguous.inventory.complete,false,'duplicate original identities cannot prove completeness');

const partial=normalize({catalog:{...catalog([terminal]),truncated:true,totalCount:2},statuses:new Map([[terminal.handle,status(terminal.handle)]])});
assert.ok(partial.ok);equal(partial.inventory.complete,false,'a truncated terminal catalog is partial even when a hook list is complete');
equal(partial.agents.some(a=>a.target.terminalId==='tab-supervisor:leaf-supervisor'),true,'partial positive pane evidence is still useful');

console.log(`PASS: ${checks} terminal-derived agent inventory assertions (synthetic original read shapes; no host writes)`);
