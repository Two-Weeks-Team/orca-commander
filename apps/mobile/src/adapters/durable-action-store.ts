import type { SecureValueStore } from './pairing-store';

/** Android cached read-back is insufficient unless the compiled native module checks disk commit. */
export function createDurableActionStore(store:SecureValueStore,platform:string,nativeCommitVerified:unknown):SecureValueStore {
 if(platform==='ios'||platform==='android'&&nativeCommitVerified===true)return store;
 const unavailable=async():Promise<never>=>{throw new Error('action_storage_unavailable');};
 return{get:unavailable,set:unavailable,remove:unavailable};
}
