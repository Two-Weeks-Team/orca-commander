import {createTestActionClient} from './helpers/create-action-client';
import type {ActionChannel} from '../src/adapters/action-client';
import type {AgentSnapshot} from '../src/core/types';

let count=0;
function check(v:unknown,message:string){count++;if(!v)throw new Error(message);}
const now=1_793_816_000_000;
const agent:AgentSnapshot={id:'a',provider:'codex',title:'Owned task',summary:'',state:'done',eventType:'informational',updatedAt:new Date(now).toISOString(),target:{hostId:'host',connectionGeneration:1,worktreeId:'worktree',terminalId:'tab:leaf'}};
const terminal={handle:'term_current',incarnationId:'process',worktreeId:'worktree',tabId:'tab',leafId:'leaf',connected:true,writable:true,executionHostId:'local',orphaned:false};
const orphan={...terminal,handle:'term_orphan',ptyId:'old-pty',tabId:'pty:old-pty',leafId:'pty:old-pty',recordedPaneKey:'tab:leaf',orphaned:true};
function fixture(rows:Record<string,unknown>[]){
 let current=rows;
 const writes:Record<string,unknown>[]=[];
 const channel:ActionChannel={runtimeId:'runtime-fixture',hostVersion:'1.4.248',hostId:'host',generation:1,confirmedAt:now,agents:[agent],transport:{acquireTerminalInput:async()=>({isActive:()=>true,release:async()=>{}}),async request(method,p){if(method==='status.get')return{runtimeId:'runtime-fixture',capabilities:['terminal.prompt-delivery.v1']};
  if(method==='terminal.list')return{terminals:current,truncated:false};
  if(method==='terminal.send'){writes.push(p??{});return{send:{accepted:true,writeSettlement:{outcome:'accepted'}}};}
  throw new Error('No alternate identity RPC is permitted');
 }}};
 return{client:createTestActionClient(()=>channel,()=>now),writes,setRows:(next:Record<string,unknown>[])=>{current=next;}};
}
async function main(){
 for(const row of [orphan,{...orphan,tabId:'tab',leafId:'leaf'}]){
  const f=fixture([row]),p=await f.client.prepare(agent,'Reviewed body');
  check(!p.ok&&p.reason==='target_not_on_desktop','an unowned target has a specific refusal instead of an identity fallback or generic failure');
  check(f.writes.length===0,'explaining a recorded pane claim never writes to its PTY');
 }
 const unrelated=fixture([{...orphan,worktreeId:'other-worktree'}]),foreign=await unrelated.client.prepare(agent,'No guess');
 check(!foreign.ok&&foreign.reason!=='target_not_on_desktop','a foreign worktree claim cannot explain this target');
 const otherPane=fixture([{...orphan,recordedPaneKey:'other:leaf'}]),missing=await otherPane.client.prepare(agent,'No guess');
 check(!missing.ok&&missing.reason!=='target_not_on_desktop','a different historical pane cannot explain this target');
 const owned=fixture([terminal,orphan]),p=await owned.client.prepare(agent,'Current graph owner');
 check(p.ok&&p.confirmation.handle==='term_current','current graph ownership wins over an old orphan claim without selecting that orphan');
 const changed=fixture([terminal]),c=await changed.client.prepare(agent,'Prepared original owner');check(c.ok,'prepare the current graph-owned process');if(!c.ok)return;
 changed.setRows([{...terminal,orphaned:true}]);
 check((await changed.client.confirm(c.confirmation)).status==='target_changed'&&changed.writes.length===0,'an orphaned process cannot retain a prepared write authority even if its old pane fields remain');
 console.log(`PASS: ${count} unowned terminal refusal assertions`);
}
void main().catch(error=>{throw error;});
