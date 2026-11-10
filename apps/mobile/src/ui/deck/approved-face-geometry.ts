/** Owner-approved compose.py wide()/stretched() equations. Units are physical layout dp.
 * A/B1 use the full parent frame; default34/20 insets preserve their approved face.
 * A wide-only top/bottom override supports the approved iPad placement.
 * Phone geometry is intentionally outside this module. */
type Rect={left:number;top:number;width:number;height:number};
const rect=(left:number,top:number,width:number,height:number):Rect=>({left,top,width,height});
const keySprite=(r:Rect)=>rect(r.left-r.width*.04,r.top-r.height*.04,r.width*1.08,r.height*1.1);
const commandSprite=(r:Rect)=>rect(r.left-r.width*.04,r.top-r.height*.05,r.width*1.08,r.height*1.12);
export function approvedFaceGeometry(width:number,height:number,face:'wide'|'cover',placement?:{top:number;bottom:number}){
 const m=16,top=face==='wide'?(placement?.top??34):34,bottom=face==='wide'?(placement?.bottom??20):20,inner=width-2*m,avail=height-top-bottom;
 let status:Rect,agentKeys:Rect[],commands:Rect[],keyStrip:Rect,controlX:number,controlY:number,controlWidth:number,controlSize:number;
 if(face==='wide'){
  const g=10,k=(inner-2*g-16-g)/(3+2*.9),b=k*.9;
  const ctl=Math.min(180,avail*.17),kh=Math.min(k*1.15,(avail*.80-ctl-16-30-24-2*g)/3);
  const lcdH=avail-ctl-16-30-24-2*g-3*kh,y0=top+lcdH+16,rowsH=3*kh+2*g,bx=m+3*k+2*g+16;
  status=rect(m,top,inner,lcdH);
  agentKeys=Array.from({length:9},(_,i)=>rect(m+i%3*(k+g),y0+Math.floor(i/3)*(kh+g),k,kh));
  commands=Array.from({length:6},(_,i)=>rect(bx+i%2*(b+g),y0+Math.floor(i/2)*(kh+g),b,kh));
  keyStrip=rect(m+6,y0+rowsH+6,inner-12,24);
  controlX=m+24;controlWidth=inner-48;controlSize=ctl;
  controlY=y0+rowsH+30+(height-bottom-(y0+rowsH+30)-ctl)/2;
 }else{
  const g=12,s=avail/800,kw=(inner-2*g)/3,kh=104*s,ch=84*s,size=104*s;
  const used=130*s+18*s+2*kh+16*s+44*s+2*ch+16*s+24*s+size+8;
  const lcdH=130*s+Math.max(0,avail-used),y0=top+lcdH+18*s,yc=y0+2*kh+16*s+44*s;
  status=rect(m,top,inner,lcdH);
  agentKeys=Array.from({length:6},(_,i)=>rect(m+i%3*(kw+g),y0+Math.floor(i/3)*(kh+16*s),kw,kh));
  commands=Array.from({length:6},(_,i)=>rect(m+i%3*(kw+g),yc+Math.floor(i/3)*(ch+16*s),kw,ch));
  keyStrip=rect(m+6,y0+2*kh+22*s,inner-12,24*s);
  controlX=m+20;controlWidth=inner-40;controlSize=size;controlY=height-bottom-size-8;
 }
 const gap=(controlWidth-3*controlSize)/2;
 const stick=rect(controlX,controlY,controlSize,controlSize);
 const voice=rect(controlX+controlSize+gap,controlY-controlSize*.02,controlSize*1.05,controlSize*1.08);
 const dial=rect(controlX+2*(controlSize+gap),controlY,controlSize,controlSize);
 return {face,plane:{width,height},scale:1,left:0,top:0,width,height,
  needsList:[...agentKeys,...commands,stick,voice,dial].some(r=>r.width<48||r.height<48)||status.height<=0,
  agentKeys,commands,status,stick,voice,dial,keyStrip,
  spriteRects:{agentKeys:agentKeys.map(keySprite),commands:commands.map(commandSprite),stick,voice,dial}};
}
