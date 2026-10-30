import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';

export class PublicError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
type Counter = { count:number; until:number };
const counters = new Map<string, Counter>();
export const MAX_BODY_BYTES = 8192;
export const MAX_NOTE_LENGTH = 500;
export function throttle(scope:string, identity:string, limit=10, windowMs=60_000, now=Date.now()):void {
  if (!identity || identity.length>512) throw new PublicError(400,'Invalid request');
  if(counters.size>20_000) for(const [key,val] of counters) if(val.until<=now)counters.delete(key);
  if(counters.size>20_000) throw new PublicError(429,'Too many requests');
  const key = createHash('sha256').update(scope+'\0'+identity).digest('hex');
  const value = counters.get(key);
  if(!value || value.until<=now) {counters.set(key,{count:1,until:now+windowMs});return;}
  if(value.count>=limit)throw new PublicError(429,'Too many requests');
  value.count++;
}
export async function readBody(req:import('node:http').IncomingMessage):Promise<unknown>{
  const chunks:Buffer[]=[];let size=0;
  for await(const item of req){
    const chunk=Buffer.from(item);size+=chunk.length;
    if(size>MAX_BODY_BYTES)throw new PublicError(413,'Request too large');
    chunks.push(chunk);
  }
  try{const parsed:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();return parsed;}
  catch{throw new PublicError(400,'Invalid request');}
}
export function safeLog(event:string, outcome:'ok'|'rejected'|'error'):void{
  // Strict allowlist: never serialize request bodies, addresses, notes, or signatures.
  process.stdout.write(JSON.stringify({event:event.replace(/[^a-z0-9_-]/gi,'').slice(0,40),outcome})+'\n');
}
export function publicFailure(error:unknown):{status:number;body:{error:string}} {
  return error instanceof PublicError?{status:error.status,body:{error:error.message}}:{status:500,body:{error:'Request failed'}};
}
export function secureMatch(a:string,b:string):boolean{
  const aa=Buffer.from(a),bb=Buffer.from(b);
  return aa.length===bb.length&&timingSafeEqual(aa,bb);
}
export function randomToken():string{return randomBytes(32).toString('hex');}
