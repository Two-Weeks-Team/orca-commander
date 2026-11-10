import type {DeckRect,DeckInsets} from './deck-layout';

/** Destination patch edges share exact floats, so every well follows the same logical rectangle as its cap. */
export function skinPatchRects(target:DeckRect,padding:DeckInsets,caps:DeckInsets):DeckRect[]{
 if(![target.left,target.top,target.width,target.height,...Object.values(padding),...Object.values(caps)].every(Number.isFinite)||target.width<=0||target.height<=0)return[];
 const horizontal=Math.min(1,target.width/Math.max(1,caps.left+caps.right));
 const vertical=Math.min(1,target.height/Math.max(1,caps.top+caps.bottom));
 const x=[target.left-padding.left,target.left+caps.left*horizontal,target.left+target.width-caps.right*horizontal,target.left+target.width+padding.right];
 const y=[target.top-padding.top,target.top+caps.top*vertical,target.top+target.height-caps.bottom*vertical,target.top+target.height+padding.bottom];
 return Array.from({length:9},(_,i)=>{const row=Math.floor(i/3),col=i%3;return{left:x[col],top:y[row],width:Math.max(0,x[col+1]-x[col]),height:Math.max(0,y[row+1]-y[row])};});
}
/** Circular decoration keeps its aspect and centers on the logical control, including its baked shadow padding. */
export function skinCircleRect(target:DeckRect,contentSide:number,padding:DeckInsets):DeckRect{
 const side=Math.min(target.width,target.height),scale=side/contentSide;
 return{left:target.left+(target.width-side)/2-padding.left*scale,top:target.top+(target.height-side)/2-padding.top*scale,width:side+(padding.left+padding.right)*scale,height:side+(padding.top+padding.bottom)*scale};
}
