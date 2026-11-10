import type {HostDefaultAgentState} from '../../adapters/host-default-agent-client';
import {unresolvedHostDefaultLaunch} from '../../adapters/host-default-agent-journal';

/** Count all recorded uncertainty. Launch fences stay in their own worktree-scoped client;
 * this display count never grants or changes pane input/approval authority.
 */
export function overallUnresolvedCount(inputAndNative:number|null,launches:Pick<HostDefaultAgentState,'journal'|'receipts'>):number|null {
 if(inputAndNative===null||!Number.isSafeInteger(inputAndNative)||inputAndNative<0||launches.journal!=='ready')return null;
 return inputAndNative+launches.receipts.filter(unresolvedHostDefaultLaunch).length;
}
