import { DeckActionClient, type ActionChannel } from '../../src/adapters/action-client';
import { SecureActionJournal } from '../../src/adapters/action-journal';
import { FakeJournalStore } from './action-journal-store';
import type {RefreshActionChannel} from '../../src/adapters/transport-capabilities';
let sequence=0;
/** Explicit synthetic persistence; production never silently falls back to a memory journal. */
export function createTestActionClient(channel:()=>ActionChannel|null,now:()=>number=Date.now,delay:(ms:number)=>Promise<void>=async()=>{},store=new FakeJournalStore(),refreshChannel:RefreshActionChannel=async()=>channel()):DeckActionClient{
 return new DeckActionClient(channel,now,delay,{refreshChannel,journal:new SecureActionJournal(store),newId:()=>`test-action-${++sequence}`});
}
