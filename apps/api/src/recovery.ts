import {createPublicKey,verify,randomUUID} from 'node:crypto';
import {assertAccount,assertTransactionHash,decodeAccount} from '../../../packages/core/src/index.ts';
import {PublicError,MAX_NOTE_LENGTH,randomToken,throttle} from './middleware/abuse.ts';

export type RecoveryStatus='requested'|'accepted'|'declined'|'partial'|'settled';
export type Recovery={id:string;network:'testnet'|'public';txHash:string;operationIndex:number;sender:string;recipient:string;asset:string;amount:string;note:string;status:RecoveryStatus;expires:number;created:number;returnTx?:string};
export type LedgerProof={network:'testnet'|'public';txHash:string;operationIndex:number;sender:string;recipient:string;asset:string;amount:string};
const recoveryStore=new Map<string,Recovery>();
const challenges=new Map<string,{wallet:string;purpose:string;expires:number}>();
const ownerAuth=new Map<string,{wallet:string;expires:number}>();
const PREFIX=Buffer.from('302a300506032b6570032100','hex');
export const requireText=(x:unknown,max=512):string=>{if(typeof x!=='string'||!x.trim()||x.length>max)throw new PublicError(400,'Invalid request');return x;};
export function freshChallenge(wallet:unknown,purpose:unknown,now=Date.now()){
  const account=requireText(wallet,70);assertAccount(account);
  const action=requireText(purpose,24);
  if(!['create','inbox','decision'].includes(action))throw new PublicError(400,'Invalid request');
  throttle('challenge',account,8,60_000,now);
  if(challenges.size>5000)for(const [k,v] of challenges)if(v.expires<=now)challenges.delete(k);
  const nonce=randomToken();
  const message=`Stellar Reclaim login\nAction: ${action}\nWallet: ${account}\nNonce: ${nonce}\nExpires: ${now+300_000}`;
  challenges.set(message,{wallet:account,purpose:action,expires:now+300_000});
  return {message,expires:now+300_000};
}
export function authenticate(wallet:unknown,purpose:string,message:unknown,signature:unknown,now=Date.now()):string{
  const account=requireText(wallet,70);assertAccount(account);
  const text=requireText(message,600);const sig=requireText(signature,200);
  const challenge=challenges.get(text);
  // Consume before verification to prevent replay, including bad signature attempts.
  challenges.delete(text);
  if(!challenge||challenge.expires<=now||challenge.wallet!==account||challenge.purpose!==purpose)throw new PublicError(401,'Authorization required');
  if(!/^[0-9a-f]{128}$/i.test(sig))throw new PublicError(401,'Authorization required');
  const key=decodeAccount(account);
  if(key.muxed)throw new PublicError(400,'Use a classic wallet address');
  const raw=decodeStrKey(account);
  const publicKey=createPublicKey({key:Buffer.concat([PREFIX,raw]),format:'der',type:'spki'});
  if(!verify(null,Buffer.from(text),publicKey,Buffer.from(sig,'hex')))throw new PublicError(401,'Authorization required');
  return account;
}
function decodeStrKey(str:string):Buffer{
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0;const bytes:number[]=[];
  for(const ch of str){value=(value<<5)|alphabet.indexOf(ch);bits+=5;if(bits>=8){bits-=8;bytes.push((value>>>bits)&255);}}
  return Buffer.from(bytes.slice(1,33));
}
export function createRecovery(data:Record<string,unknown>,proof:LedgerProof,wallet:string,now=Date.now()){
  const txHash=assertTransactionHash(requireText(data.txHash,64));
  const operationIndex=data.operationIndex;
  if(!Number.isSafeInteger(operationIndex)||Number(operationIndex)<0)throw new PublicError(400,'Invalid request');
  const network=data.network;
  if(network!=='testnet'&&network!=='public')throw new PublicError(400,'Invalid request');
  const note=data.note===undefined?'':String(data.note);
  if(note.length>MAX_NOTE_LENGTH)throw new PublicError(413,'Request too large');
  if(wallet!==proof.sender||network!==proof.network||txHash!==proof.txHash||operationIndex!==proof.operationIndex)throw new PublicError(403,'Payment ownership could not be verified');
  throttle('sender',wallet,6,3_600_000,now);
  throttle('recipient',proof.recipient,12,3_600_000,now);
  if([...recoveryStore.values()].some(v=>v.network===network&&v.txHash===txHash&&v.operationIndex===operationIndex))throw new PublicError(409,'Request already exists');
  const entry:Recovery={id:randomUUID(),network,txHash,operationIndex:Number(operationIndex),sender:wallet,recipient:proof.recipient,asset:proof.asset,amount:proof.amount,note,status:'requested',created:now,expires:now+7*24*60*60_000};
  recoveryStore.set(entry.id,entry);
  return {id:entry.id,status:entry.status};
}
export function inbox(wallet:string,now=Date.now()){
  throttle('inbox',wallet,30,60_000,now);
  return [...recoveryStore.values()].filter(x=>x.recipient===wallet).map(x=>({...x,note:x.expires<=now?'':x.note,status:x.expires<=now&&x.status==='requested'?'expired':x.status}));
}
export function decide(id:string,wallet:string,decision:unknown,now=Date.now()){
  const entry=recoveryStore.get(id);
  if(!entry||entry.recipient!==wallet)throw new PublicError(404,'Not found');
  if(entry.expires<=now||entry.status!=='requested')throw new PublicError(409,'Request no longer actionable');
  if(decision!=='accept'&&decision!=='decline')throw new PublicError(400,'Invalid request');
  entry.status=decision==='accept'?'accepted':'declined';
  // Acceptance is communication only. It NEVER signs or transfers funds.
  return {id,status:entry.status,requiresSeparatePayment:true};
}
export function publicReceipt(id:string){
  const entry=recoveryStore.get(id);if(!entry)throw new PublicError(404,'Not found');
  return {id:entry.id,network:entry.network,txHash:entry.txHash,operationIndex:entry.operationIndex,asset:entry.asset,amount:entry.amount,status:entry.status,expires:entry.expires,returnTx:entry.returnTx??null,verifiedReturn:false};
}
