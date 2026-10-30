import {createServer} from 'node:http';
import {recoveryPage} from '../../web/src/page.ts';
import {readBody,publicFailure,safeLog,throttle,PublicError} from './middleware/abuse.ts';
import {freshChallenge,authenticate,createRecovery,inbox,decide,publicReceipt,requireText} from './recovery.ts';
import {StellarLedgerClient,normalizePayment} from '../../../packages/ledger/src/index.ts';
function object(x:unknown):Record<string,unknown>{if(!x||typeof x!=='object'||Array.isArray(x))throw new PublicError(400,'Invalid request');return x as Record<string,unknown>;}
export const server=createServer(async(req,res)=>{
 const url=new URL(req.url??'/', 'http://localhost');
 const send=(status:number,data:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
 try{
  if(url.pathname.length>180||!['GET','POST'].includes(req.method??''))throw new PublicError(404,'Not found');
  throttle('caller',req.socket.remoteAddress??'unknown',90,60000);
  if(req.method==='GET'&&(/^\/(request|inbox|recoveries)(\/.*)?$/.test(url.pathname))){res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",'x-content-type-options':'nosniff','cache-control':'no-store'});res.end(recoveryPage);return;}
  if(req.method==='POST'){
   if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new PublicError(415,'Invalid content type');
   const data=object(await readBody(req));
   if(url.pathname==='/v1/challenge')return send(200,freshChallenge(data.wallet,data.purpose));
   const action=url.pathname==='/v1/requests'?'create':url.pathname==='/v1/inbox'?'inbox':'decision';
   const wallet=authenticate(data.wallet,action,data.message,data.signature);
   if(url.pathname==='/v1/requests'){
    if(data.network!=='testnet'&&data.network!=='public')throw new PublicError(400,'Invalid request');
    const hash=requireText(data.txHash,64),idx=data.operationIndex;
    if(!Number.isSafeInteger(idx)||Number(idx)<0)throw new PublicError(400,'Invalid request');
    const proof=normalizePayment(await new StellarLedgerClient(data.network).lookup(hash),Number(idx));
    if(data.expectedRecipient!==proof.destination)throw new PublicError(403,'Recipient does not match payment');
    return send(201,createRecovery(data,{network:data.network,txHash:proof.transactionHash,operationIndex:Number(idx),sender:proof.source,recipient:proof.destination,asset:JSON.stringify(proof.asset),amount:proof.amount},wallet));
   }
   if(url.pathname==='/v1/inbox')return send(200,{requests:inbox(wallet)});
   const m=/^\/v1\/requests\/([a-f0-9-]{36})\/decision$/.exec(url.pathname);
   if(m)return send(200,decide(m[1]!,wallet,data.decision));
   throw new PublicError(404,'Not found');
  }
  const m=/^\/v1\/receipts\/([a-f0-9-]{36})$/.exec(url.pathname);
  if(m)return send(200,publicReceipt(m[1]!));
  if(url.pathname==='/health')return send(200,{status:'ok',storage:'ephemeral'});
  throw new PublicError(404,'Not found');
 }catch(error){const fail=publicFailure(error);safeLog('api_request','rejected');send(fail.status,fail.body);}
});
if(process.argv[1]?.endsWith('server.ts'))server.listen(Number(process.env.PORT??8787),'127.0.0.1');
