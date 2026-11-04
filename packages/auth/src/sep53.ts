import {verifyAccountSignature} from './crypto.ts';

const PREFIX=new TextEncoder().encode('Stellar Signed Message:\n');
/** Freighter / SEP-53 signs SHA-256(prefix || UTF-8 message), not raw message bytes. */
export async function verifySep53AccountSignature(account:string,signature:string,message:Uint8Array):Promise<boolean>{
 if(!(message instanceof Uint8Array)||message.byteLength>4096)throw new TypeError('Invalid SEP-53 message');
 const decoded=typeof signature==='string'&&/^[0-9a-f]{128}$/i.test(signature)
   ? Buffer.from(signature,'hex').toString('base64')
   : signature;
 const preimage=new Uint8Array(PREFIX.length+message.length);
 preimage.set(PREFIX,0);preimage.set(message,PREFIX.length);
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',preimage));
 return verifyAccountSignature(account,decoded,digest);
}
