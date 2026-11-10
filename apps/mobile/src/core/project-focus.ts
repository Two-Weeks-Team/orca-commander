import {bindKey,type DeckItem,type ItemKey} from './deck-model';
import {DEFAULT_ORDER,orderAgentLineage,orderProjectEntries,worktreeComparator,type OrderSettings,type ProjectOrderEntry,type WorktreeOrderRow} from './orca-order';

/**
 * Project focus: the deck shows one Orca project (repo) at a time, in Orca's own order, and follows the desktop's
 * active worktree/tab. Pure functions only; selection authority for writes stays with the existing action clients.
 */
export interface DeckProject {repoId:string;name:string;items:ItemKey[];worktreeIds:string[]}
/** tabId is the active pane key (`tab:leaf`) when known. */
export interface DesktopFocus {worktreeId:string;tabId?:string;activationSequence?:number;source?:{clientId:string;windowId:string}}
export interface FocusState {
 /** follow: the desktop's latest activation decides; manual: the owner moved to another project on the deck. */
 mode:'follow'|'manual';
 repoId:string|null;
 /** The desktop activation last applied, so an unchanged desktop never overrides the owner's own movement. */
 mark:string|null;
}
export const emptyFocus=():FocusState=>({mode:'follow',repoId:null,mark:null});
export const KEYS_PER_PROJECT=6;

const placeOf=(item:DeckItem,byWorktree:Map<string,NonNullable<DeckItem['place']>>)=>item.place??byWorktree.get(item.target.worktreeId);
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:undefined;
const str=(v:unknown)=>typeof v==='string'?v:undefined;
function orderRow(worktreeId:string,place:NonNullable<DeckItem['place']>):WorktreeOrderRow{
 const s=place.sort??{};
 return {worktreeId,hostId:str(s.hostId),label:place.worktreeName,repo:place.repo,lastActivityAt:num(s.lastActivityAt),createdAt:num(s.createdAt),sortOrder:num(s.sortOrder),manualOrder:num(s.manualOrder),
  status:str(s.status),hasHostSidebarActivity:typeof s.hasHostSidebarActivity==='boolean'?s.hasHostSidebarActivity:undefined,liveTerminalCount:num(s.liveTerminalCount),isMainWorktree:s.isMainWorktree===true};
}

/**
 * Projects in Orca's sidebar order (desktop projectOrderBy and repo catalog), worktrees by the desktop sortBy with
 * the main worktree first, and agent rows in the host's order with children under their parent.
 */
export function buildProjects(agents:readonly DeckItem[],present:ReadonlySet<ItemKey>,settings:OrderSettings=DEFAULT_ORDER,now=Date.now()):DeckProject[]{
 const byWorktree=new Map<string,NonNullable<DeckItem['place']>>();
 for(const a of agents)if(a.place&&!byWorktree.has(a.target.worktreeId))byWorktree.set(a.target.worktreeId,a.place);
 const rows=agents.filter(a=>present.has(bindKey(a))&&placeOf(a,byWorktree)?.repoId);
 const worktreeIds=[...new Set(rows.map(a=>a.target.worktreeId))];
 const worktrees=worktreeIds.map(id=>orderRow(id,byWorktree.get(id)??placeOf(rows.find(a=>a.target.worktreeId===id)!,byWorktree)!)).sort(worktreeComparator(settings.sortBy,now));
 const entries=new Map<string,ProjectOrderEntry&{worktreeRows:WorktreeOrderRow[]}>();
 worktrees.forEach(w=>{
  const repoId=byWorktree.get(w.worktreeId)?.repoId??'';
  let entry=entries.get(repoId);
  if(!entry){entry={key:`repo:${repoId}`,label:w.repo||repoId,repoId,worktrees:[],worktreeRows:[],firstSeen:entries.size};entries.set(repoId,entry);}
  entry.worktreeRows.push(w);
 });
 for(const entry of entries.values()){
  // Repo sections show the main worktree first; the rest keep the workspace sort.
  entry.worktreeRows=[...entry.worktreeRows.filter(w=>w.isMainWorktree),...entry.worktreeRows.filter(w=>!w.isMainWorktree)];
  entry.worktrees=entry.worktreeRows;
 }
 return orderProjectEntries([...entries.values()],settings).map(entry=>{
  const items:ItemKey[]=[];
  for(const w of entry.worktreeRows){
   const own=rows.filter(a=>a.target.worktreeId===w.worktreeId);
   const panes=own.filter(a=>!a.nativeRequest).sort((a,b)=>(a.place?.agentRank??0)-(b.place?.agentRank??0));
   const ordered=orderAgentLineage(panes,a=>a.target.terminalId??bindKey(a),a=>a.place?.parentPaneKey);
   for(const a of [...ordered,...own.filter(a=>a.nativeRequest)]){const key=bindKey(a);if(!items.includes(key))items.push(key);}
  }
  return {repoId:entry.repoId,name:entry.label,items,worktreeIds:entry.worktreeRows.map(w=>w.worktreeId)};
 });
}

