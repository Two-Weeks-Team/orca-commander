import type * as Feedback from '../../modules/deck-feedback';
let api:typeof Feedback|undefined,started=false,enabled=false,captureActive=false,failed=false;
const load=()=>api??(api=require('../../modules/deck-feedback') as typeof Feedback);
const configure=()=>{if(!started||failed)return;try{load().configureDeckFeedback({enabled,captureActive});}catch{failed=true;}};
/** Optional UI feedback never owns or changes the microphone audio session. */
export function prepareFeedback(){try{started=true;const result=load().prepareDeckFeedback();configure();return result;}catch{failed=true;return undefined;}}
export function setFeedbackEnabled(value:boolean){enabled=value;configure();}
/** The microphone owns this gate from before initialize through its actual native teardown. */
export function setFeedbackCaptureActive(value:boolean){captureActive=value;configure();}
export function feedbackStatus(){if(!started||failed)return undefined;try{return load().getDeckFeedbackStatus();}catch{failed=true;return undefined;}}
export function deckClick(){if(!started||failed||!enabled||captureActive)return;try{load().playDeckClick();}catch{failed=true;}}
