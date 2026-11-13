import React from 'react';
import {createTranslator} from '../../apps/mobile/src/i18n/messages';
const context=React.createContext(null);
export function PreviewMessages({locale,children}){
 const [preferences,update]=React.useState({language:locale,screenMode:'auto',clicks:false});
 const value=React.useMemo(()=>({t:createTranslator(locale),locale,presentationRevision:1,preferences,preferencesReady:true,preferencesWritable:true,updatePreferences:patch=>update(p=>({...p,...patch}))}),[locale,preferences]);
 return <context.Provider value={value}>{children}</context.Provider>;
}
export const useMessages=()=>React.useContext(context);
