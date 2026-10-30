import {decodeAccount} from '../../core/src/index.ts';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Extract a validated Stellar Ed25519 public key; never accept a seed or private key. */
export function stellarPublicKey(account: string): Uint8Array {
  const base = decodeAccount(account).base;
  let buffer = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const char of base) {
    const n = ALPHABET.indexOf(char);
    if (n < 0) throw new TypeError('Invalid account encoding');
    buffer = (buffer << 5) | n;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
  }
  if (bytes.length !== 35 || bytes[0] !== 48) throw new TypeError('Invalid account public key');
  return new Uint8Array(bytes.slice(1, 33));
}

export function decodeSignature(signature: string): Uint8Array {
  if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) throw new TypeError('Expected a base64 Ed25519 signature');
  let binary: string;
  try { binary = atob(signature); } catch { throw new TypeError('Malformed base64 signature'); }
  if (binary.length !== 64 || btoa(binary) !== signature) throw new TypeError('Non-canonical signature');
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

export async function verifyAccountSignature(account: string, signature: string, payload: Uint8Array): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', stellarPublicKey(account) as BufferSource, {name: 'Ed25519'}, false, ['verify']);
  return crypto.subtle.verify('Ed25519', key, decodeSignature(signature) as BufferSource, payload as BufferSource);
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
