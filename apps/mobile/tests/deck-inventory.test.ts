import assert from 'node:assert/strict';
import {combineDeckInventory} from '../src/adapters/deck-inventory';
import type {LiveSnapshot} from '../src/adapters/live-session';
import type {StructuredState,StructuredEntry} from '../src/adapters/structured-action-client';
import {bindKey,emptyDeckState,reconcileDeck,pressKey,deriveDeckView} from '../src/core/deck-model';
let count=0;
const same=(a:unknown,b:unknown)=>{count++;assert.deepEqual(a,b);};
const evidence={hostId:'fixture-host',generation:1,observedAt:1000,worktreeIds:['fixture-worktree'],complete:true,scopeIdentity:'fixture-scope'};
const live:LiveSnapshot={phase:'live',attempt:0,agents:[{id:'pane',provider:'codex',title:'Full owner path /Users/owner/work and email owner@example.test',summary:'Full owner body',state:'working',eventType:'informational',updatedAt:new Date(1000).toISOString(),target:{hostId:'fixture-host',worktreeId:'fixture-worktree',terminalId:'fixture-pane',connectionGeneration:1}}],host:{hostId:'fixture-host',endpointHost:'fixture.invalid',pairedAt:new Date(0).toISOString()},connection:{hostId:'fixture-host',generation:1,online:true,paired:true,lastConfirmedAt:new Date(1000).toISOString()},inventory:evidence};
const entry:StructuredEntry={runtimeId:'runtime-fixture',hostId:'fixture-host',hostVersion:'1.4.246',generation:1,observedAt:1000,target:{worktreeId:'fixture-worktree',tabId:'tab-one',sessionId:'session-one',agent:'codex',title:'Full native title /Users/owner/native'},fence:3,marker:{contract:'agent-session.current-requests.v1',sessionId:'session-one',epoch:'epoch',publisher:'publisher',revision:1,owner:'owner',version:'version'},items:[{itemId:'request-one',revision:1,supported:true,body:{kind:'approval',title:'Run a command?',detail:'Full original request',options:[{id:'accept',label:'Allow'}]}}]};
const native:StructuredState={phase:'ready',journal:'ready',busy:false,refreshing:false,inventory:evidence,skippedWorktrees:0,unsupportedTargets:[],unavailableTargets:[],unavailableWorktrees:[],asyncUnavailableTargets:[],asyncEntries:[],entries:[entry],receipts:[]};
const first=combineDeckInventory(live,native,1100);
same(combineDeckInventory(live,native,30900).live,true);
same(combineDeckInventory(live,native,31100).live,false);
same(first.complete,true);
same(first.uncertaintyKnown,false);
same(first.unresolvedCount,null);
same(combineDeckInventory(live,native,1100,{journal:'ready',receipts:[]}).uncertaintyKnown,true);
same(combineDeckInventory(live,{...native,journal:'unavailable'},1100,{journal:'ready',receipts:[]}).uncertaintyKnown,false);
same(combineDeckInventory(live,native,1100,{journal:'loading',receipts:[]}).uncertaintyKnown,false);
same(first.agents.length,2);
same(first.agents[0].title,live.agents[0].title);
same(first.agents[0].summary,live.agents[0].summary);
same(first.agents[1].title,entry.target.title);
same(JSON.parse(first.agents[1].summary),entry.items[0].body);
same(first.agents[1].nativeRequest,{tabId:'tab-one',sessionId:'session-one',itemId:'request-one'});
same(first.nativeTargets.get(bindKey(first.agents[1]))?.kind,'request');
same(first.confirmedAt,1000);
for(const changed of [
 {...native,inventory:null}, {...native,refreshing:true}, {...native,phase:'unavailable' as const},
 {...native,inventory:{...evidence,generation:2}}, {...native,inventory:{...evidence,hostId:'different-host'}},
 {...native,inventory:{...evidence,worktreeIds:[]}}, {...native,inventory:{...evidence,worktreeIds:['fixture-worktree','fixture-worktree']}},
 {...native,unavailableWorktrees:['fixture-worktree']}, {...native,skippedWorktrees:1},
 {...native,unavailableTargets:[entry.target]}, {...native,unsupportedTargets:[entry.target]}, {...native,asyncUnavailableTargets:[entry.target]},
 {...native,entries:[entry,entry]}, {...native,entries:[{...entry,observedAt:-20000}]},
])same(combineDeckInventory(live,changed,1100).complete,false);
same(combineDeckInventory({...live,inventory:undefined},native,1100).complete,false);
same(combineDeckInventory({...live,inventory:{...evidence,complete:false}},native,1100).complete,false);
same(combineDeckInventory(live,native,31001).live,false);
same(combineDeckInventory(live,native,999).live,false);
same(combineDeckInventory({...live,phase:'reconnecting'},native,1100).agents,[]);
for(const target of [{...live.agents[0].target,connectionGeneration:2},{...live.agents[0].target,hostId:'different-host'},{...live.agents[0].target,worktreeId:'absent-worktree'}])same(combineDeckInventory({...live,agents:[{...live.agents[0],target}]},native,1100).complete,false);
same(combineDeckInventory(live,{...native,entries:[{...entry,generation:2}]},1100).agents.length,1);
const asyncEntry={...entry,items:[],context:'Full owner original context',questions:[{itemId:'question-one',revision:2,callId:'call-one',callSlot:0,questions:[{title:'Owner question',options:['First original option','Second original option']}]}]};
const questionProjection=combineDeckInventory(live,{...native,entries:[],asyncEntries:[asyncEntry]},1100);
same(questionProjection.complete,true);
same(questionProjection.agents[1].state,'question');
same(questionProjection.nativeTargets.get(bindKey(questionProjection.agents[1]))?.kind,'async_reply');
const nativeGap=combineDeckInventory(live,{...native,inventory:null,unsupportedTargets:[entry.target]},1100,{journal:'ready',receipts:[]});
same(nativeGap.sourceCoverage,{pane:true,native:false});
same(combineDeckInventory(live,{...native,entries:[entry,entry]},1100).sourceCoverage,{pane:true,native:false});
const panePartialState=reconcileDeck(emptyDeckState(),nativeGap,1100);
same(pressKey(panePartialState,0,1100).accepted,true);
const panePartialView=deriveDeckView(pressKey(panePartialState,0,1100).state,{...nativeGap,now:1100,link:'LIVE',journalReady:true,busy:false,caps:{input:true,approve:true,speech:true}});
same(panePartialView.commands.content,true);
// A partial listing still counts what it has; `partial` marks the count as a lower bound.
same(panePartialView.display.counts,{attention:1,working:1,monitoring:0,done:0,unknown:0});
same(panePartialView.display.partial,true);
same(nativeGap.scopeIdentity,'fixture-scope');
const ambiguousPane=combineDeckInventory({...live,inventory:{...evidence,complete:false,ambiguousPanes:[JSON.stringify(['fixture-worktree','fixture-pane'])]}},native,1100,{journal:'ready',receipts:[]});
same(ambiguousPane.agents.some(agent=>agent.target.terminalId==='fixture-pane'),false);
same(ambiguousPane.complete,false);
same(ambiguousPane.agents.length,1); // Independent native positive still survives.
const partialPaneProof=combineDeckInventory({...live,inventory:{...evidence,complete:false}},{...native,inventory:null},1100,{journal:'ready',receipts:[]});
same(partialPaneProof.complete,false);
same(partialPaneProof.sourceCoverage?.pane,false);
same(partialPaneProof.validatedKeys?.has(bindKey(live.agents[0])),true);
same(ambiguousPane.validatedKeys?.has(bindKey(live.agents[0])),false);
const duplicatePaneProof=combineDeckInventory({...live,agents:[...live.agents,...live.agents],inventory:{...evidence,complete:false}},native,1100,{journal:'ready',receipts:[]});
same(duplicatePaneProof.validatedKeys?.has(bindKey(live.agents[0])),false);
for(const wrong of [{...evidence,hostId:'wrong-host'},{...evidence,generation:2},{...evidence,observedAt:999}]){
 const wrongScope=combineDeckInventory({...live,inventory:wrong},native,1100,{journal:'ready',receipts:[]});
 same(wrongScope.validatedKeys?.size,0);same(wrongScope.agents.length,0);
}
console.log(`PASS: ${count} combined inventory assertions (synthetic validated sources; no RPC or device)`);
