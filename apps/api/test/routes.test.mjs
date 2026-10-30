import {test} from 'node:test';import assert from 'node:assert/strict';
import {createRecoveryRouter} from '../src/router.ts';
import {RepositoryConflictError} from '../src/routes/requests.ts';
import {advanceRecovery} from '../../../packages/core/src/state-machine.ts';
const A='GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',B='GBQGQGB7PX6IMZJB2JJXO7DBKYQIDPJ62GCJK3WIC5OSEXPXWRSTSUCU',hash='a'.repeat(64);
let now=1000;
function fixture(){
 const records=new Map(),nonces=new Set();let offline=false,allowed=true;
 const payment={network:'testnet',transactionHash:hash,operationIndex:0,type:'payment',source:A,destination:B,amount:'10',stroops:'100000000',asset:{type:'native'}};
 const deps={
  authenticate:async(token,network)=>{if(token==='sender')return {account:A,network};if(token==='recipient')return {account:B,network};throw Error('bad wallet challenge');},
  verifySignedRequest:async(input,principal,p)=>input.signature==='valid-request'&&principal.account===p.source,
  verifyConsentSignature:async({principal,signature})=>principal.account===B&&signature==='valid-consent',
  rateLimit:async()=>allowed,ledger:()=>({lookup:async()=>{if(offline)throw Error('provider offline');return {network:'testnet',transaction:{hash,successful:true,ledger:12,operation_count:1,source_account:A},operations:[{type:'payment',transaction_hash:hash,transaction_successful:true,from:A,to:B,amount:'10',asset_type:'native'}]};}}),
  repository:{async create(r){if(records.has(r.state.id)||nonces.has(r.nonce))throw new RepositoryConflictError('Unique recovery reference or nonce');records.set(r.state.id,r);nonces.add(r.nonce);return r;},async get(id){return records.get(id)??null;},async listForRecipient(recipient,network){return [...records.values()].filter(r=>r.recipient===recipient&&r.network===network);},async transition(id,version,event){const r=records.get(id);if(!r||r.state.version!==version)throw Error('optimistic lock conflict');const next={...r,state:advanceRecovery(r.state,event)};records.set(id,next);return next;}},now:()=>now
 };
 const router=createRecoveryRouter(deps),call=async(path,token,body,method='POST')=>{
  const response=await router(new Request(`https://example.org${path}`,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{}) ,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:response.status,body:await response.json()};
 };
 const create={network:'testnet',transactionHash:hash,operationIndex:0,requestedStroops:'100000000',returnAddress:A,expiresAt:2000,nonce:'nonce-unique-012345',signature:'valid-request'};
 return {call,create,payment,records,setOffline:v=>offline=v,setAllowed:v=>allowed=v};
}
test('authenticated sender can look up and create verified request; recipient alone can consent',async()=>{
 const f=fixture();const lookup=await f.call('/v1/payments/lookup','sender',{network:'testnet',transactionHash:hash,operationIndex:0});assert.equal(lookup.status,200);
 const create=await f.call('/v1/recovery/requests','sender',f.create);assert.equal(create.status,201);
 assert.equal((await f.call('/v1/recovery/requests','sender',f.create)).status,409);
 const url='/v1/recovery/inbox?network=testnet';
 assert.equal((await f.call(url,'sender',null,'GET')).body.requests.length,0);
 assert.equal((await f.call(url,'recipient',null,'GET')).body.requests.length,1);
 const decision={network:'testnet',id:create.body.id,decision:'accept',nonce:'consent-unique-012345',signature:'valid-consent'};
 assert.equal((await f.call('/v1/recovery/consent','sender',decision)).status,404);
 const yes=await f.call('/v1/recovery/consent','recipient',decision);assert.equal(yes.status,200);assert.equal(yes.body.status,'accepted');assert.equal(yes.body.refundedStroops,'0');
 assert.equal((await f.call('/v1/recovery/consent','recipient',decision)).status,409);
});
test('spoofed wallet, cross-network, invalid signature, oversized claim and throttle are blocked',async()=>{
 const f=fixture();assert.equal((await f.call('/v1/payments/lookup','recipient',{network:'testnet',transactionHash:hash,operationIndex:0})).status,403);
 assert.equal((await f.call('/v1/payments/lookup','none',{network:'testnet',transactionHash:hash,operationIndex:0})).status,401);
 assert.equal((await f.call('/v1/recovery/requests','sender',{...f.create,signature:'fake'})).status,403);
 assert.equal((await f.call('/v1/recovery/requests','sender',{...f.create,requestedStroops:'999999999999'})).status,422);
 assert.equal((await f.call('/v1/recovery/requests','sender',{...f.create,network:'public'})).status,403);
 f.setAllowed(false);assert.equal((await f.call('/v1/payments/lookup','sender',{network:'testnet',transactionHash:hash,operationIndex:0})).status,429);
});
test('unavailable provider and expired decisions cannot be accepted',async()=>{
 const f=fixture();f.setOffline(true);assert.equal((await f.call('/v1/payments/lookup','sender',{network:'testnet',transactionHash:hash,operationIndex:0})).status,503);
 f.setOffline(false);const made=await f.call('/v1/recovery/requests','sender',f.create);assert.equal(made.status,201);
 now=2100;assert.equal((await f.call('/v1/recovery/consent','recipient',{network:'testnet',id:made.body.id,decision:'decline',nonce:'consent-unique-012345',signature:'valid-consent'})).status,410);now=1000;
});
