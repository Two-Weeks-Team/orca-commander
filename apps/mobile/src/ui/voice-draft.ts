import type { DictationSnapshot } from '../adapters/host-dictation';
/** Only an active/completed voice session owns this region; an empty final removes its superseded partial. */
export function mergeVoiceDraft(prefix:string,speech:DictationSnapshot):string|undefined {
 if(!['recording','finishing','draft'].includes(speech.phase))return undefined;
 return speech.text?(prefix?`${prefix}\n`:'')+speech.text:prefix;
}
