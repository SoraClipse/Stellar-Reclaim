import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSigner,sign} from './fixtures.mjs';
import {challengeSigningBytes, issueWalletChallenge, verifyWalletChallenge} from '../src/challenge.ts';
import {RecoveryStorage} from '../../../apps/api/src/storage.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const now = 1800000000;
const domain = 'https://reclaim.example';
async function withStore(fn) {
  const dir=mkdtempSync(join(tmpdir(),'sr-challenge-'));
  const store=new RecoveryStorage(join(dir,'data.sqlite'));
  try {await fn(store);} finally {store.close(); rmSync(dir,{recursive:true,force:true});}
}

test('valid Stellar ownership signature consumes its challenge exactly once', async () => withStore(async store => {
  const user=await makeSigner();
  const ch=await issueWalletChallenge(store,{account:user.account,domain,network:'testnet',now});
  const signature=await sign(user.key,challengeSigningBytes(ch));
  assert.equal(await verifyWalletChallenge(store,ch,signature,{domain,network:'testnet',now}),true);
  assert.equal(await verifyWalletChallenge(store,ch,signature,{domain,network:'testnet',now}),false);
}));

test('forgery, unissued, expired, cross-domain and cross-network challenges fail closed', async () => withStore(async store => {
  const user=await makeSigner(), attacker=await makeSigner();
  const ch=await issueWalletChallenge(store,{account:user.account,domain,network:'testnet',now,ttlSeconds:20});
  const forged=await sign(attacker.key,challengeSigningBytes(ch));
  assert.equal(await verifyWalletChallenge(store,ch,forged,{domain,network:'testnet',now}),false);
  const signature=await sign(user.key,challengeSigningBytes(ch));
  await assert.rejects(verifyWalletChallenge(store,ch,signature,{domain:'https://evil.example',network:'testnet',now}));
  await assert.rejects(verifyWalletChallenge(store,ch,signature,{domain,network:'public',now}));
  await assert.rejects(verifyWalletChallenge(store,ch,signature,{domain,network:'testnet',now:now+20}));
  const unissued={...ch,nonce:'a'.repeat(64)};
  const unissuedSignature=await sign(user.key,challengeSigningBytes(unissued));
  assert.equal(await verifyWalletChallenge(store,unissued,unissuedSignature,{domain,network:'testnet',now}),false);
  assert.equal(await verifyWalletChallenge(store,ch,signature,{domain,network:'testnet',now}),true);
}));

test('muxed addresses verify underlying G account signature, not subaccount custody', async () => withStore(async store => {
  const user=await makeSigner();
  const ch=await issueWalletChallenge(store,{account:user.muxed,domain,network:'testnet',now});
  assert.equal(await verifyWalletChallenge(store,ch,await sign(user.key,challengeSigningBytes(ch)),{domain,network:'testnet',now}),true);
}));
