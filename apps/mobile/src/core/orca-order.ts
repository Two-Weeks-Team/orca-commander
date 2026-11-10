/**
 * Orca's own sidebar order, ported from Orca 1.4.246 (MIT, stablyai/orca):
 * src/shared/sidebar-list/text-order.ts, src/shared/workspace-view/workspace-row-sort.ts,
 * src/shared/project-section-order.ts and mobile/src/worktree/workspace-list-ordering.ts (legacy, non-stamp path).
 * Pure functions; the desktop's settings come from `ui.get` and `mobileRelay.projectSections`.
 */
export type WorkspaceSortBy='name'|'smart'|'recent'|'repo'|'manual';
export type ProjectOrderBy='manual'|'recent';
export interface OrderSettings {sortBy:WorkspaceSortBy;projectOrderBy:ProjectOrderBy;/** repo id → sidebar header rank */repoOrder?:ReadonlyMap<string,number>}
export const DEFAULT_ORDER:OrderSettings={sortBy:'recent',projectOrderBy:'manual'};

const DIGIT_0=0x30,DIGIT_9=0x39;
const isDigit=(code:number)=>code>=DIGIT_0&&code<=DIGIT_9;
const MARKS=/\p{M}/gu,NON_ASCII=/[\u0080-\u{10ffff}]/u;
const fold=(text:string)=>{const lower=text.toLowerCase();return NON_ASCII.test(lower)?lower.normalize('NFD').replace(MARKS,''):lower;};
const cpLength=(code:number)=>code>0xffff?2:1;
export function compareCodePoints(left:string,right:string):number{
 let i=0,j=0;
 while(i<left.length&&j<right.length){const a=left.codePointAt(i)??0,b=right.codePointAt(j)??0;if(a!==b)return a<b?-1:1;i+=cpLength(a);j+=cpLength(b);}
 return i<left.length?1:j<right.length?-1:0;
}
const runEnd=(text:string,start:number)=>{let end=start;while(end<text.length&&isDigit(text.charCodeAt(end)))end++;return end;};
const skipZeros=(text:string,start:number,end:number)=>{let index=start;while(index<end-1&&text.charCodeAt(index)===DIGIT_0)index++;return index;};
function compareNatural(left:string,right:string):number{
 let i=0,j=0;
 while(i<left.length&&j<right.length){
  const a=left.codePointAt(i)??0,b=right.codePointAt(j)??0;
  if(isDigit(a)&&isDigit(b)){
   const le=runEnd(left,i),re=runEnd(right,j),ls=skipZeros(left,i,le),rs=skipZeros(right,j,re);
   const delta=le-ls-(re-rs);if(delta!==0)return delta<0?-1:1;
   const digits=compareCodePoints(left.slice(ls,le),right.slice(rs,re));if(digits!==0)return digits;
   i=le;j=re;continue;
  }
  if(a!==b)return a<b?-1:1;i+=cpLength(a);j+=cpLength(b);
 }
 return i<left.length?1:j<right.length?-1:0;
}
export function compareSidebarText(left:string,right:string):number{
 if(left===right)return 0;
 return compareNatural(fold(left),fold(right))||compareCodePoints(left.normalize('NFC'),right.normalize('NFC'));
}

export const CREATE_GRACE_MS=5*60*1000;
export function recentActivityWithCreateGrace(lastActivityAt:number,createdAt:number|undefined,now:number):number{
 if(createdAt===undefined||!Number.isFinite(createdAt)||now>=createdAt+CREATE_GRACE_MS)return lastActivityAt;
 return Math.max(lastActivityAt,createdAt+CREATE_GRACE_MS);
}

