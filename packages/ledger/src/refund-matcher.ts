import {assertAccount} from '../../core/src/index.ts';
import type {RecoveryState} from '../../core/src/state-machine.ts';
import type {Payment,Asset} from './normalize.ts';
/** Only finalized operations returned by the trusted ledger adapter may enter this matcher. */
export type VerifiedRefund={operationKey:string;amountStroops:string};
export class RefundMatchError extends Error {
  readonly code:'mismatch'|'invalid'|'not_accepted';
  constructor(code:'mismatch'|'invalid'|'not_accepted',message:string){super(message);this.name='RefundMatchError';this.code=code;}
}
const MAX=9223372036854775807n;
function num(n:string):bigint{if(typeof n!=='string'||!/^[1-9][0-9]*$/.test(n)||BigInt(n)>MAX)throw new RefundMatchError('invalid','Invalid stroop amount');return BigInt(n);}
function sameAsset(a:Asset,b:Asset){return a.type===b.type&&(a.type==='native'||(b.type==='credit'&&a.code===b.code&&a.issuer===b.issuer));}
export function matchVoluntaryRefund(original:Payment,refund:Payment,returnAddress:string):VerifiedRefund{
  try{assertAccount(returnAddress);}catch{throw new RefundMatchError('invalid','Invalid return destination');}
  if(refund.type!=='payment'||original.network!==refund.network||original.source!==returnAddress||refund.source!==original.destination||refund.destination!==returnAddress||!sameAsset(original.asset,refund.asset))throw new RefundMatchError('mismatch','Refund operation does not match verified original payment');
  num(original.stroops);num(refund.stroops);
  if(!/^[0-9a-f]{64}$/.test(refund.transactionHash)||!Number.isSafeInteger(refund.operationIndex)||refund.operationIndex<0)throw new RefundMatchError('invalid','Invalid refund operation identity');
  if(original.transactionHash===refund.transactionHash && original.operationIndex===refund.operationIndex)throw new RefundMatchError('mismatch','Original payment cannot refund itself');
  return {operationKey:`${refund.network}:${refund.transactionHash}:${refund.operationIndex}`,amountStroops:refund.stroops};
}
/** Store MUST commit operation ownership, amount cap and state transition in one durable transaction. */
export interface RefundSettlementStore {
  applyVerifiedRefund(requestId:string,operationKey:string,amountStroops:string,at:number):Promise<RecoveryState>;
}
export async function reconcileVoluntaryRefund(args:{requestId:string;state:RecoveryState;original:Payment;refund:Payment;returnAddress:string;settlementStore:RefundSettlementStore;at:number}):Promise<RecoveryState>{
  if(args.state.id!==args.requestId||!['accepted','partially_refunded','refund_submitted'].includes(args.state.status))throw new RefundMatchError('not_accepted','Recipient acceptance required; acceptance alone is not settlement');
  const verified=matchVoluntaryRefund(args.original,args.refund,args.returnAddress);
  if(num(verified.amountStroops)>num(args.state.amountStroops))throw new RefundMatchError('invalid','Refund exceeds requested amount');
  // Crucially, deduplication across requests belongs inside the transaction, NOT an in-memory Set here.
  return args.settlementStore.applyVerifiedRefund(args.requestId,verified.operationKey,verified.amountStroops,args.at);
}
