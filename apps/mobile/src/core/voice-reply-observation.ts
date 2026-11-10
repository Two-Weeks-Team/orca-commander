import type {TerminalReplyEvidence} from '../adapters/terminal-reply-evidence';
import {READ_FRESH_MS} from './read-freshness';
export type VoiceReplyObservation='wait'|'replaced'|{kind:'reply'|'waiting';body:string}|{kind:'stopped'};
/** A notification decision only. It never creates an action, choice or permission confirmation. */
export function observeVoiceReply(baseline:TerminalReplyEvidence,next:TerminalReplyEvidence,issuedAt:number,now:number):VoiceReplyObservation{
 if(!Number.isFinite(issuedAt)||!Number.isFinite(now)||now<issuedAt||now-issuedAt>READ_FRESH_MS)return 'wait';
 const a=baseline.target,b=next.target;
 if(a.worktreeId!==b.worktreeId||a.paneKey!==b.paneKey||a.handle!==b.handle||a.incarnationId!==b.incarnationId||baseline.publication.epoch!==next.publication.epoch)return 'replaced';
 if(next.publication.version<baseline.publication.version)return 'wait';
 if(next.stopping)return 'wait';
 if(next.interrupted||next.sessionBoundary||next.unconfirmed)return{kind:'stopped'};
 // Stop and transcript publication are non-atomic. A new end with the previous body is not a new answer.
 if(next.knownToolOutput||!next.body?.trim()||next.body===baseline.body)return 'wait';
 if(next.state==='done'&&next.turnEndDisposition==='identified'&&next.turnEndedAt!==undefined&&next.turnEndedAt!==baseline.turnEndedAt)return{kind:'reply',body:next.body};
 if(next.state==='waiting'&&next.stateStartedAt!==baseline.stateStartedAt)return{kind:'waiting',body:next.body};
 return 'wait';
}
