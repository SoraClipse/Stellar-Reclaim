import {assertAccount,assertTransactionHash,decodeAccount,formatStroops,parseStroops,type Network} from '../../core/src/index.ts';
import {LedgerError,type Lookup} from './client.ts';
export type Asset = {type:'native'} | {type:'credit';code:string;issuer:string};
export type Payment = {network:Network;transactionHash:string;operationIndex:number;type:'payment'|'path_payment_strict_send'|'path_payment_strict_receive';source:string;destination:string;amount:string;stroops:string;asset:Asset;sendAmount?:string;sendAsset?:Asset};
function field(row:Record<string,unknown>,name:string):string {const x=row[name];if(typeof x!=='string'||x.length===0)throw new LedgerError('malformed',`Missing ${name}`);return x;}
function asset(op:Record<string,unknown>,prefix=''):Asset{
 const type=field(op,prefix+'asset_type');
 if(type==='native')return {type:'native'};
 if(type!=='credit_alphanum4'&&type!=='credit_alphanum12')throw new LedgerError('unsupported','Unsupported payment asset type');
 const code=field(op,prefix+'asset_code'),issuer=field(op,prefix+'asset_issuer');
 if(!/^[A-Za-z0-9]{1,12}$/.test(code)||code.length>(type==='credit_alphanum4'?4:12)||(type==='credit_alphanum12'&&code.length<=4)) throw new LedgerError('malformed','Invalid asset code');
 try{assertAccount(issuer);}catch{throw new LedgerError('malformed','Invalid asset issuer');}
 return {type:'credit',code,issuer};
}
export function normalizePayment(lookup:Lookup, operationIndex:number):Payment{
 if(!Number.isSafeInteger(operationIndex)||operationIndex<0||operationIndex>=lookup.operations.length)throw new LedgerError('malformed','Operation index out of bounds');
 const op=lookup.operations[operationIndex]!;
 const type=field(op,'type');
 if(type!=='payment'&&type!=='path_payment_strict_receive'&&type!=='path_payment_strict_send') throw new LedgerError('unsupported',`Unsupported operation ${type}`);
 const hash=assertTransactionHash(lookup.transaction.hash);
 if(op.transaction_hash!==hash||op.transaction_successful!==true)throw new LedgerError('malformed','Mismatched or failed operation');
 const classicSource=field(op,'from'),classicDestination=field(op,'to');
 const source=typeof op.from_muxed==='string'?op.from_muxed:(typeof op.source_account_muxed==='string'?op.source_account_muxed:classicSource);
 const destination=typeof op.to_muxed==='string'?op.to_muxed:classicDestination;
 try {
  const src=decodeAccount(source),dst=decodeAccount(destination);
  if(src.base!==classicSource||dst.base!==classicDestination)throw Error('Muxed address does not match base account');
  if(op.to_muxed_id!==undefined && (!dst.muxed || String(op.to_muxed_id)!==dst.id))throw Error('Muxed destination ID mismatch');
  if(op.source_account_muxed_id!==undefined && (!src.muxed || String(op.source_account_muxed_id)!==src.id))throw Error('Muxed source ID mismatch');
  if(op.from_muxed_id!==undefined && (!src.muxed || String(op.from_muxed_id)!==src.id))throw Error('Muxed source ID mismatch');
 }catch {throw new LedgerError('malformed','Invalid or mismatched payment account/muxed identity');}

 const precise=field(op,'amount');let stroops:bigint;
 try{stroops=parseStroops(precise);}catch{throw new LedgerError('malformed','Invalid payment amount');}
 const result:Payment={network:lookup.network,transactionHash:hash,operationIndex,type,source,destination,amount:formatStroops(stroops),stroops:stroops.toString(),asset:asset(op)};
 if(type!=='payment') {
  // Path payments deliver amount/asset, and debit source_amount/source_asset.
  const debit=field(op,'source_amount');let d:bigint;
  try{d=parseStroops(debit);}catch{throw new LedgerError('malformed','Invalid source amount');}
  result.sendAmount=formatStroops(d);result.sendAsset=asset(op,'source_');
 }
 return result;
}
