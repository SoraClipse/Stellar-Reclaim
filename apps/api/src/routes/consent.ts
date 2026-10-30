import type {RecoveryEvent} from '../../../../packages/core/src/state-machine.ts';
import {ApiError,apiFailure,apiJson,enforceLimit,getPrincipal,readJson,requireNetwork,type RecoveryDependencies} from './requests.ts';

export async function handleInbox(req:Request,deps:RecoveryDependencies):Promise<Response>{
  try{
    const url=new URL(req.url),network=requireNetwork(url.searchParams.get('network'));
    const principal=await getPrincipal(req,network,deps);await enforceLimit(deps,principal,'inbox');
    const rows=await deps.repository.listForRecipient(principal.account,network);
    // Defense in depth against a malformed store implementation or cross-network leaks.
    const requests=rows.filter(r=>r.network===network&&r.recipient===principal.account).map(r=>({id:r.state.id,status:r.state.status,amountStroops:r.state.amountStroops,expiresAt:r.state.expiresAt,network:r.network}));
    return apiJson({requests});
  }catch(e){return apiFailure(e);}
}
export async function handleConsent(req:Request,deps:RecoveryDependencies):Promise<Response>{
  try{
    const input=await readJson(req),network=requireNetwork(input.network),principal=await getPrincipal(req,network,deps);
    await enforceLimit(deps,principal,'consent');
    if(typeof input.id!=='string'||input.id.length>160||!input.id.startsWith(`${network}:`))throw new ApiError('invalid_payload',400,'Invalid request ID');
    if(input.decision!=='accept'&&input.decision!=='decline')throw new ApiError('invalid_payload',400,'Invalid decision');
    if(typeof input.nonce!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(input.nonce)||typeof input.signature!=='string'||input.signature.length===0||input.signature.length>1024)throw new ApiError('invalid_payload',400,'Invalid signed decision');
    const row=await deps.repository.get(input.id);
    if(!row||row.network!==network||row.recipient!==principal.account)throw new ApiError('not_found',404,'Request not available');
    const now=deps.now();if(!Number.isSafeInteger(now)||now>=row.state.expiresAt)throw new ApiError('expired',410,'Request expired');
    if(!['requested','viewed'].includes(row.state.status))throw new ApiError('already_decided',409,'Request already decided');
    const decision=input.decision,nonce=input.nonce,signature=input.signature;
    if(!await deps.verifyConsentSignature({record:row,principal,decision,nonce,signature}))throw new ApiError('invalid_signature',403,'Invalid consent signature');
    const event:RecoveryEvent={id:`consent:${nonce}`,action:decision,actor:'recipient',at:now,reason:'verified recipient decision'};
    const updated=await deps.repository.transition(row.state.id,row.state.version,event);
    return apiJson({id:updated.state.id,status:updated.state.status,refundedStroops:updated.state.refundedStroops});
  }catch(e){return apiFailure(e);}
}
