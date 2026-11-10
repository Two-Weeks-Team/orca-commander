import assert from 'node:assert/strict';
import {deriveControllerFrame,checkFrame,resolveNativeTarget,previewField,type FrameSemantic} from '../src/core/controller-frame';
let count=0,sequence=0;
const same=(a:unknown,b:unknown)=>{count++;assert.deepEqual(a,b);};
const nextId=()=>`fixture-frame-${++sequence}`;
const semantic:FrameSemantic={link:'LIVE',phase:'idle',focus:{kind:'pane',hostId:'fixture-host',generation:1,worktreeId:'fixture-worktree',paneKey:'fixture-pane',provider:'codex',title:'Full owner title',state:'working',position:{n:1,m:2}},counts:{attention:0,working:2,done:0,unknown:0},voice:{phase:'idle'},outcome:{unresolved:0,focusedUnresolved:0}};
const clock={now:100,confirmedAt:0,channelConfirmedAt:0};
// D29: frames compare semantic identity; the action owner must obtain fresh host proof.
{
 const original=deriveControllerFrame(null,semantic,clock,nextId);
 same(checkFrame(original,original.id,300100),{ok:true});
 const target={kind:'pane' as const,hostId:'fixture-host',hostVersion:'1.4.251',generation:1,worktreeId:'fixture-worktree',paneKey:'fixture-pane',handle:'full-handle',incarnationId:'same-process'};
 const armed:FrameSemantic={...semantic,phase:'armed',armed:{action:'input',target,content:'same body',openedAt:100,origin:'typed'}};
 const captured=deriveControllerFrame(null,armed,clock,nextId);
 const after=deriveControllerFrame(captured,armed,{now:300100,confirmedAt:300100,channelConfirmedAt:300100},nextId);
 same(after.phase,'armed');same(after.id,captured.id);same(checkFrame(after,captured.id,300100,true),{ok:true});
 const changed=deriveControllerFrame(after,{...armed,armed:{...armed.armed!,target:{...target,incarnationId:'new-process'}}},{now:300100,confirmedAt:300100,channelConfirmedAt:300100},nextId);
 same(checkFrame(changed,captured.id,300100,true),{ok:false,reason:'target_changed'});
}

const first=deriveControllerFrame(null,semantic,clock,nextId);
const heartbeat=deriveControllerFrame(first,semantic,{now:200,confirmedAt:100,channelConfirmedAt:100},nextId);
same(heartbeat.id,first.id);
same('expiresAt' in heartbeat,false);
same(checkFrame(heartbeat,first.id,200),{ok:true});
for(const changed of [
 {...semantic,focus:{...semantic.focus!,title:'Changed title'}},
 {...semantic,focus:{...semantic.focus!,generation:2}},
 {...semantic,focus:{...semantic.focus!,paneKey:'different-pane'}},
 {...semantic,phase:'draft' as const,draft:{text:'Changed content',origin:'typed' as const,target:semantic.focus!}},
]){
 const frame=deriveControllerFrame(first,changed,clock,nextId);
 same(frame.id===first.id,false);
 same(checkFrame(frame,first.id,100),{ok:false,reason:'target_changed'});
}
same(deriveControllerFrame(first,semantic,{...clock,now:30001},nextId).focus,null);
same(deriveControllerFrame(first,{...semantic,link:'OFFLINE'},clock,nextId).counts,null);
same(checkFrame(first,first.id,30001),{ok:true});
same(deriveControllerFrame(first,semantic,{...clock,now:29900},nextId).focus,semantic.focus);
same(checkFrame(first,first.id,-1),{ok:false,reason:'target_changed'});
const target={kind:'pane' as const,hostId:'fixture-host',hostVersion:'1.4.246',generation:1,worktreeId:'fixture-worktree',paneKey:'fixture-pane',handle:'full-handle',incarnationId:'process-one'};
const armed:FrameSemantic={...semantic,phase:'armed',armed:{action:'input',target,content:'Owner full text\nsecond line',openedAt:100,origin:'typed'}};
const a=deriveControllerFrame(null,armed,clock,nextId);
const later=deriveControllerFrame(a,armed,{now:30100,confirmedAt:30000,channelConfirmedAt:30000},nextId);
same(later.id,a.id);
same('remainingMs' in later,false);
same(checkFrame(later,a.id,30100,true),{ok:true});
const expired=deriveControllerFrame(later,armed,{now:30101,confirmedAt:30100,channelConfirmedAt:30100},nextId);
same(expired.phase,'armed');
same(checkFrame(expired,expired.id,30101,true),{ok:true});
const staleChannel=deriveControllerFrame(null,armed,{now:30100,confirmedAt:30000,channelConfirmedAt:0},nextId);
same(checkFrame(staleChannel,staleChannel.id,30100,true),{ok:true});
const unknownJournal=deriveControllerFrame(null,{...armed,outcome:{unresolved:null,focusedUnresolved:null}},clock,nextId);
same(unknownJournal.outcome.unresolved,null);
same(checkFrame(unknownJournal,unknownJournal.id,100,true),{ok:false,reason:'journal_unavailable'});
same(a.armed?.target,target);
same(a.armed?.content,armed.armed!.content);
const contentChange=deriveControllerFrame(a,{...armed,armed:{...armed.armed!,content:'Other body'}},clock,nextId);
same(contentChange.id===a.id,false);
const processChange=deriveControllerFrame(a,{...armed,armed:{...armed.armed!,target:{...target,incarnationId:'process-two'}}},clock,nextId);
same(processChange.id===a.id,false);
// A pane title matching a native request proves no join. Native identities require one exact verified current match.
const native={kind:'native' as const,hostId:'fixture-host',generation:1,worktreeId:'fixture-worktree',tabId:'tab-one',sessionId:'session-one',itemId:'request-one',revision:2};
const inventory=[{...native,verified:true,supported:true}];
same(resolveNativeTarget(semantic.focus!,inventory),null);
same(resolveNativeTarget(native,inventory),inventory[0]);
same(resolveNativeTarget({...native,revision:3},inventory),null);
same(resolveNativeTarget(native,[...inventory,...inventory]),null);
same(resolveNativeTarget(native,[{...inventory[0],verified:false}]),null);
same(resolveNativeTarget({...native,generation:2},inventory),null);
same(previewField('title','😀'.repeat(81)).truncated,true);
same(previewField('title','😀'.repeat(81)).fullLength,81);
same(Array.from(previewField('title','😀'.repeat(81)).text).length,81); // 80 + visible ellipsis
console.log(`PASS: ${count} semantic frame assertions (pure; no bridge, phone or host)`);
