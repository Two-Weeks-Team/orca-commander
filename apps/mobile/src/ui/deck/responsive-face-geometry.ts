import type {DeckInsets,DeckRect} from './deck-layout';

const rect=(left:number,top:number,width:number,height:number):DeckRect=>({left,top,width,height});
const keySprite=(r:DeckRect)=>rect(r.left-r.width*.04,r.top-r.height*.04,r.width*1.08,r.height*1.1);
const commandSprite=(r:DeckRect)=>rect(r.left-r.width*.04,r.top-r.height*.05,r.width*1.08,r.height*1.12);

/** Approved landscape()/short_landscape() compositor equations, in full-parent dp.
 * Insets are equation inputs, never an additional outer translation or scale.
 * The caller supplies runtime safe insets; canonical preview insets live in tests. */
export function responsiveFaceGeometry(width:number,height:number,face:'landscape'|'short-landscape',insets:DeckInsets){
 // The preview's visual edge margin also applies when the OS reports a zero safe inset.
 const top=Math.max(face==='landscape'?24:8,insets.top),bottom=Math.max(face==='landscape'?20:16,insets.bottom),g=10,avail=height-top-bottom;
 let status:DeckRect,agentKeys:DeckRect[],commands:DeckRect[],keyStrip:DeckRect,stick:DeckRect,voice:DeckRect,dial:DeckRect;
 if(face==='landscape'){
  const left=Math.max(16,insets.left),right=Math.max(16,insets.right),inner=width-left-right;
  const lcdH=Math.min(170,avail*.21),rowsTop=top+lcdH+16,rowsH=avail-lcdH-16-28,kh=(rowsH-2*g)/3;
  const controlColumn=Math.min(kh*.95,170),k=(inner-controlColumn-24-16-2*g-g)/(3+2*.9),b=k*.9;
  status=rect(left,top,inner,lcdH);
  agentKeys=Array.from({length:9},(_,i)=>rect(left+i%3*(k+g),rowsTop+Math.floor(i/3)*(kh+g),k,kh));
  const bx=left+3*k+2*g+16;
  commands=Array.from({length:6},(_,i)=>rect(bx+i%2*(b+g),rowsTop+Math.floor(i/2)*(kh+g),b,kh));
  const cx=bx+2*b+g+24,size=Math.min(controlColumn,(rowsH-2*14)/3),controlTop=rowsTop+(rowsH-3*size-28)/2;
  stick=rect(cx,controlTop,size,size);voice=rect(cx,controlTop+size+14,size,size);dial=rect(cx,controlTop+2*(size+14),size,size);
  keyStrip=rect(left+6,rowsTop+rowsH+4,inner-12,24);
 }else{
  const left=Math.max(16,insets.left),right=Math.max(16,insets.right);
  const x0=left+10,inner=width-left-right-20;
  const size=Math.min(150,(avail-2*10)/3),mid=(inner-size-14-14)*.66;
  const lcdH=Math.min(120,avail*.30),kw=(mid-2*g)/3,kh=(avail-lcdH-12-20-g)/2,ky=top+lcdH+12;
  status=rect(x0,top,mid,lcdH);
  agentKeys=Array.from({length:6},(_,i)=>rect(x0+i%3*(kw+g),ky+Math.floor(i/3)*(kh+g),kw,kh));
  const bx=x0+mid+14,bw=(inner-size-14-mid-14-g)/2,bh=(avail-2*g)/3;
  commands=Array.from({length:6},(_,i)=>rect(bx+i%2*(bw+g),top+Math.floor(i/2)*(bh+g),bw,bh));
  const cx=bx+2*bw+g+14,controlTop=top+(avail-3*size-20)/2;
  stick=rect(cx,controlTop,size,size);voice=rect(cx,controlTop+size+10,size,size);dial=rect(cx,controlTop+2*(size+10),size,size);
  keyStrip=rect(x0+4,ky+2*kh+g+4,mid-8,16);
 }
 return {face,plane:{width,height},scale:1,left:0,top:0,width,height,
  needsList:[...agentKeys,...commands,status,stick,voice,dial].some(r=>r.width<48||r.height<48||r.left<0||r.top<0||r.left+r.width>width+1e-7||r.top+r.height>height+1e-7),
  agentKeys,commands,status,stick,voice,dial,keyStrip,
  spriteRects:{agentKeys:agentKeys.map(keySprite),commands:commands.map(commandSprite),stick,voice,dial}};
}
