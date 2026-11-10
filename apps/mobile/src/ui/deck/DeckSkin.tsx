import {StyleSheet,View} from 'react-native';
import {Image} from 'expo-image';
import type {deckLayout,DeckRect} from './deck-layout';
import {responsiveManifest,responsiveImages} from './responsive-assets';
import {skinPatchRects,skinCircleRect} from './skin-patches';

/** Only adaptive backgrounds are composed. The original portrait phone still uses its unchanged full render. */
export function DeckSkin({layout}:{layout:ReturnType<typeof deckLayout>}){
 const primitives=responsiveManifest.primitives;
 const well=(name:'lcdWell'|'agentWell'|'commandWell'|'pttWell',target:DeckRect,id:string)=>{
  const primitive=primitives[name],positions=skinPatchRects(target,primitive.paddingPt,primitive.capInsetsPt);
  return primitive.patches.map(patch=>{const rect=positions[patch.row*3+patch.col];return rect&&rect.width>0&&rect.height>0?<Image key={`${id}-${patch.row}-${patch.col}`} source={responsiveImages[patch.file]} contentFit="fill" cachePolicy="memory" accessible={false} pointerEvents="none" style={[styles.absolute,rect]}/>:null;});
 };
 const circle=(name:'stickRing'|'dialTicks',target:DeckRect)=>{const primitive=primitives[name];return <Image source={responsiveImages[primitive.file]} contentFit="fill" cachePolicy="memory" accessible={false} pointerEvents="none" style={[styles.absolute,skinCircleRect(target,primitive.contentRectPt.w,primitive.paddingPt)]}/>;};
 const width=layout.voice.width*primitives.pttWell.placement.contentWidthRatio,height=layout.voice.height*primitives.pttWell.placement.contentHeightRatio;
 const voice={left:layout.voice.left+(layout.voice.width-width)/2,top:layout.voice.top+(layout.voice.height-height)/2,width,height};
 return <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill} testID="deck-responsive-skin">
  <Image source={responsiveImages[primitives.metalPlate.file]} contentFit="fill" cachePolicy="memory" accessible={false} style={StyleSheet.absoluteFill}/>
  {well('lcdWell',layout.status,'lcd')}
  {layout.agentKeys.map((rect,index)=>well('agentWell',rect,`key-${index}`))}
  {layout.commands.map((rect,index)=>well('commandWell',rect,`command-${index}`))}
  {well('pttWell',voice,'ptt')}{circle('stickRing',layout.stick)}{circle('dialTicks',layout.dial)}
 </View>;
}
const styles=StyleSheet.create({absolute:{position:'absolute'}});
