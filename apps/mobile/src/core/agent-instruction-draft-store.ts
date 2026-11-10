export interface AgentInstructionDraft {readonly draft:string;readonly worktreeId:string}
export interface AgentInstructionDraftStore {
 getSnapshot():Readonly<AgentInstructionDraft>;
 subscribe(listener:()=>void):()=>void;
 setDraft(draft:string):void;
 setWorktreeId(worktreeId:string):void;
}
/** One in-memory owner outside the modal lifetime. No normalization, persistence or action authority. */
export function createAgentInstructionDraftStore():AgentInstructionDraftStore {
 let snapshot:Readonly<AgentInstructionDraft>=Object.freeze({draft:'',worktreeId:''});
 const listeners=new Set<()=>void>();
 const publish=(next:AgentInstructionDraft)=>{snapshot=Object.freeze(next);for(const listener of [...listeners])listener();};
 return {
  getSnapshot:()=>snapshot,
  subscribe:listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  setDraft:draft=>{if(typeof draft!=='string'||draft===snapshot.draft)return;publish({...snapshot,draft});},
  setWorktreeId:worktreeId=>{if(typeof worktreeId!=='string'||worktreeId===snapshot.worktreeId)return;publish({...snapshot,worktreeId});},
 };
}
