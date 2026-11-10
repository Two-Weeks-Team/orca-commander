import {ReadOnlyOrcaClient} from '../src/adapters/read-only-orca-client';
import assert from 'node:assert/strict';
import {parseTerminalReply} from '../src/adapters/terminal-reply-evidence';
const target={worktreeId:'workspace',paneKey:'tab:leaf',handle:'term-fixture',incarnationId:'incarnation-1'};
const tab={id:'mobile-tab',type:'terminal',parentTabId:'tab',leafId:'leaf',terminal:'term-fixture',incarnationId:'incarnation-1',agentStatus:{paneKey:'tab:leaf',terminalHandle:'term-fixture',worktreeId:'workspace',state:'done',stateStartedAt:400,updatedAt:500,turnEndedAt:400,turnEndDisposition:'identified',lastAssistantMessage:'A final response',lastAssistantMessageIsToolOutput:false}};
const raw={worktree:'workspace',publicationEpoch:'epoch',snapshotVersion:2,tabs:[tab]};
const reply=parseTerminalReply(raw,target);assert.ok(reply,'a matching terminal tab retains its exact response metadata');
assert.equal(reply.body,'A final response');assert.equal(reply.knownToolOutput,false);
assert.equal(parseTerminalReply({...raw,tabs:[{...tab,agentStatus:{...tab.agentStatus,lastAssistantMessageIsToolOutput:true}}]},target)?.knownToolOutput,true,'known tool output must remain distinguishable');
assert.equal(parseTerminalReply({...raw,tabs:[{...tab,agentStatus:{...tab.agentStatus,lastAssistantMessage:undefined}}]},target)?.body,null,'missing body is never filled from a preview');
for(const changed of [{...target,paneKey:'tab:closed'},{...target,incarnationId:'other'},{...target,handle:'other'},{...target,worktreeId:'other'}])assert.equal(parseTerminalReply(raw,changed),undefined);
assert.equal(parseTerminalReply({...raw,tabs:[tab,tab]},target),undefined,'duplicate exact panes are ambiguous');
assert.equal(parseTerminalReply({...raw,publicationEpoch:'none'},target),undefined,'placeholder publications are not response evidence');
assert.equal(parseTerminalReply({...raw,tabs:[{...tab,type:'agent-session'}]},target),undefined,'native session identity cannot be joined to a terminal pane');
assert.equal(parseTerminalReply({...raw,tabs:[{...tab,agentStatus:{...tab.agentStatus,paneKey:'wrong:leaf'}}]},target),undefined);
const extra=parseTerminalReply({...raw,tabs:[{...tab,private:'excluded',agentStatus:{...tab.agentStatus,toolInput:'excluded',prompt:'excluded',providerSession:'excluded'}}]},target);
assert.equal(JSON.stringify(extra).includes('excluded'),false,'copy only bounded response metadata, never the complete session');
assert.equal(JSON.stringify(parseTerminalReply(raw,{...target,private:'excluded'} as typeof target)).includes('excluded'),false,'target metadata is copied by allowlist too');
assert.equal(parseTerminalReply({...raw,tabs:[{...tab,agentStatus:{...tab.agentStatus,mainAgent:{state:'working',stateStartedAt:600}}}]},target)?.state,'working','a live main agent cannot be announced as a finished aggregate row');
assert.equal(parseTerminalReply({...raw,tabs:[{...tab,agentStatus:{...tab.agentStatus,mainAgent:{state:'done',stateStartedAt:400,outcome:'unconfirmed'}}}]},target)?.unconfirmed,true,'unconfirmed outcomes remain distinct from finished answers');
assert.equal(parseTerminalReply({...raw,tabs:[{...tab,agentStatus:{...tab.agentStatus,mainAgent:{state:'done',stateStartedAt:400,stopping:true}}}]},target)?.stopping,true);
console.log('PASS: exact terminal reply identity/publication, non-tool distinction and metadata whitelist (source-shaped fixture; not a live RPC)');

async function clientBoundary(){
 const calls:string[]=[];let version=2;
 const client=new ReadOnlyOrcaClient({hostId:'host',paired:true,now:()=>1000,transport:{request:async(method)=>{calls.push(method);if(method==='status.get')return{runtimeId:'runtime',protocolVersion:3,minCompatibleMobileVersion:2,capabilities:[],graphStatus:'ready',appVersion:'1.4.248'};if(method==='session.tabs.list')return{...raw,snapshotVersion:version};throw Error('unexpected method');}}});
 await client.connect();const read=await client.readTerminalReply(target);
 assert.equal(read.reply?.body,'A final response','the read client keeps exact reply evidence from its existing tab read');
 assert.equal(read.issuedAt,1000,'reply read freshness begins at request issue');
 assert.deepEqual(calls,['status.get','session.tabs.list'],'reply reading adds no write or new RPC');
 version=1;await assert.rejects(client.readTerminalReply(target),{code:'stale_tabs_snapshot'},'reply observations retain the original publication version gate');
 await client.disconnect();
 console.log('PASS: terminal reply client uses existing tab RPC and publication gate (fake transport; no live API)');
}
void clientBoundary();
