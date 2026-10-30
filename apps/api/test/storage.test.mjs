import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RecoveryStorage} from '../src/storage.mjs';

const request={network:'testnet',transactionHash:'a'.repeat(64),operationIndex:0,originalSender:'sender',recipient:'recipient',nonce:'b'.repeat(64),expiresAt:1800000200};
function temporary(fn) {
  const dir=mkdtempSync(join(tmpdir(),'sr-storage-'));
  try{return fn(join(dir,'storage.db'));}finally{rmSync(dir,{recursive:true,force:true});}
}

test('database survives a process-style close and reopen; nonce/references unique', () => temporary(file => {
  let a=new RecoveryStorage(file);
  assert.equal(a.recordVerifiedRequest(request,'c'.repeat(64),'signature'),true);
  a.close();
  a=new RecoveryStorage(file);
  assert.equal(a.recordVerifiedRequest(request,'c'.repeat(64),'signature'),false);
  assert.equal(a.recordVerifiedRequest({...request,transactionHash:'d'.repeat(64)},'e'.repeat(64),'signature'),false);
  assert.equal(a.recordVerifiedRequest({...request,nonce:'f'.repeat(64)},'e'.repeat(64),'signature'),false);
  assert.equal(a.db.prepare('SELECT COUNT(*) AS n FROM recovery_requests').get().n,1);
  a.close();
}));

test('atomic challenge redemption and signed consent/settlement receipts enforce uniques', () => temporary(file => {
  const a=new RecoveryStorage(file), b=new RecoveryStorage(file);
  const ch={network:'public',account:'payer',nonce:'a'.repeat(64),expiresAt:1800000200};
  a.issueChallenge(ch);
  assert.equal(b.consumeChallenge(ch,1800000000),true);
  assert.equal(a.consumeChallenge(ch,1800000000),false);
  assert.equal(a.recordVerifiedRequest(request,'c'.repeat(64),'signature'),true);
  assert.throws(()=>a.recordRecipientDecision({digest:'c'.repeat(64),recipient:'recipient',decision:'invalid',signature:'signed',signedAt:1800000000}));
  a.recordRecipientDecision({digest:'c'.repeat(64),recipient:'recipient',decision:'accept',signature:'signed',signedAt:1800000000});
  assert.throws(()=>b.recordRecipientDecision({digest:'c'.repeat(64),recipient:'recipient',decision:'decline',signature:'signed',signedAt:1800000000}));
  a.recordSettlementReceipt({digest:'c'.repeat(64),network:'testnet',transactionHash:'f'.repeat(64),operationIndex:0,amountStroops:'123',verifiedAt:1800000001});
  assert.throws(()=>b.recordSettlementReceipt({digest:'c'.repeat(64),network:'testnet',transactionHash:'f'.repeat(64),operationIndex:0,amountStroops:'123',verifiedAt:1800000001}));
  assert.throws(()=>a.recordSettlementReceipt({digest:'e'.repeat(64),network:'testnet',transactionHash:'d'.repeat(64),operationIndex:0,amountStroops:'123',verifiedAt:1800000001}));
  a.close();b.close();
}));

test('concurrent writer contention rolls back and retains committed state', () => temporary(file => {
  const a=new RecoveryStorage(file), b=new RecoveryStorage(file);
  a.db.exec('BEGIN IMMEDIATE');
  a.db.prepare('INSERT INTO wallet_challenges(network,account,nonce,canonical_json,expires_at) VALUES(?,?,?,?,?)').run('testnet','first','1'.repeat(64),'{}',1800001000);
  assert.throws(()=>b.issueChallenge({network:'testnet',account:'second',nonce:'2'.repeat(64),expiresAt:1800001000}));
  a.db.exec('COMMIT');
  assert.equal(b.db.prepare('SELECT COUNT(*) AS n FROM wallet_challenges').get().n,1);
  b.issueChallenge({network:'testnet',account:'second',nonce:'2'.repeat(64),expiresAt:1800001000});
  assert.equal(a.db.prepare('SELECT COUNT(*) AS n FROM wallet_challenges').get().n,2);
  a.close();b.close();
}));
