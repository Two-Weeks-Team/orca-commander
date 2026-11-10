import {createDurableActionStore} from '../src/adapters/durable-action-store';
import {SecureActionJournal} from '../src/adapters/action-journal';
let n=0;function check(v:unknown,m:string){n++;if(!v)throw new Error(m);}
async function main(){
 let calls=0;const base={get:async()=>{calls++;return null;},set:async()=>{calls++;},remove:async()=>{throw new Error('unexpected_delete');}};
 for(const marker of [undefined,false,1,'true']){
  const journal=new SecureActionJournal(createDurableActionStore(base,'android',marker));
  let refused=false;try{await journal.load();}catch{refused=true;}
  check(refused,'unverified native Android store refuses journal load');
 }
 check(calls===0,'unsupported native builds never touch storage or pairing values');
 check(createDurableActionStore(base,'android',true)===base,'verified Android module retains existing store');
 check(createDurableActionStore(base,'ios',undefined)===base,'iOS keeps native Keychain failure propagation');
 let refused=false;try{await createDurableActionStore(base,'web',true).get('synthetic');}catch{refused=true;}
 check(refused,'unknown platforms cannot authorize input persistence');
 console.log(`PASS: ${n} durable platform storage assertions (fake native capability; no device)`);
}
void main();
