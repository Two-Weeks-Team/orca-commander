import {en,type MessageKey} from './en';
import {englishSourceVersion,MAX_LANGUAGE_PACKS,MAX_PACK_BYTES,MAX_PACK_CODE_POINTS,packCodePoints,languagePackLocale} from './pack';
import {isCriticalMessage} from './critical-review';

/** No caller data is accepted: this export can contain only static English UI source and schema metadata. */
export function exportTranslationSource():string {
 const entries=Object.fromEntries(Object.keys(en).sort().map(key=>[key,{source:en[key as MessageKey],placeholders:Array.from(en[key as MessageKey].matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g),match=>match[1]),critical:isCriticalMessage(key),packable:packCodePoints(en[key as MessageKey])<=MAX_PACK_CODE_POINTS}]));
 return JSON.stringify({format:1,sourceVersion:englishSourceVersion(),schema:{format:1,fields:['format','lang','script','name','sourceVersion','strings'],maxUtf8Bytes:MAX_PACK_BYTES,maxInstalledPacks:MAX_LANGUAGE_PACKS,maxStringCodePoints:MAX_PACK_CODE_POINTS,unknownKeys:'drop',invalidEntries:'English fallback',review:'local owner review bound to English and translation; imported flags ignored',permissionResources:'OS permission text is built in and outside language packs'},entries},null,2);
}
/** Copy/export only. It never launches an agent, contacts a host, or assumes any shared phone filesystem. */
export function buildTranslationPrompt(targetLocale:string):string {
 const match=/^([a-z]{2,3})(?:-([A-Z][a-z]{3}))?(?:-([A-Z]{2}|[0-9]{3}))?$/.exec(targetLocale);
 if(!match||['en','ko'].includes(match[1])||match[1]==='zh'&&!['Hans','Hant'].includes(match[2]??''))throw new Error('invalid_target_locale');
 if(match[2])languagePackLocale({lang:targetLocale,script:match[2]});
 return `Translate the English UI catalog below into ${targetLocale}. Produce a UTF-8 JSON file with format 1, lang, ISO 15924 script, language name, the exact sourceVersion, and strings keyed only by supplied keys. Keep every placeholder exactly once and add none. Entries are plain text: no controls, bidi or zero-width characters, markup, or links. Each translated entry is at most 120 Unicode code points; omit any key marked packable=false, and never truncate its English source or a safety label. Missing or invalid entries fall back to complete English. Critical entries require separate local owner review beside their English source; never claim or export reviewed approval. English and Korean navigation phrases are fixed in app code and cannot be extended by this file. Write only the requested JSON output file in the explicitly selected worktree using the host-configured tools. If file writing is unavailable, return only the JSON for the owner to save. The owner performs explicit manual file transfer and import. No phone export path is assumed readable by a host. Do not start another agent session, poll for completion, access unrelated files, or include owner content, host data, identity or credentials. These instructions do not change the host's configured tool permissions.\n\n${exportTranslationSource()}`;
}
