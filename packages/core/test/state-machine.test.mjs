import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialRecovery,advanceRecovery} from '../src/state-machine.ts';
const event=(id,action,actor,at=2,extra={})=>({id,action,actor,at,reason:'audit reason',...extra});
const base=()=>initialRecovery('request-1','100',1,10);
test('permitted lifecycle transitions and idempotent retries',()=>{
  const s=base(),v=advanceRecovery(s,event('v','view','recipient'));
  assert.equal(v.status,'viewed');assert.equal(v.version,1);
  assert.equal(advanceRecovery(v,event('v','view','recipient')),v);
  const accepted=advanceRecovery(v,event('a','accept','recipient',3));assert.equal(accepted.status,'accepted');assert.equal(accepted.refundedStroops,'0');
  const submitted=advanceRecovery(accepted,event('submit','submit_refund','recipient',4,{submissionHash:'a'.repeat(64)}));assert.equal(submitted.status,'refund_submitted');assert.equal(submitted.refundedStroops,'0');
  const partial=advanceRecovery(submitted,event('p','refund','settlement',11,{operationKey:`testnet:${'a'.repeat(64)}:0`,amountStroops:'40'}));
  assert.equal(partial.status,'partially_refunded');assert.equal(partial.refundedStroops,'40');
  const done=advanceRecovery(partial,event('f','refund','settlement',12,{operationKey:`testnet:${'b'.repeat(64)}:1`,amountStroops:'60'}));
  assert.equal(done.status,'refunded');assert.throws(()=>advanceRecovery(done,event('late','decline','recipient',13)));
});
test('decline, expiry and no automatic refunds on acceptance',()=>{
  assert.equal(advanceRecovery(base(),event('d','decline','recipient')).status,'declined');
  assert.equal(advanceRecovery(base(),event('x','expire','system',10)).status,'expired');
  assert.equal(advanceRecovery(base(),event('a','accept','recipient')).refundedStroops,'0');
});
test('fail closed on unauthorized, expiry, replay and illegal transitions',()=>{
  const b=base();
  for(const e of [event('a','accept','system'),event('v','view','recipient',10),event('x','expire','system',9),event('r','refund','settlement',2,{operationKey:`testnet:${'a'.repeat(64)}:0`,amountStroops:'1'})])assert.throws(()=>advanceRecovery(b,e));
  const a=advanceRecovery(b,event('a','accept','recipient'));
  assert.throws(()=>advanceRecovery(a,event('a','accept','recipient',3)));
  assert.throws(()=>advanceRecovery(a,event('v','view','recipient',3)));
  assert.throws(()=>advanceRecovery(a,event('r','refund','settlement',3,{operationKey:`testnet:${'a'.repeat(64)}:0`,amountStroops:'101'})));
  const p=advanceRecovery(a,event('r','refund','settlement',3,{operationKey:`testnet:${'a'.repeat(64)}:0`,amountStroops:'1'}));
  assert.throws(()=>advanceRecovery(p,event('r2','refund','settlement',4,{operationKey:`testnet:${'a'.repeat(64)}:0`,amountStroops:'1'})));
});