/** The agent row the desktop has active: its pane's tab is the worktree's active tab. */
export function desktopSelection(agents:readonly DeckItem[],present:ReadonlySet<ItemKey>,focus:DesktopFocus):ItemKey|null{
 const rows=agents.filter(a=>a.target.worktreeId===focus.worktreeId&&!a.nativeRequest&&present.has(bindKey(a)));
 const tabId=focus.tabId;if(!tabId)return null;
 const exact=rows.filter(a=>a.target.terminalId===tabId);
 if(exact.length===1)return bindKey(exact[0]);
 // An exact pane key cannot fall back to a sibling. A parent-only tab is usable only with one pane.
 if(exact.length>1||tabId.includes(':'))return null;
 const matching=rows.filter(a=>a.target.terminalId?.split(':')[0]===tabId);
 return matching.length===1?bindKey(matching[0]):null;
}

export const focusMark=(focus:DesktopFocus|undefined)=>focus?JSON.stringify([focus.worktreeId,focus.tabId??null,...(focus.source?[focus.source.clientId,focus.source.windowId,focus.activationSequence??null]:[])]):null;

/**
 * Apply the latest desktop activation. A new activation always wins (the newest change is the current state);
 * an unchanged desktop keeps the owner's manual project and selection.
 */
export function followDesktop(state:FocusState,projects:readonly DeckProject[],agents:readonly DeckItem[],present:ReadonlySet<ItemKey>,focus:DesktopFocus|undefined,selected:ItemKey|null=null):{state:FocusState;select:ItemKey|null}{
 // An unresolved activation says nothing about which live row to show. Do not consume its mark:
 // the exact pane may arrive on a later read, while the owner's last selection/project stays visible.
 if(!focus)return{state,select:null};
 const desktop=desktopSelection(agents,present,focus);if(desktop===null)return{state,select:null};
 const mark=focusMark(focus);
 if(mark===state.mark&&state.mode==='manual'){
  // An empty read (reconnecting) says nothing about the projects: keep the open one instead of losing it.
  if(!projects.length||projects.some(p=>p.repoId===state.repoId))return{state,select:null};
  return{state:{...state,repoId:projects[0].repoId},select:null};
 }
 const project=projects.find(p=>p.worktreeIds.includes(focus.worktreeId));
 const changed=mark!==state.mark;
 const next:FocusState={mode:'follow',repoId:project?.repoId??state.repoId??projects[0]?.repoId??null,mark};
 // While following, a missing selection (e.g. rows arrived after the activation) is filled from the desktop.
 // Following shows the recent tabs of every project, so any present selection stays until the desktop changes.
 const lost=selected===null||!present.has(selected);
 return{state:next,select:changed||lost?desktop:null};
}

/** A vertical push always moves from the selected/open project to the adjacent usable project. */
export function stepProject(state:FocusState,projects:readonly DeckProject[],direction:'up'|'down',selected:ItemKey|null=null):{state:FocusState;select:ItemKey|null}{
 const usable=projects.filter(p=>p.items.length>0);if(!usable.length)return{state,select:null};
 const current=state.mode==='follow'?(usable.find(p=>selected!==null&&p.items.includes(selected))?.repoId??state.repoId):state.repoId;
 const at=usable.findIndex(p=>p.repoId===current);
 const index=at<0?0:Math.min(usable.length-1,Math.max(0,at+(direction==='down'?1:-1)));
 const project=usable[index];
 return{state:{...state,mode:'manual',repoId:project.repoId},select:index===at&&selected!==null&&project.items.includes(selected)?null:project.items[0]??null};
}

/** A row chosen by list, dial or voice while a project is open moves the open project to that row's project. */
export function focusForChoice(state:FocusState,projects:readonly DeckProject[],key:ItemKey):FocusState{
 if(state.mode!=='manual'||currentProject(state,projects)?.items.includes(key))return state;
 const owner=projects.find(p=>p.items.includes(key));
 return owner?{...state,repoId:owner.repoId}:state;
}

