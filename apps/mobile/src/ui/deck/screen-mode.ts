import type {ScreenModePreference} from '../../i18n/preferences';
export interface ScreenModeInput {
 preference:ScreenModePreference;screenReader:boolean|null;fontScale:number;needsList:boolean;
}
export type ScreenModeReason='manual-list'|'manual-deck'|'layout-needs-list'|'auto-deck';
export interface ScreenModeResolution {mode:'deck'|'list';reason:ScreenModeReason}
/**
 * The physical face is the default. Font scaling belongs to its text layout, and reader support belongs to its
 * accessible controls; neither selects another surface. Callers recompute needsList on every viewport change.
 * Presentation policy only: preserve drafts/focus/sheets and invalidate armed confirmations separately.
 */
export function resolveScreenMode(input:ScreenModeInput):ScreenModeResolution {
 const result=(mode:'deck'|'list',reason:ScreenModeReason):ScreenModeResolution=>({mode,reason});
 if(input.preference==='list')return result('list','manual-list');
 if(input.needsList)return result('list','layout-needs-list');
 if(input.preference==='deck')return result('deck','manual-deck');
 return result('deck','auto-deck');
}
/** Memory-only equality key for the existing confirmation context ticket; never an authorization token. */
export function screenLocaleSignature(value:{mode:'deck'|'list';locale:string}):string {
 return JSON.stringify([value.mode,value.locale]);
}
