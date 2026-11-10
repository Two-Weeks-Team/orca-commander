import {createDeckDisplayCacheStore} from './adapters/deck-display-cache-store';
import {createDeckSlotStore} from './adapters/deck-slot-store';
import { randomUUID } from 'expo-crypto';
import {StructuredActionClient} from './adapters/structured-action-client';
import {SecureRequestJournal} from './adapters/structured-request-journal';
import { SecureActionJournal } from './adapters/action-journal';
import { DeckActionClient } from './adapters/action-client';
import { createAppLiveSession } from './adapters/app-live-session';
import { durableActionValueStore, expoSecureValueStore } from './adapters/secure-store';
import {HostDefaultAgentClient} from './adapters/host-default-agent-client';
import {SecureHostDefaultAgentJournal} from './adapters/host-default-agent-journal';

/** One lifecycle-owned paired channel; read and action policies remain separate. */
export const liveSession = createAppLiveSession(expoSecureValueStore);

export const actionClient = new DeckActionClient(() => liveSession.actionChannel(),undefined,undefined,{refreshChannel:expected=>liveSession.refreshActionChannel(expected),journal:new SecureActionJournal(durableActionValueStore),newId:randomUUID});

export const structuredClient=new StructuredActionClient(()=>liveSession.actionChannel(),{refreshChannel:expected=>liveSession.refreshActionChannel(expected),journal:new SecureRequestJournal(durableActionValueStore),uuid:randomUUID});

export const hostDefaultAgentClient=new HostDefaultAgentClient(()=>liveSession.actionChannel(),{refreshChannel:expected=>liveSession.refreshActionChannel(expected),journal:new SecureHostDefaultAgentJournal(durableActionValueStore),uuid:randomUUID});

export const deckSlotStore=createDeckSlotStore(durableActionValueStore);

/** Targetless presentation only; never used by a read or action client. */
export const deckDisplayCacheStore=createDeckDisplayCacheStore(expoSecureValueStore);
