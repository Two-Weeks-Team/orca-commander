import React from 'react';
import {View} from 'react-native-web';
export const useSafeAreaInsets=()=>({top:0,right:0,bottom:24,left:0});
export function SafeAreaProvider({children,style}){return <View style={[{flex:1},style]}>{children}</View>;}
export function SafeAreaView({children,style,edges,...props}){return <View {...props} style={[{flex:1},style]}>{children}</View>;}
