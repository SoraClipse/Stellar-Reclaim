/**
 * Testnet-first, non-custodial API. This is deliberately not a mainnet-ready
 * service: it will not send payments or accept unverified "refund" claims.
 */
import {createHash, randomBytes} from 'node:crypto';
import {RecoveryStorage} from './storage.mjs';
import {throttle} from './middleware/abuse.ts';
import {assertDomain, issueWalletChallenge, verifyWalletChallenge, challengeSigningBytes} from '../../../packages/auth/src/challenge.ts';
import {verifyAccountSignature} from '../../../packages/auth/src/crypto.ts';
import {canonicalizeRecoveryRequest, requestSigningBytes} from '../../../packages/protocol/src/request.ts';
import {verifyRecoveryRequest, RequestVerificationError} from '../../../packages/protocol/src/verify-request.ts';
import {PASSPHRASE} from '../../../packages/core/src/index.ts';
import {normalizePayment} from '../../../packages/ledger/src/normalize.ts';
import {StellarLedgerClient, LedgerError} from '../../../packages/ledger/src/client.ts';

const HEX64=/^[0-9a-f]{64}$/;
const errors=(status,code)=>Object.assign(new Error(code),{status,code});
const response=(status,body)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
});
const sha256=s=>createHash('sha256').update(s).digest('hex');
function onlyObject(x){if(!x||typeof x!=='object'||Array.isArray(x))throw errors(400,'invalid_request');return x;}
async function json(request){
 if(Number(request.headers.get('content-length'))>8192)throw errors(413,'request_too_large');
 const body=await request.text();
 if(new TextEncoder().encode(body).length>8192)throw errors(413,'request_too_large');
 try{return onlyObject(JSON.parse(body));}catch{throw errors(400,'invalid_json');}
}
export function decisionSigningBytes({domain,network,digest,decision,nonce}){
 if(!HEX64.test(digest)||!HEX64.test(nonce)||!['accept','decline'].includes(decision)||!PASSPHRASE[network])throw errors(400,'invalid_decision');
 return new TextEncoder().encode('stellar-reclaim.recipient-consent.v1\n'+PASSPHRASE[network]+'\n'+JSON.stringify({domain,network,digest,decision,nonce}));
}
/** A durable DB is mandatory. Mocked ledger clients are only allowed via dependency injection in tests. */
export function createSecureService({dbPath,origin,network='testnet',ledgerFactory=n=>new StellarLedgerClient(n),now=()=>Math.floor(Date.now()/1000)}){
 if(!dbPath||dbPath===':memory:')throw new Error('RECLAIM_DB_PATH must be a durable SQLite file');
 assertDomain(origin);
 if(network!=='testnet')throw new Error('Only testnet is enabled until verified mainnet readiness');
 const db=new RecoveryStorage(dbPath);
 db.db.exec(`CREATE TABLE IF NOT EXISTS api_sessions(
   token_hash TEXT PRIMARY KEY CHECK(length(token_hash)=64),
   account TEXT NOT NULL, network TEXT NOT NULL CHECK(network IN ('testnet','public')),
   origin TEXT NOT NULL, expires_at INTEGER NOT NULL
 );CREATE INDEX IF NOT EXISTS api_sessions_expiry ON api_sessions(expires_at);`);
 const sessionStmt=db.db.prepare('SELECT account,network,origin FROM api_sessions WHERE token_hash=? AND expires_at>?');
 const receiptStmt=db.db.prepare(`SELECT r.digest,r.network,r.transaction_hash,r.operation_index,
   d.decision FROM recovery_requests r LEFT JOIN recipient_decisions d ON d.request_digest=r.digest
   WHERE r.digest=?`);
 const getRequest=db.db.prepare('SELECT digest,network,recipient,canonical_json,expires_at FROM recovery_requests WHERE digest=?');
 const listRequests=db.db.prepare(`SELECT r.digest,r.canonical_json,r.created_at,d.decision
  FROM recovery_requests r LEFT JOIN recipient_decisions d ON d.request_digest=r.digest
  WHERE r.recipient=? AND r.network=? ORDER BY r.created_at DESC LIMIT 100`);
 const limiter=(scope,identity,limit,window)=>throttle('secure:'+scope,identity,limit,window);
 const principal=request=>{
  const match=/^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization')??'');
  if(!match)throw errors(401,'authentication_required');
  const row=sessionStmt.get(sha256(match[1]),now());
  if(!row||row.network!==network||row.origin!==origin)throw errors(401,'authentication_expired');
  limiter('session',row.account,90,60000);
  return row.account;
 };
 const handle=async request=>{
  try {
   const url=new URL(request.url);
   if(request.headers.get('origin') && request.headers.get('origin')!==origin)throw errors(403,'wrong_origin');
   if(request.method==='GET'&&url.pathname==='/health')return response(200,{status:'ok',network,storage:'sqlite',refundVerification:false});
   if(request.method==='POST'&&url.pathname==='/v2/challenges'){
    const body=await json(request);
    if(body.network!==network)throw errors(403,'wrong_network');
    const account=body.account;
    limiter('challenge',String(account),6,60000);
    const challenge=await issueWalletChallenge(db,{domain:origin,network,account,now:now()});
    const message=new TextDecoder().decode(challengeSigningBytes(challenge));
    return response(200,{challenge,message});
   }
   if(request.method==='POST'&&url.pathname==='/v2/auth'){
    const body=await json(request);
    const challenge=onlyObject(body.challenge);
    if(challenge.network!==network)throw errors(403,'wrong_network');
    limiter('auth',String(challenge.account),10,60000);
    let valid=false;
    try{valid=await verifyWalletChallenge(db,challenge,body.signature,{domain:origin,network,now:now()});}
    catch{throw errors(401,'invalid_signature_or_replay');}
    if(!valid)throw errors(401,'invalid_signature_or_replay');
    const token=randomBytes(32).toString('hex');
    db.db.prepare('INSERT INTO api_sessions(token_hash,account,network,origin,expires_at) VALUES(?,?,?,?,?)')
     .run(sha256(token),challenge.account,network,origin,now()+900);
    return response(200,{token,tokenType:'Bearer',expiresIn:900,network});
   }
   if(request.method==='POST'&&url.pathname==='/v2/requests'){
    const account=principal(request),body=await json(request);
    const signed=canonicalizeRecoveryRequest(body.request).request;
    if(signed.network!==network)throw errors(403,'wrong_network');
    if(signed.originalSender!==account)throw errors(403,'not_original_sender');
    limiter('request',account,12,3600000);
    const lookup=await ledgerFactory(network).lookup(signed.transactionHash);
    // Until the path-payment debit/credit identity has independent verification,
    // only direct classic payments are eligible for recovery requests.
    const payment=normalizePayment(lookup,signed.operationIndex);
    if(payment.type!=='payment')throw errors(422,'unsupported_payment_type');
    const saved=await verifyRecoveryRequest({request:signed,signature:body.signature,lookup,domain:origin,now:now(),store:db});
    return response(201,{digest:saved.digest,status:'requested',refundVerified:false});
   }
   if(request.method==='GET'&&url.pathname==='/v2/inbox'){
    const account=principal(request);
    limiter('inbox',account,30,60000);
    const rows=listRequests.all(account,network);
    const requests=rows.map(row=>{
      const r=JSON.parse(row.canonical_json);
      return {digest:row.digest,network:r.network,transactionHash:r.transactionHash,operationIndex:r.operationIndex,requestedAmount:r.requestedAmount,asset:r.asset,
        status:row.decision??(now()>=r.expiresAt?'expired':'requested'),expiresAt:r.expiresAt};
    });
    return response(200,{requests});
   }
   if(request.method==='POST'&&url.pathname==='/v2/decisions'){
    const account=principal(request),body=await json(request);
    const {digest,decision,nonce,signature}=body;
    if(typeof digest!=='string'||!HEX64.test(digest))throw errors(400,'invalid_digest');
    const row=getRequest.get(digest);
    if(!row||row.recipient!==account||row.network!==network)throw errors(404,'not_found');
    if(row.expires_at<=now())throw errors(410,'request_expired');
    limiter('decision',account,20,60000);
    const bytes=decisionSigningBytes({domain:origin,network,digest,decision,nonce});
    if(!await verifyAccountSignature(account,signature,bytes))throw errors(401,'invalid_decision_signature');
    try{db.recordRecipientDecision({digest,recipient:account,decision,signature,signedAt:now()});}
    catch(e){if(/UNIQUE constraint failed/.test(String(e?.message)))throw errors(409,'decision_already_recorded');throw e;}
    return response(200,{digest,status:decision,requiresSeparatePayment:true,refundVerified:false});
   }
   const receipt=/^\/v2\/receipts\/([0-9a-f]{64})$/.exec(url.pathname);
   if(request.method==='GET'&&receipt){
    const row=receiptStmt.get(receipt[1]);
    if(!row)throw errors(404,'not_found');
    return response(200,{digest:row.digest,network:row.network,transactionHash:row.transaction_hash,operationIndex:row.operation_index,
      status:row.decision??'requested',refundVerified:false,note:'Consent is not payment. A separate independently verified Stellar transaction is required.'});
   }
   throw errors(404,'not_found');
  } catch(e) {
   if(e?.status)return response(e.status,{error:e.code});
   if(e instanceof RequestVerificationError){
    const code=e.kind;return response(code==='replayed'?409:code==='unsupported'?422:code==='ledger_mismatch'?422:403,{error:code});
   }
   if(e instanceof LedgerError)return response(e.kind==='unavailable'?503:e.kind==='not_found'?404:422,{error:'ledger_'+e.kind});
   if(e instanceof TypeError||e instanceof RangeError)return response(400,{error:'invalid_input'});
   // Do not leak wallet identities, private notes, signatures, stack traces or database paths.
   return response(503,{error:'service_unavailable'});
  }
 };
 return {handle,close:()=>db.close(),storage:db};
}
