import {File,Paths} from 'expo-file-system';
import {createPackFileValueStore} from '../i18n/pack-file-store-core';
import {durableActionValueStore} from './secure-store';

/** Catalog text only, under the app's private document directory; no public Documents exposure. */
export const languagePackValueStore=createPackFileValueStore({
 pointer:durableActionValueStore,
 files:{
  async read(slot,limit){
   const handle=new File(Paths.document,`deck-language-packs-v1-${slot}.json`).open();
   try{
    const chunks:Uint8Array[]=[];let size=0;
    while(size<limit){const chunk=handle.readBytes(Math.min(65536,limit-size));if(chunk.length===0)break;chunks.push(chunk);size+=chunk.length;}
    const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
   }finally{handle.close();}
  },
  async write(slot,bytes){const file=new File(Paths.document,`deck-language-packs-v1-${slot}.json`);file.create({overwrite:true});file.write(bytes);},
 },
});
