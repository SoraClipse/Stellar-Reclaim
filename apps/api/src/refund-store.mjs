/**
 * Atomic, issuer-safe voluntary refund accounting.
 * Never call apply() before independently verifying the actual finalized
 * Horizon operation with matchVoluntaryRefund().
 */
import {parseStroops} from '../../../packages/core/src/index.ts';

export class RefundStoreError extends Error {
 constructor(code){super(code);this.code=code;}
}
const HASH=/^[0-9a-f]{64}$/;
export class VerifiedRefundStore {
 constructor(db){
  this.db=db;
  db.exec(`CREATE TABLE IF NOT EXISTS verified_refunds (
    network TEXT NOT NULL CHECK(network IN ('testnet','public')),
    transaction_hash TEXT NOT NULL CHECK(length(transaction_hash)=64),
    operation_index INTEGER NOT NULL CHECK(operation_index>=0),
    request_digest TEXT NOT NULL REFERENCES recovery_requests(digest) ON DELETE RESTRICT,
    amount_stroops TEXT NOT NULL,
    verified_at INTEGER NOT NULL,
    PRIMARY KEY(network,transaction_hash,operation_index)
  );
  CREATE INDEX IF NOT EXISTS verified_refunds_request ON verified_refunds(request_digest);`);
  this.request=db.prepare('SELECT canonical_json FROM recovery_requests WHERE digest=?');
  this.decision=db.prepare('SELECT decision FROM recipient_decisions WHERE request_digest=?');
  this.refunds=db.prepare('SELECT amount_stroops,network,transaction_hash,operation_index FROM verified_refunds WHERE request_digest=? ORDER BY verified_at,transaction_hash,operation_index');
  this.insert=db.prepare('INSERT INTO verified_refunds(network,transaction_hash,operation_index,request_digest,amount_stroops,verified_at) VALUES(?,?,?,?,?,?)');
 }
 progress(digest){
  const stored=this.request.get(digest);
  if(!stored)throw new RefundStoreError('not_found');
  const request=JSON.parse(stored.canonical_json), decision=this.decision.get(digest)?.decision??null;
  const operations=this.refunds.all(digest);
  const paid=operations.reduce((acc,r)=>acc+BigInt(r.amount_stroops),0n);
  const cap=parseStroops(request.requestedAmount);
  if(paid>cap)throw new RefundStoreError('corrupt_settlement');
  return {network:request.network,transactionHash:request.transactionHash,operationIndex:request.operationIndex,
    status:paid===cap?'refunded':paid>0n?'partially_refunded':decision??'requested',
    refundedStroops:paid.toString(),requestedStroops:cap.toString(),
    refundedOperations:operations.map(x=>({network:x.network,transactionHash:x.transaction_hash,operationIndex:x.operation_index})),
    refundVerified:paid>0n};
 }
 apply({digest,refund,at}){
  if(!HASH.test(digest)||!Number.isSafeInteger(at)||at<0||!refund||
    !['testnet','public'].includes(refund.network)||!HASH.test(refund.transactionHash)||
    !Number.isSafeInteger(refund.operationIndex)||refund.operationIndex<0||
    !/^[1-9][0-9]*$/.test(refund.stroops))throw new RefundStoreError('invalid_refund');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const stored=this.request.get(digest);
   if(!stored)throw new RefundStoreError('not_found');
   const request=JSON.parse(stored.canonical_json);
   if(request.network!==refund.network)throw new RefundStoreError('wrong_network');
   if(this.decision.get(digest)?.decision!=='accept')throw new RefundStoreError('not_accepted');
   const cap=parseStroops(request.requestedAmount);
   const existing=this.refunds.all(digest).reduce((sum,r)=>sum+BigInt(r.amount_stroops),0n);
   if(BigInt(refund.stroops)+existing>cap)throw new RefundStoreError('overpayment');
   try{
    this.insert.run(refund.network,refund.transactionHash,refund.operationIndex,digest,refund.stroops,at);
   }catch(e){if(/UNIQUE constraint failed/.test(String(e?.message)))throw new RefundStoreError('duplicate_refund');throw e;}
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
  return this.progress(digest);
 }
}
