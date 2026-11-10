import * as SecureStore from 'expo-secure-store';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { createDurableActionStore } from './durable-action-store';
import { createExpoSecureValueStore } from './secure-store-core';

export const expoSecureValueStore = createExpoSecureValueStore(SecureStore);

const nativeStore=requireOptionalNativeModule<{deckPersistentCommitV1?:unknown}>('ExpoSecureStore');
export const durableActionValueStore=createDurableActionStore(expoSecureValueStore,Platform.OS,nativeStore?.deckPersistentCommitV1);
