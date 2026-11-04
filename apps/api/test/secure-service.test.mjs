import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSecureService,decisionSigningBytes} from '../src/secure-service.mjs';
import {requestSigningBytes} from '../../../packages/protocol/src/request.ts';

function stellarAccount(publicKey){
 const key=publicKey.export({format:'der',type:'spki'}).subarray(-32), data=Buffer.concat([Buffer.from([48]),key]);
 let crc=0;for(const byte of data){crc^=byte<<8;for(let k=0;k<8;k++)crc=crc&32768?((crc<<1)^4129)&65535:(crc<<1)&65535;}
 const bytes=Buffer.concat([data,Buffer.from([crc&255,crc>>8])]);
 let bits=0,value=0,out='';const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
 for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;out+=abc[(value>>>bits)&31];}}
 if(bits)out+=abc[(value<<(5-bits))&31];
 return out;
}
const who=()=>{const {publicKey,privateKey}=generateKeyPairSync('ed25519');return {account:stellarAccount(publicKey),privateKey};};
const sender=who(),recipient=who(),outsider=who(),origin='http://127.0.0.1:8787',hash='a'.repeat(64);
const original={network:'testnet',transaction:{hash,successful:true,ledger:5,operation_count:1,source_account:sender.account},
 operations:[{type:'payment',transaction_hash:hash,transaction_successful:true,from:sender.account,to:recipient.account,amount:'10',asset_type:'native'}]};
let time=1770000000;
const payload=()=>({
 version:1,domain:origin,network:'testnet',transactionHash:hash,operationIndex:0,originalSender:sender.account,recipient:recipient.account,
 asset:{type:'native'},originalAmount:'10',requestedAmount:'4',returnDestination:sender.account,
 nonce:'b'.repeat(64),issuedAt:time,expiresAt:time+3600
});
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'reclaim-service-'));
 const path=join(dir,'api.sqlite');
 const start=()=>createSecureService({dbPath:path,origin,now:()=>time,ledgerFactory:()=>({lookup:async h=>{if(h!==hash)throw Error('not_found');return original;}})});
 return {start,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
async function call(s,method,path,body,token){
 const res=await s.handle(new Request(origin+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}));
 return {status:res.status,data:await res.json()};
}
async function login(s,actor){
 const issued=await call(s,'POST','/v2/challenges',{network:'testnet',account:actor.account});
 assert.equal(issued.status,200,JSON.stringify(issued.data));
 const sig=sign(null,Buffer.from(issued.data.message),actor.privateKey).toString('base64');
 const auth=await call(s,'POST','/v2/auth',{challenge:issued.data.challenge,signature:sig});
 assert.equal(auth.status,200,JSON.stringify(auth.data));
 assert.match(auth.data.token,/^[0-9a-f]{64}$/);
 return {token:auth.data.token,challenge:issued.data.challenge,signature:sig};
}
test('durable sender request, authenticated recipient consent, replay defense and redacted receipt',async()=>{
 const f=fixture();try{
  let s=f.start(),from=await login(s,sender),to=await login(s,recipient),stranger=await login(s,outsider);
  assert.equal((await call(s,'POST','/v2/auth',{challenge:from.challenge,signature:from.signature})).status,401);
  const request=payload(),signature=sign(null,Buffer.from(requestSigningBytes(request)),sender.privateKey).toString('base64');
  const denied=await call(s,'POST','/v2/requests',{request,signature},stranger.token);
  assert.equal(denied.status,403);
  const made=await call(s,'POST','/v2/requests',{request,signature},from.token);
  assert.equal(made.status,201,JSON.stringify(made.data));
  const digest=made.data.digest;assert.match(digest,/^[0-9a-f]{64}$/);
  assert.equal((await call(s,'POST','/v2/requests',{request,signature},from.token)).status,409);
  assert.equal((await call(s,'GET','/v2/inbox',null,from.token)).data.requests.length,0);
  const inbox=await call(s,'GET','/v2/inbox',null,to.token);
  assert.equal(inbox.data.requests.length,1);
  assert.equal(inbox.data.requests[0].digest,digest);
  assert.equal((await call(s,'POST','/v2/decisions',{digest,decision:'accept',nonce:'c'.repeat(64),signature:'bad'},to.token)).status,400);
  const decision={digest,decision:'accept',nonce:'c'.repeat(64)};
  const signed=sign(null,Buffer.from(decisionSigningBytes({domain:origin,network:'testnet',...decision})),recipient.privateKey).toString('base64');
  assert.equal((await call(s,'POST','/v2/decisions',{...decision,signature:signed},from.token)).status,404);
  const accepted=await call(s,'POST','/v2/decisions',{...decision,signature:signed},to.token);
  assert.equal(accepted.status,200,JSON.stringify(accepted.data));
  assert.equal(accepted.data.refundVerified,false);
  assert.equal((await call(s,'POST','/v2/decisions',{...decision,signature:signed},to.token)).status,409);
  s.close();
  s=f.start();
  const receipt=await call(s,'GET','/v2/receipts/'+digest);
  assert.equal(receipt.status,200);
  assert.equal(receipt.data.status,'accept');
  assert.equal(receipt.data.refundVerified,false);
  assert.doesNotMatch(JSON.stringify(receipt.data),new RegExp(sender.account+'|'+recipient.account));
  assert.equal((await call(s,'GET','/v2/inbox',null,to.token)).data.requests.length,1,'sessions and inbox survive process restart');
  s.close();
 }finally{f.cleanup();}
});
test('domain and network-bound authentication is rejected across environments',async()=>{
 const f=fixture();try{
  const s=f.start();
  assert.equal((await call(s,'POST','/v2/challenges',{network:'public',account:sender.account})).status,403);
  assert.equal((await call(s,'POST','/v2/challenges',{network:'testnet',account:'bad'})).status,400);
  const issued=await call(s,'POST','/v2/challenges',{network:'testnet',account:sender.account});
  const sig=sign(null,Buffer.from(issued.data.message),outsider.privateKey).toString('base64');
  const r=await call(s,'POST','/v2/auth',{challenge:issued.data.challenge,signature:sig});
  assert.equal(r.status,401);
  const badOrigin=await s.handle(new Request(origin+'/v2/challenges',{method:'POST',headers:{origin:'https://malicious.example','content-type':'application/json'},body:JSON.stringify({account:sender.account,network:'testnet'})}));
  assert.equal(badOrigin.status,403);
  assert.throws(()=>createSecureService({dbPath:':memory:',origin}),/durable SQLite/);
  assert.throws(()=>createSecureService({dbPath:join(tmpdir(),'invalid.db'),origin,network:'public'}),/Only testnet/);
  s.close();
 }finally{f.cleanup();}
});
test('signed recovery request cannot be silently tampered or signed by a different account',async()=>{
 const f=fixture();try{
  const s=f.start(),loginSender=await login(s,sender);
  const req=payload();
  const sig=sign(null,Buffer.from(requestSigningBytes(req)),outsider.privateKey).toString('base64');
  assert.equal((await call(s,'POST','/v2/requests',{request:req,signature:sig},loginSender.token)).status,403);
  assert.equal((await call(s,'POST','/v2/requests',{request:{...req,network:'public'},signature:sig},loginSender.token)).status,403);
  assert.equal((await call(s,'GET','/v2/receipts/'+'f'.repeat(64))).status,404);
  s.close();
 }finally{f.cleanup();}
});
