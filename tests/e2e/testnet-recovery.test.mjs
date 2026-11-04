import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StellarLedgerClient} from '../../packages/ledger/src/client.ts';
import {normalizePayment} from '../../packages/ledger/src/normalize.ts';
import {matchVoluntaryRefund} from '../../packages/ledger/src/refund-matcher.ts';
import {initialRecovery,advanceRecovery} from '../../packages/core/src/state-machine.ts';

// Intentionally NOT part of the default offline test suite. Run only when all
// real Testnet transaction hashes and operation indexes are supplied.
const keys=['RECLAIM_ORIGINAL_TX','RECLAIM_PARTIAL_TX','RECLAIM_FINAL_TX'];
const hash=(key)=>{
 const value=process.env[key];
 if(!value || !/^[a-fA-F0-9]{64}$/.test(value)) throw new Error(`Set ${key} to a real 64-character Testnet transaction hash`);
 return value.toLowerCase();
};
const index=(key)=>{
 const raw=process.env[key];
 if(raw===undefined || !/^(0|[1-9][0-9]*)$/.test(raw) || !Number.isSafeInteger(Number(raw)))throw new Error(`Set ${key} to an operation index`);
 return Number(raw);
};
test('verified real Testnet payment and two voluntary refund operations', {timeout:90000}, async()=>{
 for(const key of keys)hash(key);
 const client=new StellarLedgerClient('testnet');
 const payment=async(key,position)=>{
  const lookup=await client.lookup(hash(key));
  assert.equal(lookup.network,'testnet');
  return normalizePayment(lookup,index(position));
 };
 const original=await payment('RECLAIM_ORIGINAL_TX','RECLAIM_ORIGINAL_OP');
 const partial=await payment('RECLAIM_PARTIAL_TX','RECLAIM_PARTIAL_OP');
 const final=await payment('RECLAIM_FINAL_TX','RECLAIM_FINAL_OP');
 assert.equal(original.type,'payment','This scenario requires a classic payment operation');
 assert.notEqual(original.source,original.destination);
 const p=matchVoluntaryRefund(original,partial,original.source);
 const f=matchVoluntaryRefund(original,final,original.source);
 assert.notEqual(p.operationKey,f.operationKey);
 const total=BigInt(original.stroops);
 assert(BigInt(p.amountStroops)>0n && BigInt(p.amountStroops)<total,'First refund must be partial');
 assert.equal(BigInt(p.amountStroops)+BigInt(f.amountStroops),total,'Second refund must complete exact total');
 let state=initialRecovery('testnet-verification',original.stroops,1,100);
 assert.throws(()=>advanceRecovery(state,{id:'unconsented',action:'refund',actor:'settlement',at:2,reason:'not consented',operationKey:p.operationKey,amountStroops:p.amountStroops}),{code:'conflict'});
 const refusal=advanceRecovery(state,{id:'refusal',action:'decline',actor:'recipient',at:2,reason:'recipient refused'});
 assert.equal(refusal.status,'declined');
 assert.throws(()=>advanceRecovery(refusal,{id:'no-forced-refund',action:'refund',actor:'settlement',at:3,reason:'refused',operationKey:p.operationKey,amountStroops:p.amountStroops}),{code:'terminal'});
 state=advanceRecovery(state,{id:'accept',action:'accept',actor:'recipient',at:2,reason:'voluntary consent'});
 state=advanceRecovery(state,{id:'partial',action:'refund',actor:'settlement',at:3,reason:'verified Testnet payment',operationKey:p.operationKey,amountStroops:p.amountStroops});
 assert.equal(state.status,'partially_refunded');
 state=advanceRecovery(state,{id:'full',action:'refund',actor:'settlement',at:4,reason:'verified Testnet payment',operationKey:f.operationKey,amountStroops:f.amountStroops});
 assert.equal(state.status,'refunded');
 assert.throws(()=>matchVoluntaryRefund(original,{...partial,destination:original.destination},original.source),{code:'mismatch'});
 assert.throws(()=>matchVoluntaryRefund(original,{...partial,network:'public'},original.source),{code:'mismatch'});
 console.log(JSON.stringify({network:'testnet',original:original.transactionHash,partial:partial.transactionHash,final:final.transactionHash,status:state.status}));
});
