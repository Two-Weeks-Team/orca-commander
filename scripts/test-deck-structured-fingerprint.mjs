import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyUpstreamProfile} from './upstream-profile.mjs';

// Exact original helper as oracle. Synthetic operation/request data only; no host or credentials.
const upstream=resolve(process.argv[2]??'vendor/orca');
const profile=verifyUpstreamProfile(upstream);
assert.equal(profile.commit,'1c6ac8c3c4d2c3dec2cb5966d225ca2a0e0471d3','this write surface is pinned to installed-release helpers');
const original=await import(pathToFileURL(resolve(upstream,'src/shared/structured-agent-session-mutation.ts')).href);
const imported=await import(new URL('../apps/mobile/.test-build/src/adapters/structured-request-wire.js',import.meta.url));
const deck=imported.structuredFingerprint?imported:imported.default;
const originalAnswers=await import(pathToFileURL(resolve(upstream,'src/shared/native-chat-ask-answer.ts')).href);
const replyImport=await import(new URL('../apps/mobile/.test-build/src/adapters/native-async-reply.js',import.meta.url));
const replies=replyImport.formatNativeAsyncReply?replyImport:replyImport.default;
let checks=0;
const questions=[{title:'선택\r\n질문 😀',options:['첫 선택','Second']},{title:'설명',options:[]}];
for(const answers of [[{option:0},{text:'  한글\n설명  '}],[{text:''},{text:' partial '}],[{option:1}]]){
 const text=replies.formatNativeAsyncReply([{itemId:'owned-async',revision:1,callSlot:0,callId:'owned-call',questions}],answers);
 const expected=originalAnswers.formatAskAnswer({replyAsMessage:true,questions:questions.map(q=>({question:q.title,multiSelect:false,options:q.options.map(label=>({label}))}))},answers.map(a=>'option' in a?{indices:[a.option]}:{indices:[],other:a.text}));
 assert.equal(text,expected);checks++;
 const input={method:'agentSession.send',sessionId:'codex_synthetic_owned',fields:{body:{kind:'message',role:'user',blocks:[{type:'text',text}]}}};
 assert.equal(deck.structuredFingerprint(input.method,input.sessionId,input.fields),original.structuredAgentSessionPayloadFingerprint(input));checks++;
}
for(const fields of [
 {itemId:'request',expectedRevision:1,optionId:'accept'},
 {optionId:'cancel',expectedRevision:23,itemId:'한글 요청 /tmp/owned'},
 {itemId:'request',expectedRevision:9,optionId:'acceptForSession',absent:undefined},
 {answers:[{questionId:'q1',optionIds:['a','b'],other:'초안 %\nline'}],expectedRevision:2,itemId:'question'},
 {body:{kind:'message',role:'user',blocks:[{type:'text',text:'owned\n😀 한글'}]}},
]){
 for(const method of ['agentSession.respondTo:approval','agentSession.respondTo:question','agentSession.send']){
  const input={method,sessionId:'codex_synthetic_owned',fields};
  assert.equal(deck.structuredFingerprint(method,input.sessionId,fields),original.structuredAgentSessionPayloadFingerprint(input));checks++;
 }
}
const uuid=()=> '12345678-1234-4234-8234-123456789abc';
assert.equal(deck.structuredOperationId(uuid,1793640000000),original.createStructuredAgentSessionOperationId(uuid,1793640000000));checks++;
const launchImport=await import(new URL('../apps/mobile/.test-build/src/adapters/host-default-agent-wire.js',import.meta.url));
const launches=launchImport.buildHostDefaultAgentLaunch?launchImport:launchImport.default;
const launchSchema=await import(pathToFileURL(resolve(upstream,'src/shared/rpc-contract/agent-launch-params.ts')).href);
const launchResult=await import(pathToFileURL(resolve(upstream,'src/shared/agent-launch-intent.ts')).href);
const launchCaps=await import(pathToFileURL(resolve(upstream,'src/shared/agent-launch-runtime-capability.ts')).href);
for(const prompt of ['Summarize original owner context.','한글 요약 😀\nowner@example.com /Users/owner/Full Path']){
 const params=launches.buildHostDefaultAgentLaunch({worktreeId:'owned::/Users/owner/Project',operationId:deck.structuredOperationId(uuid,1793640000000),prompt});
 assert.deepEqual(launchSchema.AgentLaunchReplay.parse(params),params);checks++;
 for(const field of ['agentArgs','sessionOptions','chatOptions','accountEnv','nativeChatDefault','sessionId','paneKey']){assert.equal(Object.hasOwn(params,field),false);checks++;}
}
for(const capability of [launchCaps.AGENT_LAUNCH_RUNTIME_CAPABILITY,launchCaps.AGENT_LAUNCH_REPLAY_REQUIRED_RUNTIME_CAPABILITY,launchCaps.AGENT_LAUNCH_PROMPT_CARRY_RUNTIME_CAPABILITY,launchCaps.AGENT_LAUNCH_SURFACE_RUNTIME_CAPABILITY]){
 assert.equal(launches.HOST_DEFAULT_AGENT_CAPABILITIES.includes(capability),true);checks++;
}
const launched={worktreeId:'owned::/Users/owner/Project',outcome:{kind:'structured',sessionId:'codex_owned',handle:'owned'},receipt:{mode:'structured',preferred:'structured',reason:'requested',detail:'Original explicit chat'},prompt:{delivery:'submit',outcome:'journaled',messageId:'owned-message'}};
assert.equal(launchResult.isAgentLaunchResult(launched),true);checks++;
assert.equal(launches.readHostDefaultAgentLaunchResult(launched,launched.worktreeId).kind,'journaled');checks++;
const {codexApprovalItem}=await import(pathToFileURL(resolve(upstream,'src/main/codex/codex-structured-prompt-items.ts')).href);
const {isCodexMcpToolApproval}=await import(pathToFileURL(resolve(upstream,'src/main/codex/codex-mcp-tool-approval.ts')).href);
const caps=await import(pathToFileURL(resolve(upstream,'src/shared/agent-session-runtime-capabilities.ts')).href);
assert.equal(deck.CLAUDE_READ_CAPABILITY,caps.CLAUDE_STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY);checks++;
const target={worktreeId:'owned-wt',tabId:'owned-tab',sessionId:'codex_owned',agent:'codex',title:'Owned title'};
const marker={contract:'agent-session.current-requests.v1',sessionId:target.sessionId,epoch:'owned-epoch',publisher:'owned-publisher',revision:1,owner:'owned-owner',version:'owned-version'};
const mcpParams={message:'Run a command?',_meta:{codex_approval_kind:'mcp_tool_call',tool_params:{tool:'owned-tool'}}};
assert.equal(isCodexMcpToolApproval(mcpParams),true);checks++;
for(const [input,supported] of [
 [{method:'item/commandExecution/requestApproval',params:{command:"printf 'owned'",availableDecisions:['accept','cancel']},detail:null},true],
 [{method:'mcpServer/elicitation/request',params:mcpParams,detail:null},false],
 [{method:'item/fileChange/requestApproval',params:{availableDecisions:['accept','cancel']},detail:null},false],
 [{method:'owned/unknown/requestApproval',params:{availableDecisions:['accept','cancel']},detail:null},false],
]){
 const body=codexApprovalItem(input);
 const transport={readStructuredSnapshot:async()=>({type:'snapshot',sessionId:target.sessionId,page:{sessionId:target.sessionId,epoch:marker.epoch},fence:1,currentRequests:marker}),request:async method=>{assert.equal(method,'agentSession.currentRequests');return{marker,json:JSON.stringify([{itemId:'owned-item',revision:1,body}]),nextCursor:null};}};
 const evidence=await deck.readRequestEvidence(transport,target);assert.equal(evidence.items[0].supported,supported);checks++;
}
verifyUpstreamProfile(upstream);
console.log(`PASS: ${checks} Deck reply-format/fingerprint/operation/capability/approval comparisons with exact original helpers (${profile.commit})`);
console.log('LIMIT: synthetic wire identity oracle; no native response, transport or device proof.');
