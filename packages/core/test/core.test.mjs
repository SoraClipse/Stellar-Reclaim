import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseStroops,formatStroops,assertTransactionHash,assertAccount} from '../src/index.ts';
test('exact amount parsing without float loss',()=>{assert.equal(parseStroops('0.0000001'),1n);assert.equal(formatStroops(123456789n),'12.3456789');assert.equal(parseStroops('922337203685.4775807'),9223372036854775807n);});
test('rejects invalid amounts',()=>{for(const x of ['0','0.0000000','1.23456789','1e5','-2','01','1.','922337203685.4775808']) assert.throws(()=>parseStroops(x));});
test('transaction hash and address checks',()=>{assert.equal(assertTransactionHash('A'.repeat(64)),'a'.repeat(64));assert.throws(()=>assertTransactionHash('a'.repeat(63)));assert.equal(assertAccount('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF').length,56);assert.throws(()=>assertAccount('G'.repeat(56)));});
