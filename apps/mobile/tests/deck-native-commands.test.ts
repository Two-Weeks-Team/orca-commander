import assert from 'node:assert/strict';
import {resolveDeckNativeCommands,type DeckNativeCommandContext} from '../src/core/deck-native-commands';
import {bindKey,emptyDeckState,paneKey,type DeckItem} from '../src/core/deck-model';
import type {StructuredEntry} from '../src/adapters/structured-action-client';
let count=0;const same=(a:unknown,b:unknown)=>{count++;assert.deepEqual(a,b);};
const entry:StructuredEntry={runtimeId:'runtime-fixture',hostId:'fixture-host',hostVersion:'1.4.246',generation:2,observedAt:1000,target:{worktreeId:'fixture-worktree',tabId:'tab',sessionId:'session',agent:'codex',title:'Original full target'},fence:3,marker:{contract:'agent-session.current-requests.v1',sessionId:'session',epoch:'epoch',publisher:'publisher',revision:2,owner:'owner',version:'version'},items:[{itemId:'request',revision:4,supported:true,body:{kind:'approval',title:'Run a command?',detail:'Full command content',resolution:{state:'pending',selectedOptionId:null,resolvedBy:null,resolvedAt:null},options:[{id:'accept',label:'Allow',description:'Original choice explanation'},{id:'decline',label:'Deny'},{id:'acceptForSession',label:'Allow for this session'},{id:'cancel',label:'Stop'}]}}]};
const agent:DeckItem={id:'native-item',provider:'codex',title:entry.target.title,summary:'Original body',state:'permission',eventType:'permission_request',updatedAt:new Date(1000).toISOString(),target:{hostId:entry.hostId,worktreeId:entry.target.worktreeId,connectionGeneration:2},nativeRequest:{tabId:'tab',sessionId:'session',itemId:'request'},requestId:'request',permissionEvidence:'structured_verified'};
const key=bindKey(agent);
const fixture=():DeckNativeCommandContext=>({deck:{...emptyDeckState(),selected:key,present:[key],generation:2,lastLiveAt:1000,uncertaintyKnown:true},inventory:{live:true,complete:false,agents:[agent],generation:2,unresolvedPanes:new Set(),uncertaintyKnown:true,confirmedAt:1000},actions:{busy:false,journal:'ready',receipts:[]},structured:{phase:'ready',journal:'ready',busy:false,refreshing:true,inventory:null,entries:[entry],asyncEntries:[],receipts:[],skippedWorktrees:1,unsupportedTargets:[{...entry.target,sessionId:'other-session'}],unavailableTargets:[],unavailableWorktrees:['other-worktree'],asyncUnavailableTargets:[]},channel:{runtimeId:'runtime-fixture',hostId:'fixture-host',hostVersion:'1.4.246',generation:2,confirmedAt:1000},now:1100});
const slowReview=fixture();slowReview.now+=300000;same(resolveDeckNativeCommands(slowReview).allow?.option.id,'accept');
const allowed=resolveDeckNativeCommands(fixture());same(allowed.allow?.entry,entry);same(allowed.allow?.item,entry.items[0]);same(allowed.allow?.option,entry.items[0].body.options[0]);same(allowed.reject?.option.id,'decline');same(allowed.allowLock,null);same(allowed.rejectLock,null);
same(allowed.allow?.entry===entry,true);same(allowed.allow?.option===entry.items[0].body.options[0],true);
const blocked=(change:(input:DeckNativeCommandContext)=>void,reason:string)=>{const f=fixture();change(f);const result=resolveDeckNativeCommands(f);same(result.allow,null);same(result.reject,null);same(result.allowLock,reason);same(result.rejectLock,reason);};
blocked(f=>{f.deck={...f.deck,selected:null};},'no_selection');
blocked(f=>{f.deck={...f.deck,present:[]};},'not_present');
blocked(f=>{f.deck={...f.deck,validationPending:[key]};},'not_present');
blocked(f=>{f.actions={...f.actions,journal:'loading'};},'journal');
blocked(f=>{f.structured={...f.structured,journal:'unavailable'};},'journal');
blocked(f=>{f.inventory={...f.inventory,uncertaintyKnown:false};},'journal');
blocked(f=>{f.deck={...f.deck,uncertaintyKnown:false};},'journal');
blocked(f=>{f.actions={...f.actions,busy:true};},'busy');
blocked(f=>{f.structured={...f.structured,busy:true};},'busy');
blocked(f=>{f.inventory={...f.inventory,live:false};},'expired');
{const f=fixture();f.now=31100;same(resolveDeckNativeCommands(f).allow?.option.id,'accept');}
{const f=fixture();f.now=999;same(resolveDeckNativeCommands(f).allow?.option.id,'accept');}
blocked(f=>{f.channel=null;},'expired');
blocked(f=>{f.channel={...f.channel!,confirmedAt:-30000};},'expired');
blocked(f=>{f.deck={...f.deck,generation:3};},'generation');
blocked(f=>{f.inventory={...f.inventory,generation:null};},'generation');
blocked(f=>{f.inventory={...f.inventory,agents:[agent,agent]};},'duplicate');
blocked(f=>{f.inventory={...f.inventory,agents:[{...agent,state:'unknown'}]};},'unknown');
blocked(f=>{f.inventory={...f.inventory,agents:[{...agent,permissionEvidence:'missing'}]};},'unknown');
blocked(f=>{f.structured={...f.structured,phase:'unavailable'};},'native_unavailable');
blocked(f=>{f.structured={...f.structured,entries:[entry,entry]};},'duplicate');
blocked(f=>{f.structured={...f.structured,entries:[{...entry,items:[entry.items[0],entry.items[0]]}]};},'duplicate');
blocked(f=>{f.structured={...f.structured,entries:[{...entry,generation:3}]};},'generation');
blocked(f=>{f.structured={...f.structured,entries:[{...entry,observedAt:-20000}]};},'expired');
blocked(f=>{f.structured={...f.structured,entries:[{...entry,runtimeId:'other-runtime'}]};},'identity');
blocked(f=>{f.structured={...f.structured,unavailableTargets:[entry.target]};},'native_unavailable');
blocked(f=>{f.structured={...f.structured,unavailableWorktrees:[entry.target.worktreeId]};},'native_unavailable');
blocked(f=>{f.inventory={...f.inventory,unresolvedPanes:new Set([paneKey(agent)])};},'unresolved');
const receipt={operationId:'fixture-operation',hostId:'fixture-host',hostVersion:'1.4.246',worktreeId:'other-worktree',tabId:'other-tab',sessionId:'session',itemId:'different-item',revision:1,fence:1,at:1000,kind:'async_reply' as const,status:'unknown' as const,acknowledged:false};
blocked(f=>{f.structured={...f.structured,receipts:[receipt]};},'unresolved');
blocked(f=>{f.structured={...f.structured,receipts:Array.from({length:16},(_,i)=>({...receipt,sessionId:'other-'+i}))};},'uncertainty_limit');
for(const change of [
 (e:StructuredEntry)=>({...e,fence:0}),
 (e:StructuredEntry)=>({...e,marker:{...e.marker,sessionId:'wrong'}}),
 (e:StructuredEntry)=>({...e,target:{...e.target,agent:'claude'}}),
 (e:StructuredEntry)=>({...e,items:[{...e.items[0],supported:false}]}),
 (e:StructuredEntry)=>({...e,items:[{...e.items[0],body:{...e.items[0].body,subject:{kind:'plan'}}}]}),
 (e:StructuredEntry)=>({...e,items:[{...e.items[0],body:{...e.items[0].body,title:'Apply file changes?'}}]}),
 (e:StructuredEntry)=>({...e,items:[{...e.items[0],body:{...e.items[0].body,options:[{id:'accept',label:'Allow'},{id:'cancel',label:'Deny'}]}}]}),
 (e:StructuredEntry)=>({...e,items:[{...e.items[0],body:{...e.items[0].body,options:[{id:'accept',label:'Allow'},{id:'accept',label:'Allow'}]}}]})
])blocked(f=>{f.structured={...f.structured,entries:[change(entry)]};},'unsupported');
blocked(f=>{f.inventory={...f.inventory,agents:[{...agent,title:'Different displayed target'}]};},'identity');
const negativeProof=fixture();negativeProof.now=0;negativeProof.inventory={...negativeProof.inventory,confirmedAt:-1};negativeProof.deck={...negativeProof.deck,lastLiveAt:0};negativeProof.channel={...negativeProof.channel!,confirmedAt:0};negativeProof.structured={...negativeProof.structured,entries:[{...entry,observedAt:0}]};same(resolveDeckNativeCommands(negativeProof).allowLock,'expired');
const boundary=fixture();boundary.now=31000;same(resolveDeckNativeCommands(boundary).allow?.option.id,'accept');
const absentDecline=fixture();absentDecline.structured={...absentDecline.structured,entries:[{...entry,items:[{...entry.items[0],body:{...entry.items[0].body,options:entry.items[0].body.options.filter(option=>option.id!=='decline')}}]}]};same(resolveDeckNativeCommands(absentDecline).allow?.option.id,'accept');same(resolveDeckNativeCommands(absentDecline).reject,null);same(resolveDeckNativeCommands(absentDecline).rejectLock,'option_missing');
const wideOnly=fixture();wideOnly.structured={...wideOnly.structured,entries:[{...entry,items:[{...entry.items[0],body:{...entry.items[0].body,options:entry.items[0].body.options.slice(2)}}]}]};same(resolveDeckNativeCommands(wideOnly).allow,null);same(resolveDeckNativeCommands(wideOnly).reject,null);
const pane={...agent,nativeRequest:undefined,target:{...agent.target,terminalId:'pane'},requestId:undefined};const paneFixture=fixture();paneFixture.inventory={...paneFixture.inventory,agents:[pane]};paneFixture.deck={...paneFixture.deck,selected:bindKey(pane),present:[bindKey(pane)]};same(resolveDeckNativeCommands(paneFixture).allowLock,'not_native');
const asyncFixture=fixture(),asyncId=JSON.stringify(['async','question','call']);const asyncAgent={...agent,nativeRequest:{...agent.nativeRequest!,itemId:asyncId},requestId:asyncId,state:'question' as const,eventType:'user_question' as const,permissionEvidence:'missing' as const};asyncFixture.deck={...asyncFixture.deck,selected:bindKey(asyncAgent),present:[bindKey(asyncAgent)]};asyncFixture.inventory={...asyncFixture.inventory,agents:[asyncAgent]};asyncFixture.structured={...asyncFixture.structured,asyncEntries:[{...entry,context:'Original context',questions:[{itemId:'question',revision:1,callId:'call',callSlot:0,questions:[{title:'Original question',options:[]}]}]}]};same(resolveDeckNativeCommands(asyncFixture).allowLock,'async_reply');
const waiting=fixture();waiting.deck={...waiting.deck,restore:'waiting',validationPending:['different-key']};same(resolveDeckNativeCommands(waiting).allow?.option.id,'accept');
const acknowledged=fixture();acknowledged.structured={...acknowledged.structured,receipts:[{...receipt,acknowledged:true}]};same(resolveDeckNativeCommands(acknowledged).allow?.option.id,'accept');
const terminalUnknown=fixture();terminalUnknown.actions={...terminalUnknown.actions,receipts:[{acknowledged:false,status:'partial',hostId:'fixture-host',worktreeId:'fixture-worktree',paneKey:'pane',id:'prompt',hostVersion:'1.4.246',handle:'handle',incarnationId:'incarnation',at:1000,bodyAccepted:true,submitAttempted:null}]};same(resolveDeckNativeCommands(terminalUnknown).allow?.option.id,'accept');
const fifteen=fixture();fifteen.structured={...fifteen.structured,receipts:Array.from({length:15},(_,i)=>({...receipt,sessionId:'other-'+i}))};same(resolveDeckNativeCommands(fifteen).allow?.option.id,'accept');
const otherHostUnknown=fixture();otherHostUnknown.structured={...otherHostUnknown.structured,receipts:[{...receipt,hostId:'other-host'}]};same(resolveDeckNativeCommands(otherHostUnknown).allow?.option.id,'accept');
const forgedMap=fixture();forgedMap.inventory={...forgedMap.inventory,...{nativeTargets:new Map([[key,{kind:'request',entry,item:entry.items[0]}]])}};forgedMap.structured={...forgedMap.structured,entries:[]};same(resolveDeckNativeCommands(forgedMap).allowLock,'identity');
const emptyMap=fixture();emptyMap.inventory={...emptyMap.inventory,...{nativeTargets:new Map()}};same(resolveDeckNativeCommands(emptyMap).allow?.option.id,'accept');
const asyncSpoof=fixture();asyncSpoof.inventory={...asyncSpoof.inventory,agents:[{...asyncAgent,state:'permission',eventType:'permission_request',permissionEvidence:'structured_verified'}]};asyncSpoof.deck=asyncFixture.deck;asyncSpoof.structured={...asyncFixture.structured,entries:[{...entry,items:[{...entry.items[0],itemId:asyncId}]}]};same(resolveDeckNativeCommands(asyncSpoof).allowLock,'async_reply');
console.log(`PASS: ${count} deck native command assertions (pure references; no prepare, ticket, mutation or RPC)`);

const justFresh=fixture();justFresh.now=30900;same(resolveDeckNativeCommands(justFresh).allow?.option.id,'accept');

const exact249=fixture();exact249.channel={...exact249.channel!,hostVersion:'1.4.249'};exact249.structured={...exact249.structured,entries:[{...entry,hostVersion:'1.4.249'}]};same(resolveDeckNativeCommands(exact249).allow?.option.id,'accept');same(resolveDeckNativeCommands(exact249).reject?.option.id,'decline');
for(const hostVersion of ['1.4.250','v1.4.249','1.4.249-beta','1.4.249.0']){const f=fixture();f.channel={...f.channel!,hostVersion};f.structured={...f.structured,entries:[{...entry,hostVersion}]};same(resolveDeckNativeCommands(f).allow?.option.id,'accept');}
