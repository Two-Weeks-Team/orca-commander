import {approvedFaceGeometry} from './approved-face-geometry';
import {responsiveFaceGeometry} from './responsive-face-geometry';
/** Coordinates are points on the selected physical controller plane. */
export interface DeckRect {left:number;top:number;width:number;height:number}
export interface DeckInsets {top:number;bottom:number;left:number;right:number}
export type DeckDirection='up'|'down'|'left'|'right';
/** Routing uses the whole parent frame, before safe-area placement. */
export type DeckFace='phone'|'cover'|'wide'|'landscape'|'short-landscape';
export const WIDE_DECK_PREVIEW_ENABLED=true;
export function deckFace(width:number,height:number,adaptiveEnabled:boolean=WIDE_DECK_PREVIEW_ENABLED):DeckFace{
 if(!adaptiveEnabled||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return 'phone';
 if(width>height)return height<600?'short-landscape':'landscape';
 if(width/height<=.50)return 'phone';
 return width>=700?'wide':'cover';
}
/** The physical face owns capacity; navigation still traverses the full inventory. */
export const deckKeyCount=(face:DeckFace):number=>face==='wide'||face==='landscape'?9:6;
export function deckLayout(width:number,height:number,insets:DeckInsets,wideEnabled:boolean=WIDE_DECK_PREVIEW_ENABLED,wideInsets?:DeckInsets){
 // An invalid parent remains a phone fallback with no usable physical controls.
 width=Number.isFinite(width)?Math.max(0,width):0;height=Number.isFinite(height)?Math.max(0,height):0;
 const face=deckFace(width,height,wideEnabled);if(face==='landscape'||face==='short-landscape')return responsiveFaceGeometry(width,height,face,insets);if(face==='wide'||face==='cover')return approvedFaceGeometry(width,height,face,wideInsets);
 const plane={width:390,height:844};
 const availableW=Math.max(0,width-insets.left-insets.right),availableH=Math.max(0,height-insets.top-insets.bottom);
 const scale=Math.max(0,Math.min(availableW/plane.width,availableH/plane.height));
 const rect=(left:number,top:number,w:number,h:number):DeckRect=>({left:left*scale,top:top*scale,width:w*scale,height:h*scale});
 return {face,plane,scale,left:insets.left+(availableW-plane.width*scale)/2,top:insets.top+(availableH-plane.height*scale)/2,width:plane.width*scale,height:plane.height*scale,
  needsList:84*scale<48,keyStrip:rect(22,436,346,24),spriteRects:undefined,
  agentKeys:[17.33,140,262.67,17.33,140,262.67].map((x,i)=>rect(x,i<3?202:322,110,104)),
  commands:[17.33,140,262.67,17.33,140,262.67].map((x,i)=>rect(x,i<3?474:574,110,84)),
  status:rect(16,52,358,130),stick:rect(18,690,104,104),voice:rect(144,689,102,106),dial:rect(268,690,104,104)};
}
/** Enlarge inside the actual parent: RN hitSlop cannot escape that parent. */
export function controlTarget(rect:DeckRect,parentWidth:number,parentHeight:number):DeckRect {
 const width=Math.min(parentWidth,Math.max(48,rect.width)),height=Math.min(parentHeight,Math.max(48,rect.height));
 return {left:Math.min(Math.max(0,rect.left+(rect.width-width)/2),parentWidth-width),top:Math.min(Math.max(0,rect.top+(rect.height-height)/2),parentHeight-height),width,height};
}
export function swipeDirection(dx:number,dy:number):DeckDirection|null {
 if(Math.max(Math.abs(dx),Math.abs(dy))<18)return null;
 return Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
}

/** One dial detent per this much drag: a slow drag scrubs through several items, like turning a physical encoder. */
export const DIAL_DETENT_PX=36;
/** Signed detents a drag has turned the dial: right or down turns forward, along whichever axis moved more. */
export function dialDetents(dx:number,dy:number):number{
 const travel=Math.abs(dx)>=Math.abs(dy)?dx:dy;
 return Math.trunc(travel/DIAL_DETENT_PX);
}
/** A held joystick repeats its step: the first after a pause, then steadily. Projects repeat slower than tabs. */
export const STICK_REPEAT={delayMs:450,tabMs:170,projectMs:420} as const;
export const stickRepeatInterval=(direction:DeckDirection)=>direction==='left'||direction==='right'?STICK_REPEAT.tabMs:STICK_REPEAT.projectMs;
/** The display treats a press that moved less than a swipe and was released before this as a tap. */
export const LONG_PRESS_MS=500;

/** Orca numbers some tab titles ("3 · Review"); on a numbered key that second number only misleads. */
export const keyTitle=(title:string|null|undefined)=>title?title.replace(/^\s*\d+\s*[·.:)-]\s*/u,'')||title:null;
