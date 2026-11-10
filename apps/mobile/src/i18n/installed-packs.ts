import {languagePackValueStore} from '../adapters/language-pack-storage';
import {createPackStore} from './pack-store';
import {PACK_STORE_MAX_BYTES} from './pack-file-store-core';

export const languagePacks=createPackStore(languagePackValueStore,{maxValueBytes:PACK_STORE_MAX_BYTES});
let initialLoad:Promise<unknown>|undefined;
export function ensureLanguagePacksLoaded():Promise<unknown>{return initialLoad??=languagePacks.load();}
