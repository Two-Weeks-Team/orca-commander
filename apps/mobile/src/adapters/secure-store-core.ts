import type { SecureValueStore } from './pairing-store';

/** The part of `expo-secure-store` the app uses; a fake can stand in for it in tests. */
export interface SecureStoreApi {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: number;
  getItemAsync(key: string, options: { keychainAccessible: number; keychainService: string }): Promise<string | null>;
  setItemAsync(key: string, value: string, options: { keychainAccessible: number; keychainService: string }): Promise<void>;
  deleteItemAsync(key: string, options: { keychainAccessible: number; keychainService: string }): Promise<void>;
}

/**
 * The platform secure store (Keychain on iOS, Keystore on Android) behind the pairing store.
 * - iOS `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: readable only while the device is unlocked, never included in backups and never
 *   migrated to another device, so the device token cannot leave this phone through iCloud or a restore. (Android's
 *   Keystore has its own rules and ignores this option.)
 * - The app's own Keychain service, so the item is not filed under the library's shared default.
 * Note: the native delete reports nothing, so callers that must be sure (PairingStore.clear) read the value back.
 */
export function createExpoSecureValueStore(api: SecureStoreApi): SecureValueStore {
  const options = { keychainAccessible: api.WHEN_UNLOCKED_THIS_DEVICE_ONLY, keychainService: 'orca-deck' };
  return {
    get: key => api.getItemAsync(key, options),
    set: (key, value) => api.setItemAsync(key, value, options),
    remove: key => api.deleteItemAsync(key, options),
  };
}
