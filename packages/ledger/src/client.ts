import { assertTransactionHash, PASSPHRASE, type Network } from '../../core/src/index.ts';
export type Transaction = {hash:string; successful:boolean; ledger:number; operation_count:number; source_account:string};
export type HorizonOperation = Record<string, unknown>;
export type Lookup = {network:Network; transaction:Transaction; operations:HorizonOperation[]};
export type LookupStatus = 'not_found'|'pending'|'failed'|'malformed'|'unavailable'|'network_mismatch'|'unsupported';
export class LedgerError extends Error {
 readonly kind: LookupStatus;
 constructor(kind: LookupStatus, message: string) {super(message); this.name='LedgerError'; this.kind=kind;}
}
export type FetchLike = (url: string, options: RequestInit) => Promise<Response>;
const ORIGINS: Record<Network,string> = {testnet:'https://horizon-testnet.stellar.org', public:'https://horizon.stellar.org'};
const MAX_BYTES=256*1024;
const MAX_OPERATIONS=100;

function isRecord(x: unknown): x is Record<string,unknown> {return !!x && typeof x==='object' && !Array.isArray(x);}
function requireTransaction(x: unknown, hash: string): Transaction {
 if (!isRecord(x) || x.hash !== hash || typeof x.successful !== 'boolean' || !Number.isSafeInteger(x.ledger) || Number(x.ledger)<=0 || !Number.isSafeInteger(x.operation_count) || Number(x.operation_count)<1 || Number(x.operation_count)>MAX_OPERATIONS || typeof x.source_account !== 'string') throw new LedgerError('malformed','Malformed/incomplete Horizon transaction');
 return {hash, successful:x.successful, ledger:x.ledger as number, operation_count:x.operation_count as number, source_account:x.source_account};
}
export class StellarLedgerClient {
 private readonly origin:string;
 readonly network: Network;
 private readonly transport: FetchLike;
 private readonly attempts: number;
 private readonly timeoutMs: number;
 constructor(network: Network, transport:FetchLike=fetch, attempts=2, timeoutMs=7000, origin?:string) {
  this.network=network;this.transport=transport;this.attempts=attempts;this.timeoutMs=timeoutMs;
  if (!(network in ORIGINS)) throw new TypeError('Explicit Stellar network required');
  if (!Number.isInteger(attempts)||attempts<1||attempts>3) throw new RangeError('Attempts must be 1..3');
  if (!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>20000) throw new RangeError('Timeout must be 100..20000ms');
  if(origin && !/^https:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new TypeError('Custom base allowed only on local test endpoint');
  this.origin=origin||ORIGINS[network];
 }
 private async read(path:string):Promise<unknown> {
  // Callers cannot supply arbitrary URL. No redirects or cross-origin fetches.
  if(!path.startsWith('/') || path.startsWith('//') || path.includes('..')) throw new LedgerError('malformed','Invalid Horizon path');
  const url=this.origin+path;
  for(let attempt=0;attempt<this.attempts;attempt++) {
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
   try {
    const response=await this.transport(url,{signal:controller.signal,redirect:'error',headers:{Accept:'application/json'}});
    if(response.status===404) throw new LedgerError('not_found','No finalized transaction found');
    if(response.status===202) throw new LedgerError('pending','Transaction still pending');
    if(response.status===429 || response.status>=500) throw new LedgerError('unavailable',`Upstream ${response.status}`);
    if(response.status!==200) throw new LedgerError('malformed',`Unexpected Horizon ${response.status}`);
    if(response.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json') throw new LedgerError('malformed','Expected JSON response');
    const len=Number(response.headers.get('content-length'));if(Number.isFinite(len)&&len>MAX_BYTES) throw new LedgerError('malformed','Response exceeds limit');
    if(!response.body) throw new LedgerError('malformed','No response body');
    const reader=response.body.getReader();let bytes=0;const parts:Uint8Array[]=[];
    try {
     while(true){const {done,value}=await reader.read();if(done)break;if(value){bytes+=value.byteLength;if(bytes>MAX_BYTES) throw new LedgerError('malformed','Response exceeds limit');parts.push(value);}}
    } finally {await reader.cancel().catch(()=>{});}
    const all=new Uint8Array(bytes);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.length;}
    try {return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}
    catch {throw new LedgerError('malformed','Invalid JSON');}
   } catch(e) {
    const error=e instanceof LedgerError?e:new LedgerError('unavailable','Network error or timeout');
    if(error.kind==='unavailable' && attempt+1<this.attempts) continue;
    throw error;
   } finally {clearTimeout(timer);}
  }
  throw new LedgerError('unavailable','Upstream unavailable');
 }
 async lookup(hashInput:string):Promise<Lookup> {
  const hash=assertTransactionHash(hashInput);
  const root=await this.read('/');
  if(!isRecord(root) || typeof root.network_passphrase!=='string') throw new LedgerError('malformed','Invalid Horizon network metadata');
  if(root.network_passphrase!==PASSPHRASE[this.network]) throw new LedgerError('network_mismatch','Horizon passphrase does not match selected network');
  const transaction=requireTransaction(await this.read(`/transactions/${hash}`),hash);
  if(!transaction.successful) throw new LedgerError('failed','Transaction failed; no payment completed');
  const operations: HorizonOperation[]=[];
  let cursor='';
  // Hard bound: max 100 operations plus at most 2 pages. Cursor is taken only from record paging token, never arbitrary external _links.next.
  for(let page=0;page<2;page++) {
   const p=await this.read(`/transactions/${hash}/operations?limit=100${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);
   if(!isRecord(p)||!isRecord(p._embedded)||!Array.isArray(p._embedded.records)) throw new LedgerError('malformed','Missing operations records');
   const rec=p._embedded.records;
   if(rec.length===0 && operations.length<transaction.operation_count) throw new LedgerError('malformed','Incomplete operations page');
   for(const op of rec){
    if(!isRecord(op)||op.transaction_hash!==hash||op.transaction_successful!==true||typeof op.paging_token!=='string'|| !/^\d+$/.test(op.paging_token)) throw new LedgerError('malformed','Inconsistent operation');
    operations.push(op);if(operations.length>MAX_OPERATIONS) throw new LedgerError('malformed','Too many operations');
   }
   if(operations.length>=transaction.operation_count)break;
   const last=rec.at(-1) as Record<string,unknown>|undefined;
   if(!last||last.paging_token===cursor) throw new LedgerError('malformed','Unusable operation cursor');
   cursor=last.paging_token as string;
  }
  if(operations.length!==transaction.operation_count) throw new LedgerError('malformed','Operation count mismatch');
  return {network:this.network,transaction,operations};
 }
}
