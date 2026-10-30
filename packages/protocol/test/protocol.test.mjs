import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeSigner,sign} from '../../auth/test/fixtures.mjs';
import {canonicalizeRecoveryRequest, recoveryRequestDigest, requestSigningBytes} from '../src/request.ts';
import {verifyRecoveryRequest} from '../src/verify-request.ts';
import {RecoveryStorage} from '../../../apps/api/src/storage.mjs';

const now=1800000000;
async function fixture() {
  const sender=await makeSigner(), recipient=await makeSigner();
  const hash='b'.repeat(64);
  const request={version:1,domain:'https://reclaim.example',network:'testnet',transactionHash:hash,operationIndex:0,
    originalSender:sender.account,recipient:recipient.account,asset:{type:'native'},originalAmount:'12.3456789',
    requestedAmount:'12',returnDestination:sender.account,nonce:'1'.repeat(64),issuedAt:now-1,expiresAt:now+300};
  const lookup={network:'testnet',transaction:{hash,successful:true,ledger:1,operation_count:1,source_account:sender.account},
    operations:[{type:'payment',transaction_hash:hash,transaction_successful:true,from:sender.account,to:recipient.account,
      amount:'12.3456789',asset_type:'native'}]};
  return {request,lookup,sender,recipient};
}
async function withStore(fn) {
  const dir=mkdtempSync(join(tmpdir(),'sr-request-'));
  const store=new RecoveryStorage(join(dir,'data.sqlite'));
  try {await fn(store);} finally {store.close();rmSync(dir,{recursive:true,force:true});}
}
async function verify(store,request,lookup,signer,overrides={}) {
  const signature=await sign(signer.key,requestSigningBytes(request));
  return verifyRecoveryRequest({request,signature,lookup,domain:'https://reclaim.example',now,store,...overrides});
}

test('canonicalization preserves exact 7-decimal amounts and is stable', async () => {
  const {request}=await fixture();
  const one=canonicalizeRecoveryRequest(request);
  const two=canonicalizeRecoveryRequest(JSON.parse(one.json));
  assert.equal(two.json,one.json);
  assert.equal(await recoveryRequestDigest(request),await recoveryRequestDigest(JSON.parse(one.json)));
  assert.equal(one.request.originalAmount,'12.3456789');
});

test('reject invalid precision, missing issuer, extra fields, oversize, overclaim', async () => {
  const {request}=await fixture();
  for (const broken of [
    {...request,requestedAmount:'1.00000000'},
    {...request,asset:{type:'credit',code:'USD'}},
    {...request,extra:'inject'},
    {...request,domain:'https://reclaim.example/path'},
    {...request,nonce:'f'.repeat(3000)},
    {...request,requestedAmount:'13'}
  ]) assert.throws(()=>canonicalizeRecoveryRequest(broken));
});

test('valid request persists once; duplicate nonce or payment cannot be reused', async () => withStore(async store => {
  const {request,lookup,sender}=await fixture();
  const first=await verify(store,request,lookup,sender);
  assert.match(first.digest,/^[0-9a-f]{64}$/);
  await assert.rejects(verify(store,request,lookup,sender),{kind:'replayed'});
  await assert.rejects(verify(store,{...request,nonce:'2'.repeat(64)},lookup,sender),{kind:'replayed'});
}));

test('reject forged signature, unrelated ledger payment, cross-network and expired request', async () => withStore(async store => {
  const {request,lookup,sender,recipient}=await fixture();
  await assert.rejects(verify(store,request,lookup,recipient),{kind:'invalid'});
  const changed={...lookup,operations:[{...lookup.operations[0],from:recipient.account}]};
  await assert.rejects(verify(store,request,changed,sender),{kind:'ledger_mismatch'});
  await assert.rejects(verify(store,request,{...lookup,network:'public'},sender),{kind:'ledger_mismatch'});
  await assert.rejects(verify(store,request,lookup,sender,{now:request.expiresAt}),{kind:'invalid'});
  await assert.rejects(verify(store,request,lookup,sender,{domain:'https://evil.example'}),{kind:'invalid'});
}));

test('muxed original sender explicitly unsupported', async () => withStore(async store => {
  const {request,lookup,sender}=await fixture();
  const muxedRequest={...request,originalSender:sender.muxed};
  const muxedLookup={...lookup,operations:[{...lookup.operations[0],from_muxed:sender.muxed,from_muxed_id:'7'}]};
  await assert.rejects(verify(store,muxedRequest,muxedLookup,sender),{kind:'unsupported'});
}));


test('published canonical digest golden vector is stable', async () => {
  const account='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  const request={version:1,domain:'https://reclaim.example',network:'testnet',transactionHash:'a'.repeat(64),operationIndex:0,
    originalSender:account,recipient:account,asset:{type:'native'},originalAmount:'12.3456789',requestedAmount:'12',
    returnDestination:account,nonce:'1'.repeat(64),issuedAt:1800000000,expiresAt:1800000300};
  assert.equal(await recoveryRequestDigest(request),'47a0e835450499609864c3725f4f4833caf742a8280f11c21ab907b4addc61a5');
});
