/** No custody, finality reversal or wallet signing is implemented in this foundation. */
export const RECLAIM_PROTOCOL_VERSION = 1 as const;
export type Network = 'testnet' | 'public';
export const PASSPHRASE: Readonly<Record<Network, string>> = Object.freeze({
  testnet: 'Test SDF Network ; September 2015',
  public: 'Public Global Stellar Network ; September 2015'
});

/** Exact positive decimal stroops: no binary floating-point conversion. */
export function parseStroops(amount: string): bigint {
  if (typeof amount !== 'string' || !/^(0|[1-9]\d{0,18})(?:\.\d{1,7})?$/.test(amount)) {
    throw new TypeError('Invalid Stellar decimal amount');
  }
  const [whole, frac = ''] = amount.split('.');
  const value = BigInt(whole!) * 10_000_000n + BigInt(frac.padEnd(7, '0') || '0');
  if (value <= 0n || value > 9_223_372_036_854_775_807n) throw new RangeError('Amount outside positive Stellar i64 range');
  return value;
}

export function formatStroops(stroops: bigint): string {
  if (stroops <= 0n || stroops > 9_223_372_036_854_775_807n) throw new RangeError('Invalid positive stroops');
  const fractional = (stroops % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return `${stroops / 10_000_000n}${fractional ? '.' + fractional : ''}`;
}

export function assertTransactionHash(hash: string): string {
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) throw new TypeError('Expected 64 hex characters for transaction hash');
  return hash.toLowerCase();
}

/** Decode Stellar classic G (32-byte key) and M (32-byte key + 8-byte ID) addresses. */
function crc16(data: readonly number[]): number {
  let crc=0;
  for(const b of data){crc ^= b << 8;for(let i=0;i<8;i++)crc=(crc & 0x8000)?((crc << 1)^0x1021)&65535:(crc<<1)&65535;}
  return crc;
}
function fromBase32(value:string): number[] {
  let bits=0,buffer=0;const out:number[]=[];
  for(const ch of value){const n='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(ch);if(n<0)throw new TypeError('Invalid base32 character');buffer=(buffer << 5)|n;bits+=5;while(bits>=8){bits-=8;out.push((buffer >>> bits)&255);}}
  if(bits>0 && (buffer & ((1<<bits)-1))!==0)throw new TypeError('Invalid StrKey padding bits');
  return out;
}
function toBase32(data:readonly number[]): string {
  let bits=0,buffer=0,out='';const alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  for(const byte of data){buffer=(buffer<<8)|byte;bits+=8;while(bits>=5){bits-=5;out+=alpha[(buffer>>>bits)&31];}}
  if(bits>0)out+=alpha[(buffer << (5-bits))&31];
  return out;
}
function classicFromKey(publicKey: readonly number[]):string {
  const body=[48,...publicKey];const crc=crc16(body);return toBase32([...body,crc&255,crc>>8]);
}
export function decodeAccount(value:string):{base:string;muxed:boolean;id?:string} {
  if(typeof value!=='string'||!/^[A-Z2-7]+$/.test(value)||(value.length!==56 && value.length!==69))throw new TypeError('Invalid Stellar account encoding');
  const bytes=fromBase32(value);
  const validClassic=value.length===56&&bytes.length===35&&bytes[0]===48;
  const validMuxed=value.length===69&&bytes.length===43&&bytes[0]===96;
  if(!validClassic&&!validMuxed)throw new TypeError('Unsupported StrKey account version');
  const crc=crc16(bytes.slice(0,-2));
  if(bytes.at(-2)!==(crc&255)||bytes.at(-1)!==(crc>>8))throw new TypeError('Invalid StrKey checksum');
  if(validClassic)return {base:value,muxed:false};
  const ident=bytes.slice(33,41).reduce((n,b)=>(n<<8n)|BigInt(b),0n);
  return {base:classicFromKey(bytes.slice(1,33)),muxed:true,id:ident.toString()};
}
export function assertAccount(account:string):string {decodeAccount(account);return account;}
