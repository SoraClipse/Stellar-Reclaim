/** Deterministic recovery state machine. Authorization and atomic storage are caller responsibilities. */
export type RecoveryStatus = 'requested' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'refund_submitted' | 'partially_refunded' | 'refunded';
export type RecoveryActor = 'recipient' | 'system' | 'settlement';
export type RecoveryAction = 'view' | 'accept' | 'decline' | 'expire' | 'submit_refund' | 'refund';
export type RecoveryEvent = {id:string; action:RecoveryAction; actor:RecoveryActor; at:number; reason:string; amountStroops?:string; operationKey?:string; submissionHash?:string};
export type RecoveryState = {
  id:string; status:RecoveryStatus; createdAt:number; expiresAt:number;
  amountStroops:string; refundedStroops:string; version:number; history:RecoveryEvent[];
};
export class RecoveryStateError extends Error {
  readonly code:'invalid'|'unauthorized'|'expired'|'terminal'|'conflict';
  constructor(code:'invalid'|'unauthorized'|'expired'|'terminal'|'conflict',message:string){super(message);this.name='RecoveryStateError';this.code=code;}
}
const MAX_I64=9223372036854775807n;
function amount(value:string,allowZero=false):bigint{
  if(typeof value!=='string'||!/^(0|[1-9][0-9]*)$/.test(value))throw new RecoveryStateError('invalid','Amount must be integer stroops');
  const n=BigInt(value);
  if(n>MAX_I64||(!allowZero&&n===0n))throw new RecoveryStateError('invalid','Amount out of range');
  return n;
}
function requireTime(t:number){if(!Number.isSafeInteger(t)||t<0)throw new RecoveryStateError('invalid','Invalid timestamp');}
export function initialRecovery(id:string,amountStroops:string,createdAt:number,expiresAt:number):RecoveryState{
  if(typeof id!=='string'||id.length<1||id.length>128)throw new RecoveryStateError('invalid','Invalid recovery identifier');
  amount(amountStroops);requireTime(createdAt);requireTime(expiresAt);
  if(expiresAt<=createdAt)throw new RecoveryStateError('invalid','Expiry must follow creation');
  return {id,status:'requested',createdAt,expiresAt,amountStroops,refundedStroops:'0',version:0,history:[]};
}
export function advanceRecovery(state:RecoveryState,event:RecoveryEvent):RecoveryState{
  if(!event||typeof event.id!=='string'||!/^[-A-Za-z0-9_:]{1,128}$/.test(event.id)||typeof event.reason!=='string'||event.reason.length<1||event.reason.length>240)throw new RecoveryStateError('invalid','Invalid event metadata');
  requireTime(event.at);
  const prior=state.history.find(x=>x.id===event.id);
  if(prior){if(JSON.stringify(prior)===JSON.stringify(event))return state;throw new RecoveryStateError('conflict','Event ID reused with different data');}
  if(event.at<state.createdAt || (state.history.length>0&&event.at<state.history[state.history.length-1]!.at))throw new RecoveryStateError('invalid','Nonmonotonic event timestamp');
  if(['declined','expired','refunded'].includes(state.status))throw new RecoveryStateError('terminal','Terminal recovery cannot transition');
  const permitted:Record<RecoveryAction,RecoveryActor>={view:'recipient',accept:'recipient',decline:'recipient',expire:'system',submit_refund:'recipient',refund:'settlement'};
  if(event.actor!==permitted[event.action])throw new RecoveryStateError('unauthorized','Wrong event actor');
  let status:RecoveryStatus=state.status;
  let refunded=amount(state.refundedStroops,true);
  const total=amount(state.amountStroops);
  if(event.action==='expire'){
    if(event.at<state.expiresAt||!['requested','viewed'].includes(status))throw new RecoveryStateError('conflict','Request is not expirable');
    status='expired';
  } else if(event.action==='submit_refund'){
    if(!['accepted','partially_refunded','refund_submitted'].includes(status))throw new RecoveryStateError('conflict','Consent required before refund submission');
    if(!event.submissionHash||!/^[0-9a-f]{64}$/.test(event.submissionHash)||event.operationKey!==undefined||event.amountStroops!==undefined)throw new RecoveryStateError('invalid','Valid submitted transaction hash required');
    status='refund_submitted';
  } else if(event.action==='refund'){
    if(!['accepted','partially_refunded','refund_submitted'].includes(status))throw new RecoveryStateError('conflict','Consent required before refund reconciliation');
    if(event.submissionHash!==undefined||!event.operationKey||!/^(testnet|public):[0-9a-f]{64}:[0-9]+$/.test(event.operationKey))throw new RecoveryStateError('invalid','Verified operation key required');
    if(state.history.some(x=>x.operationKey===event.operationKey))throw new RecoveryStateError('conflict','Refund operation already counted');
    const delta=amount(event.amountStroops??'');
    if(refunded+delta>total)throw new RecoveryStateError('conflict','Refund exceeds requested amount');
    refunded+=delta;status=refunded===total?'refunded':'partially_refunded';
  } else {
    if(event.at>=state.expiresAt)throw new RecoveryStateError('expired','Request has expired');
    if(event.amountStroops!==undefined||event.operationKey!==undefined||event.submissionHash!==undefined)throw new RecoveryStateError('invalid','Unexpected financial event fields');
    if(event.action==='view'){
      if(status!=='requested')throw new RecoveryStateError('conflict','Already viewed or decided');status='viewed';
    } else if(event.action==='accept'||event.action==='decline'){
      if(!['requested','viewed'].includes(status))throw new RecoveryStateError('conflict','Request already decided');status=event.action==='accept'?'accepted':'declined';
    } else throw new RecoveryStateError('invalid','Unknown action');
  }
  return {...state,status,refundedStroops:refunded.toString(),version:state.version+1,history:[...state.history,{...event}]};
}
