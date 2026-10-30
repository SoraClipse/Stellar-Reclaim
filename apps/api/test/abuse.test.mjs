import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {throttle,publicFailure,MAX_BODY_BYTES} from '../src/middleware/abuse.ts';
import {freshChallenge,publicReceipt,createRecovery,decide,inbox} from '../src/recovery.ts';
const wallet='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
test('limits repeat caller and isolates scopes',()=>{
  for(let i=0;i<2;i++)throttle('test-limit','user-unique',2,60000,100);
  assert.throws(()=>throttle('test-limit','user-unique',2,60000,100),/Too many/);
  throttle('other-scope','user-unique',2,60000,100);
  throttle('test-limit','user-unique',2,60000,60_101);
});
test('private errors redact exception details',()=>{
  assert.deepEqual(publicFailure(new Error('SECRET email private note')),{status:500,body:{error:'Request failed'}});
  assert.equal(MAX_BODY_BYTES,8192);
});
test('reject malformed challenge wallet and oversized note',()=>{
  assert.throws(()=>freshChallenge('bad','inbox'),/Invalid Stellar/);
  assert.throws(()=>createRecovery({txHash:'f'.repeat(64),operationIndex:0,network:'testnet',note:'s'.repeat(501)}, {network:'testnet',txHash:'f'.repeat(64),operationIndex:0,sender:wallet,recipient:wallet,asset:'XLM',amount:'1'},wallet),/Request too large/);
});
test('public receipt never reveals private notes or identities',()=>{
  const result=createRecovery({txHash:'e'.repeat(64),operationIndex:0,network:'testnet',note:'secret address'}, {network:'testnet',txHash:'e'.repeat(64),operationIndex:0,sender:wallet,recipient:wallet,asset:'XLM',amount:'1'},wallet);
  const publicView=JSON.stringify(publicReceipt(result.id));
  assert.doesNotMatch(publicView,/secret|sender|recipient|note/);
  assert.equal(inbox(wallet)[0].note,'secret address');
  assert.equal(decide(result.id,wallet,'accept').requiresSeparatePayment,true);
  assert.throws(()=>decide(result.id,wallet,'decline'),/no longer actionable/);
  assert.throws(()=>publicReceipt('not-found'),/Not found/);
});
