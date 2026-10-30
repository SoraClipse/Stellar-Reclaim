import {assertAccount,assertTransactionHash,type Network} from '../../../../packages/core/src/index.ts';
import {initialRecovery,type RecoveryState,type RecoveryEvent} from '../../../../packages/core/src/state-machine.ts';
import {StellarLedgerClient,LedgerError} from '../../../../packages/ledger/src/client.ts';
import {normalizePayment,type Payment} from '../../../../packages/ledger/src/normalize.ts';

export class ApiError extends Error {
  readonly code:string;readonly status:number;
  constructor(code:string,status:number,message:string){super(message);this.name='ApiError';this.code=code;this.status=status;}
}
export class RepositoryConflictError extends Error {
  constructor(message='Duplicate or concurrent recovery request'){super(message);this.name='RepositoryConflictError';}
}
export type Principal={account:string;network:Network};
export type SignedRequest={network:Network;transactionHash:string;operationIndex:number;requestedStroops:string;returnAddress:string;expiresAt:number;nonce:string;signature:string};
export type RecoveryRecord={state:RecoveryState;network:Network;original:Payment;recipient:string;sender:string;returnAddress:string;nonce:string};
/** Implementations must enforce unique (network,hash,index) and signed nonce, and atomic versioned transitions. */
export interface RecoveryRepository {
  create(record:RecoveryRecord):Promise<RecoveryRecord>;
  get(id:string):Promise<RecoveryRecord|null>;
  listForRecipient(recipient:string,network:Network):Promise<RecoveryRecord[]>;
  transition(id:string,expectedVersion:number,event:RecoveryEvent):Promise<RecoveryRecord>;
}
/** Authentication and signature verification are mandatory injected security gates, not user assertions. */
export interface RecoveryDependencies {
  authenticate(token:string,network:Network):Promise<Principal>;
  verifySignedRequest(payload:SignedRequest,principal:Principal,payment:Payment):Promise<boolean>;
  verifyConsentSignature(input:{record:RecoveryRecord;principal:Principal;decision:'accept'|'decline';nonce:string;signature:string}):Promise<boolean>;
  rateLimit(scope:string,principal:Principal):Promise<boolean>;
  ledger(network:Network):Pick<StellarLedgerClient,'lookup'>;
  repository:RecoveryRepository;
  now():number;
}
export const apiJson=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export function apiFailure(error:unknown):Response{
  if(error instanceof ApiError)return apiJson({error:{code:error.code,message:error.message}},error.status);
  if(error instanceof RepositoryConflictError)return apiJson({error:{code:'conflict',message:error.message}},409);
  if(error instanceof TypeError || error instanceof RangeError)return apiJson({error:{code:'invalid_payload',message:error.message}},400);
  if(error instanceof LedgerError){const status=error.kind==='unavailable'?503:error.kind==='not_found'?404:error.kind==='pending'?409:error.kind==='failed'?422:400;return apiJson({error:{code:error.kind,message:error.message}},status);}
  return apiJson({error:{code:'internal_error',message:'Request could not be completed'}},503);
}
export async function readJson(request:Request):Promise<Record<string,unknown>>{
  const size=Number(request.headers.get('content-length'));
  if(Number.isFinite(size)&&size>8192)throw new ApiError('invalid_payload',413,'Payload too large');
  let raw:string;
  try {raw=await request.text();} catch {throw new ApiError('invalid_payload',400,'Invalid request body');}
  if(raw.length>8192)throw new ApiError('invalid_payload',413,'Payload too large');
  try {const parsed:unknown=JSON.parse(raw);if(parsed===null||typeof parsed!=='object'||Array.isArray(parsed))throw Error();return parsed as Record<string,unknown>;}catch{throw new ApiError('invalid_payload',400,'Expected JSON object');}
}
export function requireNetwork(value:unknown):Network {if(value!=='testnet'&&value!=='public')throw new ApiError('invalid_network',400,'Explicit Stellar network required');return value;}
function requireString(value:unknown,label:string,max=256):string{if(typeof value!=='string'||value.length===0||value.length>max)throw new ApiError('invalid_payload',400,`Invalid ${label}`);return value;}
export async function getPrincipal(req:Request,network:Network,deps:RecoveryDependencies):Promise<Principal>{
  const auth=req.headers.get('authorization');
  if(!auth?.startsWith('Bearer ')||auth.length>4096)throw new ApiError('unauthorized',401,'Wallet proof required');
  let principal:Principal;
  try{principal=await deps.authenticate(auth.slice(7),network);}catch{throw new ApiError('unauthorized',401,'Invalid or expired wallet proof');}
  if(principal.network!==network)throw new ApiError('forbidden',403,'Network mismatch');
  try{assertAccount(principal.account);}catch{throw new ApiError('forbidden',403,'Unsupported wallet identity');}
  return principal;
}
export async function enforceLimit(deps:RecoveryDependencies,principal:Principal,scope:string):Promise<void>{
  if(!await deps.rateLimit(scope,principal))throw new ApiError('rate_limited',429,'Too many requests');
}
async function verifiedPayment(network:Network,hash:string,index:number,deps:RecoveryDependencies):Promise<Payment>{
  const lookup=await deps.ledger(network).lookup(hash);
  if(lookup.network!==network)throw new ApiError('network_mismatch',403,'Ledger response network mismatch');
  return normalizePayment(lookup,index);
}
function requireSender(principal:Principal,payment:Payment):void{
  // Exact G/M identity is mandatory until a delegated or muxed-authority protocol is specified.
  if(principal.account!==payment.source)throw new ApiError('forbidden',403,'Wallet does not own payment source');
}
export async function handleLookup(req:Request,deps:RecoveryDependencies):Promise<Response>{
  try{
    const input=await readJson(req),network=requireNetwork(input.network),principal=await getPrincipal(req,network,deps);
    await enforceLimit(deps,principal,'lookup');
    const hash=assertTransactionHash(requireString(input.transactionHash,'transactionHash',64));
    if(!Number.isSafeInteger(input.operationIndex)||(input.operationIndex as number)<0)throw new ApiError('invalid_operation',400,'Invalid operation index');
    const payment=await verifiedPayment(network,hash,input.operationIndex as number,deps);requireSender(principal,payment);
    return apiJson({payment});
  }catch(e){return apiFailure(e);}
}
export async function handleCreate(req:Request,deps:RecoveryDependencies):Promise<Response>{
  try{
    const input=await readJson(req),network=requireNetwork(input.network),principal=await getPrincipal(req,network,deps);
    await enforceLimit(deps,principal,'create');
    const transactionHash=assertTransactionHash(requireString(input.transactionHash,'transactionHash',64));
    if(!Number.isSafeInteger(input.operationIndex)||(input.operationIndex as number)<0)throw new ApiError('invalid_operation',400,'Invalid operation index');
    const operationIndex=input.operationIndex as number;
    const requestedStroops=requireString(input.requestedStroops,'requestedStroops',32);
    const returnAddress=requireString(input.returnAddress,'returnAddress',69);
    const nonce=requireString(input.nonce,'nonce',128),signature=requireString(input.signature,'signature',1024);
    const expiresAt=input.expiresAt as number,now=deps.now();
    if(!Number.isSafeInteger(now)||!Number.isSafeInteger(expiresAt)||expiresAt<=now||expiresAt>now+30*24*60*60*1000)throw new ApiError('expired',400,'Invalid expiry');
    if(!/^[A-Za-z0-9_-]{16,128}$/.test(nonce)||!/^[1-9][0-9]*$/.test(requestedStroops))throw new ApiError('invalid_payload',400,'Invalid nonce or amount');
    try{assertAccount(returnAddress);}catch{throw new ApiError('invalid_payload',400,'Invalid return address');}
    const payment=await verifiedPayment(network,transactionHash,operationIndex,deps);requireSender(principal,payment);
    if(returnAddress!==payment.source)throw new ApiError('unsupported_return',422,'Refund destination must be verified original source');
    if(BigInt(requestedStroops)>BigInt(payment.stroops))throw new ApiError('invalid_amount',422,'Requested amount exceeds payment');
    const signed:SignedRequest={network,transactionHash,operationIndex,requestedStroops,returnAddress,expiresAt,nonce,signature};
    if(!await deps.verifySignedRequest(signed,principal,payment))throw new ApiError('invalid_signature',403,'Invalid signed request');
    const id=`${network}:${transactionHash}:${operationIndex}`;
    const record:RecoveryRecord={state:initialRecovery(id,requestedStroops,now,expiresAt),network,original:payment,recipient:payment.destination,sender:payment.source,returnAddress,nonce};
    const created=await deps.repository.create(record);return apiJson({id:created.state.id,status:created.state.status,expiresAt:created.state.expiresAt},201);
  }catch(e){return apiFailure(e);}
}
