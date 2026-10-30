import {apiJson,handleCreate,handleLookup,type RecoveryDependencies} from './routes/requests.ts';
import {handleConsent,handleInbox} from './routes/consent.ts';
/** Deploy with a real durable repository, trusted wallet verifiers, HTTPS and upstream request throttling. */
export function createRecoveryRouter(deps:RecoveryDependencies):(request:Request)=>Promise<Response>{
  return async request=>{
    const path=new URL(request.url).pathname;
    if(request.method==='POST'&&path==='/v1/payments/lookup')return handleLookup(request,deps);
    if(request.method==='POST'&&path==='/v1/recovery/requests')return handleCreate(request,deps);
    if(request.method==='GET'&&path==='/v1/recovery/inbox')return handleInbox(request,deps);
    if(request.method==='POST'&&path==='/v1/recovery/consent')return handleConsent(request,deps);
    return apiJson({error:{code:'not_found',message:'Unknown route'}},404);
  };
}
