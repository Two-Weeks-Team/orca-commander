import {englishSourceVersion,parseLanguagePack,type PackParseResult} from '../i18n/pack';
import {buildTranslationPrompt,exportTranslationSource} from '../i18n/translation-prompt';
import {decodeUtf8PackBytes,PackFileBytesError,readBoundedPackBytes} from '../i18n/pack-file-bytes';

type PickerModule=typeof import('expo-document-picker');
type FileSystemModule=typeof import('expo-file-system');
type SharingModule=typeof import('expo-sharing');
export type LanguagePackFileImportResult=
 |{status:'canceled'}
 |{status:'parsed';result:PackParseResult}
 |{status:'error';reason:'picker_failed'|'invalid_selection'|'read_failed'|'too_large'|'invalid_utf8'|'busy'};
export type LanguagePackFileExportResult=
 |{status:'share_sheet_closed';sourceVersion:string;bytes:number}
 |{status:'error';reason:'unavailable'|'write_failed'|'share_failed'|'invalid_locale'|'busy'};

let operationInFlight=false,exportSequence=0;
// Native modules load only after an explicit import/export action, never during app startup.
const picker=()=>require('expo-document-picker') as PickerModule;
const fileSystem=()=>require('expo-file-system') as FileSystemModule;
const sharing=()=>require('expo-sharing') as SharingModule;

/**
 * Read only the one document explicitly selected in the OS UI. Its name, URI and
 * advertised size are not returned or logged. No URI is treated as a host path.
 *
 * The 64KiB cap applies AFTER native picking/copying: copyToCacheDirectory copies
 * the entire provider file before returning, and iOS picker import also copies.
 * This adapter cannot cap that earlier copy's disk use, provider memory or time.
 */
export async function importLanguagePackFile():Promise<LanguagePackFileImportResult> {
 if(operationInFlight)return{status:'error',reason:'busy'};
 operationInFlight=true;
 try{
  let selected:Awaited<ReturnType<PickerModule['getDocumentAsync']>>;
  try{selected=await picker().getDocumentAsync({type:'application/json',multiple:false,copyToCacheDirectory:true});}
  catch{return{status:'error',reason:'picker_failed'};}
  if(selected.canceled)return{status:'canceled'};
  if(selected.assets.length!==1)return{status:'error',reason:'invalid_selection'};
  const uri=selected.assets[0]?.uri;
  // A native cache copy is a local file; do not fall back to a remote/content URI reader.
  if(typeof uri!=='string'||!uri.startsWith('file://'))return{status:'error',reason:'invalid_selection'};
  try{
   const {File}=fileSystem(),handle=new File(uri).open();
   const text=decodeUtf8PackBytes(readBoundedPackBytes(handle));
   return{status:'parsed',result:parseLanguagePack(text)};
  }catch(error){
   return{status:'error',reason:error instanceof PackFileBytesError?error.code:'read_failed'};
  }
 }finally{operationInFlight=false;}
}

async function shareStaticFile(kind:'source'|'prompt',text:string,sourceVersion:string):Promise<LanguagePackFileExportResult> {
 let nativeSharing:SharingModule;
 try{
  nativeSharing=sharing();
  if(!await nativeSharing.isAvailableAsync())return{status:'error',reason:'unavailable'};
 }catch{return{status:'error',reason:'unavailable'};}
 let uri:string,byteCount:number;
 try{
  // New app-owned, source-versioned artifact each time: a share target may still read
  // after its chooser closes. No deletion or reuse of that target's file occurs here.
  const {File,Directory,Paths}=fileSystem();
  const directory=new Directory(Paths.cache,'deck-language-export',sourceVersion,`${Date.now()}-${++exportSequence}`);
  directory.create({intermediates:true});
  // The complete static-source export is separate from the imported-pack 64KiB cap.
  const file=new File(directory,kind==='source'?'orca-deck-english-source.json':'orca-deck-translation-prompt.txt');
  const bytes=new TextEncoder().encode(text);byteCount=bytes.byteLength;
  file.create();file.write(bytes);uri=file.uri;
 }catch{return{status:'error',reason:'write_failed'};}
 try{
  await nativeSharing.shareAsync(uri,{mimeType:kind==='source'?'application/json':'text/plain',UTI:kind==='source'?'public.json':'public.plain-text'});
  // Promise<void> has no delivery receipt: cancellation and a completed chooser can both resolve.
  return{status:'share_sheet_closed',sourceVersion,bytes:byteCount};
 }catch{return{status:'error',reason:'share_failed'};}
}

/** No caller data: export only the complete static English UI catalog and schema metadata. */
export async function exportLanguagePackSource():Promise<LanguagePackFileExportResult> {
 if(operationInFlight)return{status:'error',reason:'busy'};
 operationInFlight=true;
 try{return await shareStaticFile('source',exportTranslationSource(),englishSourceVersion());}
 finally{operationInFlight=false;}
}

/** Locale is validated by the existing pure core; there is no freeform prompt or owner-data argument. */
export async function exportLanguagePackPrompt(locale:string):Promise<LanguagePackFileExportResult> {
 if(operationInFlight)return{status:'error',reason:'busy'};
 operationInFlight=true;
 try{
  let text:string;
  try{text=buildTranslationPrompt(locale);}catch{return{status:'error',reason:'invalid_locale'};}
  return await shareStaticFile('prompt',text,englishSourceVersion());
 }finally{operationInFlight=false;}
}
