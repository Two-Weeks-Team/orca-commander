/** Touch arbitration only. It contains no target, timer, selection or action callback. */
export interface SurfacePoint {id:string;x:number;y:number}
export type SurfaceDirection='left'|'right'|'up'|'down';
export const SURFACE_SWIPE_THRESHOLD=18;
type Touch={start:SurfacePoint;layout:string;phase:'candidate'|'excluded'|'consumed'|'cancelled';claimed:boolean};
const valid=(p:SurfacePoint)=>typeof p.id==='string'&&p.id.length>0&&p.id.length<=128&&Number.isFinite(p.x)&&Number.isFinite(p.y);
export class DeckSurfaceSwipe {
 private touch:Touch|null=null;
 begin(points:readonly SurfacePoint[],layout:string,enabled:boolean):boolean{
  if(points.length!==1){
   if(this.touch&&this.touch.phase!=='excluded'&&this.touch.phase!=='consumed')this.touch.phase='cancelled';
   else if(!this.touch&&enabled&&points[0]&&valid(points[0]))this.touch={start:{...points[0]},layout,phase:'cancelled',claimed:false};
   return this.touch?.phase==='cancelled'; // A second finger cancels the child immediately, even without a move.
  }
  this.touch=enabled&&valid(points[0])?{start:{...points[0]},layout,phase:'candidate',claimed:false}:null;
  return false;
 }
 /** A child control owns the whole contact, even when that control is disabled. */
 exclude():false{if(this.touch)this.touch.phase='excluded';return false;}
 /** A long press already opened an explanation. Its later movement must do nothing. */
 consume():void{if(this.touch)this.touch.phase='consumed';}
 wants(points:readonly SurfacePoint[],layout:string,enabled:boolean):boolean{
  const g=this.touch;if(!g||g.phase==='excluded'||g.phase==='consumed')return false;
  if(!enabled||layout!==g.layout||points.length!==1||!valid(points[0])||points[0].id!==g.start.id)g.phase='cancelled';
  if(g.phase==='cancelled')return true; // Cancel the child's press, without navigating on release.
  return Math.max(Math.abs(points[0].x-g.start.x),Math.abs(points[0].y-g.start.y))>SURFACE_SWIPE_THRESHOLD;
 }
 /** RN may reject a grant after consulting the old responder. No action occurs here. */
 grant():void{if(this.touch)this.touch.claimed=true;}
 finish(point:SurfacePoint|undefined,layout:string,enabled:boolean):SurfaceDirection|null{
  const g=this.touch;this.touch=null;
  if(!g||!g.claimed||g.phase!=='candidate'||!enabled||g.layout!==layout||!point||!valid(point)||point.id!==g.start.id)return null;
  const dx=point.x-g.start.x,dy=point.y-g.start.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))<=SURFACE_SWIPE_THRESHOLD)return null;
  // Owner decision: swipes and joystick share the same movement direction.
  return Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';
 }
 endUnclaimed(remaining:number):void{if(remaining===0&&!this.touch?.claimed)this.touch=null;}
 cancel():void{this.touch=null;}
}