/** One worktree's ordering inputs, as `worktree.ps` reports them. */
export interface WorktreeOrderRow {
 worktreeId:string;hostId?:string;label:string;repo:string;
 lastActivityAt?:number;createdAt?:number;sortOrder?:number;manualOrder?:number;
 status?:string;hasHostSidebarActivity?:boolean;liveTerminalCount?:number;isMainWorktree?:boolean;
}
const finiteOr=(value:number|undefined,fallback:number)=>value!==undefined&&Number.isFinite(value)?value:fallback;
const identity=(w:WorktreeOrderRow)=>`${w.hostId??''}|${w.worktreeId}`;
const STATUS_ORDER:Record<string,number>={permission:0,working:1,done:2,active:3,inactive:4};
/** Mirrors desktop sidebar activity; retained/background terminals alone are not an active workspace. */
export function worktreeStatus(w:WorktreeOrderRow):'working'|'active'|'permission'|'done'|'inactive'{
 const known=(s:string|undefined)=>s==='working'||s==='active'||s==='permission'||s==='done'||s==='inactive';
 if(w.hasHostSidebarActivity===false)return'inactive';
 if(w.status&&w.status!=='inactive'&&known(w.status))return w.status as 'working'|'active'|'permission'|'done';
 if(w.hasHostSidebarActivity===true)return'active';
 if(w.status&&known(w.status))return w.status as 'inactive';
 if((w.liveTerminalCount??0)>0)return'active';
 return'inactive';
}
function compareManualRank(a:number|null,b:number|null):number{if(a!==null&&b!==null)return b-a;if(a!==null)return -1;return b!==null?1:0;}
/** The original mobile worktree comparator for the selected desktop sort. */
export function worktreeComparator(sortBy:WorkspaceSortBy,now:number):(a:WorktreeOrderRow,b:WorktreeOrderRow)=>number{
 const recent=(w:WorktreeOrderRow)=>recentActivityWithCreateGrace(finiteOr(w.lastActivityAt,0),w.createdAt,now);
 const byLabel=(a:WorktreeOrderRow,b:WorktreeOrderRow)=>compareSidebarText(a.label,b.label)||compareCodePoints(identity(a),identity(b));
 const manualRank=(w:WorktreeOrderRow)=>{const rank=w.manualOrder??w.sortOrder;return typeof rank==='number'&&Number.isFinite(rank)?rank:null;};
 const smart=(a:WorktreeOrderRow,b:WorktreeOrderRow)=>{
  const ar=finiteOr(a.sortOrder,0),br=finiteOr(b.sortOrder,0);
  if(ar!==br)return br-ar;if(ar!==0)return 0;
  return STATUS_ORDER[worktreeStatus(a)]-STATUS_ORDER[worktreeStatus(b)]||recent(b)-recent(a)||byLabel(a,b);
 };
 return(a,b)=>{
  switch(sortBy){
   case'name':return byLabel(a,b);
   case'smart':return smart(a,b)||byLabel(a,b);
   case'repo':return compareSidebarText(a.repo,b.repo)||byLabel(a,b);
   case'manual':return compareManualRank(manualRank(a),manualRank(b))||byLabel(a,b);
   case'recent':default:return recent(b)-recent(a)||byLabel(a,b);
  }
 };
}

export interface ProjectOrderEntry {key:string;label:string;repoId:string;worktrees:readonly WorktreeOrderRow[];firstSeen:number}
/** Project headers: independent of the workspace sort, as on the desktop. */
export function orderProjectEntries<E extends ProjectOrderEntry>(entries:readonly E[],settings:OrderSettings):E[]{
 const rank=(e:E)=>settings.repoOrder?.get(e.repoId)??Number.POSITIVE_INFINITY;
 const byLabel=(a:E,b:E)=>compareSidebarText(a.label,b.label)||compareCodePoints(a.key,b.key);
 if(settings.projectOrderBy==='recent'){
  const activity=(e:E)=>{let max=Number.NEGATIVE_INFINITY;for(const w of e.worktrees)if((w.lastActivityAt??Number.NEGATIVE_INFINITY)>max)max=w.lastActivityAt??max;return max;};
  return [...entries].sort((a,b)=>{
   const aa=activity(a),ba=activity(b),ah=aa!==Number.NEGATIVE_INFINITY,bh=ba!==Number.NEGATIVE_INFINITY;
   if(ah!==bh)return ah?-1:1;
   if(ah&&ba!==aa)return ba-aa;
   const ra=rank(a),rb=rank(b);if(ra!==rb)return ra<rb?-1:1;
   return byLabel(a,b);
  });
 }
 // Manual: the sidebar header order; without a catalog, first appearance in the sorted worktree list.
 if(!settings.repoOrder)return [...entries].sort((a,b)=>a.firstSeen-b.firstSeen);
 return [...entries].sort((a,b)=>{const ra=rank(a),rb=rank(b);if(ra!==rb)return ra<rb?-1:1;return byLabel(a,b);});
}

/** Agent rows keep the host order (stateStartedAt ascending); children follow their parent depth-first. */
export function orderAgentLineage<T>(rows:readonly T[],key:(row:T)=>string,parent:(row:T)=>string|undefined):T[]{
 const byKey=new Map(rows.map(row=>[key(row),row]));
 const children=new Map<string,T[]>();const roots:T[]=[];
 for(const row of rows){const p=parent(row);if(p&&p!==key(row)&&byKey.has(p)){const list=children.get(p)??[];list.push(row);children.set(p,list);}else roots.push(row);}
 const out:T[]=[],seen=new Set<string>();
 const visit=(row:T)=>{const k=key(row);if(seen.has(k))return;seen.add(k);out.push(row);for(const child of children.get(k)??[])visit(child);};
 roots.forEach(visit);
 // A cycle leaves rows unvisited: they become roots in host order.
 for(const row of rows)if(!seen.has(key(row)))visit(row);
 return out;
}
