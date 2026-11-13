import * as Native from 'react-native-web';
export * from 'react-native-web';
// Documentation environment only. No native bridge or device APIs are loaded.
export const useWindowDimensions=()=>({...window.__PREVIEW_FRAME__,scale:2,fontScale:1});
export const AccessibilityInfo={
  isScreenReaderEnabled:async()=>false,
  isReduceMotionEnabled:async()=>true,
  addEventListener:()=>({remove(){}})
};
export const AppState={currentState:'active',addEventListener:()=>({remove(){}})};
export const Platform={OS:'web',isPad:false,select:options=>options.web??options.default??options.ios};
export const Alert={alert(){}};
export const Keyboard={dismiss(){},addListener:()=>({remove(){}})};
export const View=Native.View;
