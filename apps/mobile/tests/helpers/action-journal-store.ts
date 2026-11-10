import type { SecureValueStore } from '../../src/adapters/pairing-store';
export class FakeJournalStore implements SecureValueStore {
 readonly values=new Map<string,string>();reads=0;writes=0;removals=0;
 beforeGet?:(key:string)=>void|Promise<void>;
 beforeSet?:(key:string,value:string)=>void|Promise<void>;
 async get(key:string):Promise<string|null>{this.reads++;await this.beforeGet?.(key);return this.values.get(key)??null;}
 async set(key:string,value:string):Promise<void>{this.writes++;await this.beforeSet?.(key,value);this.values.set(key,value);}
 async remove():Promise<void>{this.removals++;throw new Error('journal must not delete values');}
}
