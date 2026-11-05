import {isDeepStrictEqual} from 'node:util';
import {normalizePayment} from '../../../packages/ledger/src/normalize.ts';

/**
 * Compare two independently configured Horizon clients before trusting an
 * operation as settlement evidence. Clients must use distinct, separately
 * administered providers; querying the same server twice is not a quorum.
 *
 * This cannot prove either provider is honest. A disagreement or timeout must
 * prevent settlement; callers MUST NOT fall back to the first provider.
 */
export class ProviderDisagreement extends Error {
  constructor(){super('Horizon providers did not independently agree');this.name='ProviderDisagreement';}
}
export async function corroboratePayment(primary,secondary,hash,index){
  if(!primary||!secondary||primary===secondary||typeof primary.lookup!=='function'||typeof secondary.lookup!=='function'){
    throw new TypeError('Two distinct ledger clients required');
  }
  // Both requests are allowed to fail. Never accept one result alone.
  const [a,b]=await Promise.all([primary.lookup(hash),secondary.lookup(hash)]);
  if(!a||!b||a.network!=='testnet'||b.network!=='testnet'||
    a.transaction?.hash!==hash||b.transaction?.hash!==hash||
    !a.transaction.successful||!b.transaction.successful||
    !Number.isSafeInteger(a.transaction.ledger)||a.transaction.ledger<=0||
    a.transaction.ledger!==b.transaction.ledger||
    a.transaction.operation_count!==b.transaction.operation_count||
    a.operations?.length!==b.operations?.length)throw new ProviderDisagreement();
  let first,second;
  try{
    first=normalizePayment(a,index);
    second=normalizePayment(b,index);
  }catch{throw new ProviderDisagreement();}
  if(!isDeepStrictEqual(first,second))throw new ProviderDisagreement();
  return first;
}
