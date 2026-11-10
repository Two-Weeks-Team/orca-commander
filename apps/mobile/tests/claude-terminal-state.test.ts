import assert from 'node:assert/strict';
import {normalizeWorktreePs} from '../src/adapters/orca-read-model';
const now=1_800_000_000_000;
function read(agent:Record<string,unknown>){
 const raw={worktrees:[{worktreeId:'worktree',repoId:'repo',repo:'Project',displayName:'Workspace',hostId:'local',unverifiableTerminalCount:0,agents:[{paneKey:'tab:leaf',agentType:'claude',state:'waiting',updatedAt:now,stateStartedAt:now-1000,conversationName:'Test Claude',...agent}]}],totalCount:1,truncated:false,hostScope:{hostIds:['local'],omittedHostIds:[]}};
 const r=normalizeWorktreePs(raw,{hostId:'host',generation:4,observedAt:now});assert.ok(r.ok);return r.agents[0];
}
assert.equal(read({programStatus:{state:'blocked',kind:'permission'}}).state,'permission','D27: waiting + original permission facet is permission, not question');
assert.equal(read({programStatus:{state:'blocked',kind:'question'}}).state,'question');
assert.equal(read({state:'blocked',programStatus:{state:'blocked',kind:'question'}}).state,'question','Claude waiting classification follows the original kind');
assert.equal(read({state:'working',programStatus:{state:'blocked',kind:'permission'}}).state,'working','a facet alone cannot turn a nonwaiting row into an interactive prompt');
const hook={programStatus:{state:'blocked',kind:'permission'},toolName:'Bash'};Object.defineProperty(hook,'toolInput',{get(){throw Error('tool input preview is not the screen');}});
assert.equal(read(hook).terminalPrompt?.toolName,'Bash','only the hook tool name is retained, never the tool input preview');
console.log('PASS: Claude terminal waiting-state projection (synthetic host metadata, no screen or send)');
