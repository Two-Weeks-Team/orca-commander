import { mergeVoiceDraft } from '../src/ui/voice-draft';
let count=0;const check=(v:unknown,m:string)=>{count++;if(!v)throw new Error(m);};
const base={phase:'recording' as const,availability:'ready_local' as const,text:'wrong partial'};
check(mergeVoiceDraft('typed',base)==='typed\nwrong partial','partial appends to the typed prefix');
check(mergeVoiceDraft('typed',{...base,phase:'draft',text:''})==='typed','empty successful final removes superseded partial');
check(mergeVoiceDraft('',{...base,phase:'draft',text:''})==='','empty final can clear the voice-owned draft');
check(mergeVoiceDraft('typed',{...base,phase:'error',error:'connection_lost'})===undefined,'capture error does not replace an editable draft');
console.log(`PASS: ${count} voice draft assertions`);
