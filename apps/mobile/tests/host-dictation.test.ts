import { HostDictation, type Microphone, type DictationSnapshot } from '../src/adapters/host-dictation';
import { mergeVoiceDraft } from '../src/ui/voice-draft';
import type { ActionChannel } from '../src/adapters/action-client';
let count=0;function check(v:unknown,m:string){count++;if(!v)throw new Error(m);}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
async function main(){
 let granted=true,opens=0,closes=0,data:(b:Uint8Array)=>void=()=>{},interrupt:()=>void=()=>{};
 const mic:Microphone={permission:async()=>granted,open:async(d,i)=>{opens++;data=d;interrupt=i;return true;},close:()=>{closes++;}};
 let setup:unknown={enabled:true,selectedModelId:'ko',models:[{id:'ko',label:'Korean',provider:'local',status:'ready'}]};
 let final:unknown={dictationId:'voice-1',text:'확인했습니다'};let finalWait:Promise<unknown>|undefined;
 const calls:{method:string;params?:Record<string,unknown>}[]=[];
 const channel:ActionChannel={runtimeId:'runtime-fixture',hostId:'h',generation:1,confirmedAt:1000,agents:[],transport:{async request(method,params){calls.push({method,params});if(method==='speech.models.list')return setup;if(method==='speech.dictation.start')return{dictationId:params?.dictationId,modelId:'ko',dedupesResentChunks:true};if(method==='speech.dictation.chunk')return{dictationId:params?.dictationId,text:'확인'};if(method==='speech.dictation.finish')return finalWait??final;if(method==='speech.dictation.cancel')return{};throw new Error('unexpected');}}};
 let current:ActionChannel|null=channel;
 const voice=new HostDictation(()=>current,mic,()=> 'voice-1',()=>1000);
 await voice.refresh();check(voice.getSnapshot().availability==='ready_local','ready local host model displayed');
 await voice.start();check(voice.getSnapshot().phase==='recording'&&opens===1,'microphone capture remains active after verified host start');
 data(new Uint8Array(32000));await flush();
 check(voice.getSnapshot().audio==='quiet','silent real PCM is distinguished from missing microphone data');
 const audible=new Uint8Array(16000);audible[1]=20;data(audible);await flush();
 check(voice.getSnapshot().audio==='heard','nonzero PCM reports sound without retaining audio');
 check(voice.getSnapshot().text==='확인','partial transcript visible');
 const chunk=calls.find(c=>c.method==='speech.dictation.chunk');
 check(chunk?.params?.sampleRate===16000&&chunk?.params?.seq===0,'original host PCM rate and sequence');
 check(typeof chunk?.params?.audioBase64==='string'&&chunk.params.audioBase64.length<=213336,'bounded PCM chunk');
 await voice.finish();check(voice.getSnapshot().phase==='draft'&&voice.getSnapshot().text==='확인했습니다','final transcript becomes draft only');
 check(closes>=1,'finish releases microphone');
 check(!calls.some(c=>/terminal.send|Approval|Question|resolve/.test(c.method)),'voice never submits or approves anything');

 setup={enabled:false,selectedModelId:'',models:[]};await voice.refresh();check(voice.getSnapshot().availability==='disabled','disabled voice explained');
 await voice.start();check(opens===2&&voice.getSnapshot().phase==='idle','fresh disabled model stops the explicitly requested local prebuffer without starting dictation');
 setup={enabled:true,selectedModelId:'ko',models:[{id:'ko',provider:'local',status:'not-downloaded'}]};await voice.refresh();check(voice.getSnapshot().availability==='model_not_ready','missing host model explained');
 check(!calls.some(c=>c.method==='speech.models.download'||c.method==='speech.models.delete'||c.method==='speech.dictation.setup'),'voice never downloads, deletes or silently configures host');

 setup={enabled:true,selectedModelId:'ko',models:[{id:'ko',provider:'local',status:'ready'}]};granted=false;await voice.start();check(voice.getSnapshot().error==='microphone_denied'&&opens===2,'permission denial is actionable without starting capture');granted=true;
 await voice.start();data(new Uint8Array(32000));await flush();current=null;data(new Uint8Array(32000));await flush();
 check(voice.getSnapshot().error==='connection_lost'&&voice.getSnapshot().text==='확인','drop stops capture and preserves partial for editing');
 await voice.cancel();check(voice.getSnapshot().phase==='error','repeated cancellation does not reactivate an errored voice draft');
 check(mergeVoiceDraft('manually corrected',voice.getSnapshot())===undefined,'error cleanup cannot overwrite the manually corrected editor');
 current=channel;
 await voice.start();interrupt();await flush();check(voice.getSnapshot().error==='interrupted','audio interruption cancels dictation');

 let resolveFinal!:(v:unknown)=>void;finalWait=new Promise(res=>{resolveFinal=res;});
 await voice.start();const finishing=voice.finish();await flush();await voice.cancel();resolveFinal({dictationId:'voice-1',text:'late result'});await finishing;
 check(voice.getSnapshot().text!=='late result','late final after cancel cannot replace draft');
 finalWait=undefined;
 let last:DictationSnapshot|undefined;const unsubscribe=voice.subscribe(s=>{last=s;});await voice.refresh();check(last?.availability==='ready_local','UI observes readiness changes');unsubscribe();
 // The first iOS permission alert temporarily makes the app inactive before permission resolves.
 let permit!:(v:boolean)=>void;let firstOpens=0;
 const firstMic:Microphone={permission:()=>new Promise(resolve=>{permit=resolve;}),open:async()=>{firstOpens++;return true;},close:()=>{}};
 const first=new HostDictation(()=>current,firstMic,()=> 'voice-first',()=>1000);
 const firstStart=first.start();await flush();first.handleAppState('inactive');permit(true);await firstStart;
 check(first.getSnapshot().phase==='recording'&&firstOpens===1,'first permission alert does not cancel the requested recording');
 first.handleAppState('inactive');await flush();check(first.getSnapshot().phase==='idle','inactive during actual recording still releases capture');
 const backgroundStart=first.start();await flush();first.handleAppState('background');permit(true);await backgroundStart;
 check(firstOpens===1&&first.getSnapshot().phase==='idle','background during permission never opens microphone after approval');
 console.log(`PASS: ${count} host dictation assertions`);
}
void main();