/** Presentation membership never removes a pane from inventory, journal reconciliation or protected bindings. */
export function dashboardPresent(agents:readonly DeckItem[],present:ReadonlySet<ItemKey>):Set<ItemKey>{
 return new Set(agents.filter(a=>present.has(bindKey(a))&&presentationPresent(a)).map(bindKey));
}
/** Legacy/native sources retain their own membership; live PTY rows use explicit catalog membership. */
export const presentationPresent=(a:Pick<DeckItem,'terminalActivity'|'dashboard'>):boolean=>a.terminalActivity?.present??a.dashboard?.visible!==false;
/** Host output first, then the host state event, then identity. No device clock or bucket promotion. */
export function recencyOrder(agents:readonly DeckItem[],present:ReadonlySet<ItemKey>,_touched:ReadonlyMap<ItemKey,number>=new Map(),within?:ReadonlySet<ItemKey>):ItemKey[]{
 const rows=new Map<ItemKey,{output:number;state:number}>();
 for(const a of agents){
  const key=bindKey(a);if(!present.has(key)||!presentationPresent(a)||within&&!within.has(key))continue;
  const output=a.terminalActivity?.lastOutputAt,event=a.terminalActivity?.stateStartedAt??(a.terminalActivity?null:a.dashboard?.stateChangedAt??Date.parse(a.stateSince??a.updatedAt));
  rows.set(key,{output:typeof output==='number'&&Number.isFinite(output)?output:-1,state:typeof event==='number'&&Number.isFinite(event)?event:-1});
 }
 return [...rows].sort((a,b)=>b[1].output-a[1].output||b[1].state-a[1].state||(a[0]<b[0]?-1:a[0]>b[0]?1:0)).map(([key])=>key);
}

/**
 * The newest `size` rows on keys that do not move: a row already on a key keeps it while it stays among the newest;
 * a key whose row dropped out takes the newest incoming row. A thumb on key 3 never finds a different row there
 * because another agent updated.
 */
export function stableSlots(previous:readonly (ItemKey|null)[],ranked:readonly ItemKey[],size=KEYS_PER_PROJECT):(ItemKey|null)[]{
 const top=new Set(ranked.slice(0,size)),placed=new Set<ItemKey>();
 const slots=Array.from({length:size},(_,i)=>{const key=previous[i]??null;if(key===null||!top.has(key)||placed.has(key))return null;placed.add(key);return key;});
 const incoming=ranked.slice(0,size).filter(key=>!placed.has(key));
 for(let i=0;i<size&&incoming.length;i++)if(slots[i]===null)slots[i]=incoming.shift()!;
 return slots;
}

/** The same source and previous bindings yield the same stable numbered keys. */
export function recentView(previous:readonly (ItemKey|null)[],ranked:readonly ItemKey[],size=KEYS_PER_PROJECT):{keys:(ItemKey|null)[];items:ItemKey[]}{
 const items=[...new Set(ranked)];
 return{keys:stableSlots(previous,items,size),items};
}

/**
 * The deck's own choices are a short detour from the desktop: an opened project view or a tab picked on the deck. With
 * no deck input for this long the deck goes back to the recent tabs and the desktop's tab, so every deck paired to
 * the same desktop settles on the same screen. The deck never moves the desktop.
 */
export const DECK_DETOUR_IDLE_MS=20_000;

/** Where the deck stands against the desktop: on its tab, or away (project view or another tab) until it returns. */
export function deckDetour(state:FocusState,agents:readonly DeckItem[],present:ReadonlySet<ItemKey>,focus:DesktopFocus|undefined,selected:ItemKey|null):{away:boolean;desktop:ItemKey|null}{
 const desktop=focus?desktopSelection(agents,present,focus):null;
 return{away:state.mode==='manual'||desktop!==null&&selected!==desktop,desktop};
}

/** Idle always returns to recent tabs. Unknown desktop focus preserves selection and its unapplied mark. */
export function returnToDesktop(state:FocusState,agents:readonly DeckItem[],present:ReadonlySet<ItemKey>,focus:DesktopFocus|undefined):{state:FocusState;select:ItemKey|null}{
 const select=focus?desktopSelection(agents,present,focus):null;
 return select===null?{state:{...state,mode:'follow'},select:null}:{state:{...resumeFollow(state),mark:focusMark(focus)},select};
}

/** Resume following the desktop on the next applied activation. */
export const resumeFollow=(state:FocusState):FocusState=>({...state,mode:'follow',mark:null});

export function currentProject(state:FocusState,projects:readonly DeckProject[]):DeckProject|null{
 return projects.find(p=>p.repoId===state.repoId)??null;
}

/** A project's first N rows in sidebar order (the list sheet's grouping); the deck keys use `recentView`. */
export function projectKeys(project:DeckProject|null,size=KEYS_PER_PROJECT):(ItemKey|null)[]{
 return Array.from({length:size},(_,i)=>project?.items[i]??null);
}

/** Joystick left/right within the current view; clamps at the ends. */
export function stepWithinProject(project:Pick<DeckProject,'items'>|null,selected:ItemKey|null,direction:'left'|'right'):ItemKey|null{
 if(!project||!project.items.length)return selected;
 const at=selected?project.items.indexOf(selected):-1;
 if(at<0)return project.items[0];
 return project.items[Math.min(project.items.length-1,Math.max(0,at+(direction==='right'?1:-1)))];
}
