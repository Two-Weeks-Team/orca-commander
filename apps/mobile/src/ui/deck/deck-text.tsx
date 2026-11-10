import {Text,StyleSheet,type TextProps} from 'react-native';

/** Owner-selected ceiling. Critical cell labels fit; long tab titles ellipsize at a readable base size. */
export const DECK_TEXT_MAX_MULTIPLIER=1.5;
export const DECK_TITLE_MIN_SIZE=12;
/** Deck-face policy; D30 physical sheets opt into the same ceiling through SheetText. Other screens keep their existing scaling. */
export function DeckText({style,numberOfLines=1,ellipsizeMode='tail',variant,...props}:TextProps&{variant?:'title'|'command'}){
 const title=variant==='title',command=variant==='command',size=StyleSheet.flatten(style)?.fontSize??DECK_TITLE_MIN_SIZE;
 return <Text {...props} style={[{minWidth:0,flexShrink:1,maxHeight:'100%',includeFontPadding:false},style,...(title||command?[{fontSize:Math.max(command?13:DECK_TITLE_MIN_SIZE,size)}]:[])]} numberOfLines={numberOfLines} allowFontScaling maxFontSizeMultiplier={DECK_TEXT_MAX_MULTIPLIER} adjustsFontSizeToFit={!title&&!command} minimumFontScale={title||command?1:0.5} ellipsizeMode={ellipsizeMode}/>;
}
