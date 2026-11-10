import assert from 'node:assert/strict';
import {ensureTransportCapabilities} from '../src/adapters/transport-capabilities';
import type {ActionChannel} from '../src/adapters/action-client';
let n=0;const check=(value:unknown,message:string)=>{n++;assert.ok(value,message);};
async function main(){
 let advertised:string[]=[],active=0,max=0,wrong=false;
 const c:ActionChannel={runtimeId:'runtime-fixture',hostId:'h',hostVersion:'1.4.246',generation:1,confirmedAt:0,agents:[],transport:{async request(method,params){active++;max=Math.max(max,active);await Promise.resolve();active--;if(method==='status.get')return{runtimeId:'runtime-fixture',appVersion:'1.4.246',capabilities:['read','launch']};advertised=params?.clientCapabilities as string[];return{clientCapabilities:wrong?[]:advertised};}}};
 await Promise.all([ensureTransportCapabilities(c,['read'],['read','claude-read'],()=>c),ensureTransportCapabilities(c,['launch'],['launch'],()=>c)]);
 check(advertised.includes('read')&&advertised.includes('claude-read')&&advertised.includes('launch'),'concurrent clients preserve the union of implemented declarations');check(max===1,'transport capability writes are serialized');
 await ensureTransportCapabilities(c,['read'],['read'],()=>c);check(advertised.includes('launch'),'later read negotiation cannot remove launch support');
 let rejected=false;try{await ensureTransportCapabilities(c,['missing'],['new'],()=>c);}catch{rejected=true;}check(rejected,'missing host capability is refused');
 wrong=true;rejected=false;try{await ensureTransportCapabilities(c,['launch'],['another'],()=>c);}catch{rejected=true;}check(rejected,'non-exact echo refuses capability authority');
 wrong=false;await ensureTransportCapabilities(c,['launch'],['another'],()=>c);check(advertised.includes('claude-read')&&advertised.includes('another'),'failed advertisement retries its full union without losing old readers');
 const noVersion={...c,hostVersion:undefined,transport:{request:async(method:string,params?:Record<string,unknown>)=>method==='status.get'?{runtimeId:c.runtimeId,capabilities:['read']}:{clientCapabilities:params?.clientCapabilities}}};await ensureTransportCapabilities(noVersion,['read'],['read'],()=>noVersion);check(true,'missing diagnostic host version does not close valid runtime contract');
 console.log(`PASS: ${n} shared capability assertions (fake transport only)`);
}
void main();
