import {test} from 'node:test';import assert from 'node:assert/strict';
import {matchVoluntaryRefund,reconcileVoluntaryRefund} from '../src/refund-matcher.ts';
import {initialRecovery,advanceRecovery} from '../../core/src/state-machine.ts';
const A='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',B='GBQGQGB7PX6IMZJB2JJXO7DBKYQIDPJ62GCJK3WIC5OSEXPXWRSTSUCU';
const original={network:'testnet',transactionHash:'a'.repeat(64),operationIndex:0,type:'payment',source:A,destination:B,amount:'10',stroops:'100',asset:{type:'native'}};
const returned={...original,transactionHash:'b'.repeat(64),source:B,destination:A,stroops:'40',amount:'4'};
const accepted=id=>advanceRecovery(initialRecovery(id,'100',1,20),{id:'accepted',action:'accept',actor:'recipient',at:2,reason:'consent'});
const store=()=>{
 const states=new Map([['one',accepted('one')],['two',accepted('two')]]),used=new Map();
 return {async applyVerifiedRefund(id,key,value,at){if(used.has(key)){if(used.get(key)===id)return states.get(id);throw Error('Operation already claimed');}const next=advanceRecovery(states.get(id),{id:key,action:'refund',actor:'settlement',at,reason:'finalized ledger refund',operationKey:key,amountStroops:value});states.set(id,next);used.set(key,id);return next;}};
};
test('exact refund match with strong operation identity',()=>{assert.deepEqual(matchVoluntaryRefund(original,returned,A),{operationKey:`testnet:${'b'.repeat(64)}:0`,amountStroops:'40'});});
test('reject wrong destination, network, issuer, sender and path-payment ambiguity',()=>{
 for(const mutation of [{source:A},{destination:B},{network:'public'},{type:'path_payment_strict_receive'},{asset:{type:'credit',code:'USDC',issuer:B}}])assert.throws(()=>matchVoluntaryRefund(original,{...returned,...mutation},A));
 assert.throws(()=>matchVoluntaryRefund(original,{...original},A));
});
test('partial refund, idempotent ingest, full refund and cross-request double count blocked atomically',async()=>{
 const db=store();const apply=(id,refund,at)=>reconcileVoluntaryRefund({requestId:id,state:accepted(id),original,refund,returnAddress:A,settlementStore:db,at});
 const partial=await apply('one',returned,3);assert.equal(partial.status,'partially_refunded');assert.equal(partial.refundedStroops,'40');
 assert.equal((await apply('one',returned,4)).refundedStroops,'40');
 await assert.rejects(apply('two',returned,4));
 const full=await apply('one',{...returned,transactionHash:'c'.repeat(64),stroops:'60'},5);assert.equal(full.status,'refunded');
});
test('failed/insufficient authorization cannot claim settlement',async()=>{
 await assert.rejects(reconcileVoluntaryRefund({requestId:'one',state:initialRecovery('one','100',1,20),original,refund:returned,returnAddress:A,settlementStore:store(),at:3}));
});
