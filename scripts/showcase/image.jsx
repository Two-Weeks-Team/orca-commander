import React from 'react';
import {View} from 'react-native-web';
export function Image({source,contentFit='contain',tintColor,transition,cachePolicy,style,...props}){
 const original=source?.default??source;
 const uri=typeof original==='string'?original:original?.uri;
 // A directly decoded DOM image avoids RN Web's duplicate CSS-background image
 // loading path. Geometry and onLayout still belong to the real Web View.
 const fit=contentFit==='fill'?'fill':contentFit;
 const box={position:'absolute',inset:0,width:'100%',height:'100%',objectFit:fit,pointerEvents:'none'};
 return <View {...props} style={[style,{overflow:'hidden'}]}>
  {tintColor?<div aria-hidden="true" style={{...box,backgroundColor:tintColor,maskImage:'url("'+uri+'")',maskPosition:'center',maskRepeat:'no-repeat',maskSize:contentFit==='fill'?'100% 100%':'contain'}}/>:<img alt="" draggable={false} src={uri} style={box}/>}
 </View>;
}
