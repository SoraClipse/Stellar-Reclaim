import {assertAccount, assertTransactionHash, formatStroops, parseStroops, PASSPHRASE, type Network} from '../../core/src/index.ts';
import {assertDomain} from '../../auth/src/challenge.ts';
import {hex} from '../../auth/src/crypto.ts';

export type RecoveryAsset = {type: 'native'} | {type: 'credit'; code: string; issuer: string};
export type RecoveryRequest = Readonly<{
  version: 1;
  domain: string;
  network: Network;
  transactionHash: string;
  operationIndex: number;
  originalSender: string;
  recipient: string;
  asset: RecoveryAsset;
  originalAmount: string;
  requestedAmount: string;
  returnDestination: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}>;

const KEYS = ['version','domain','network','transactionHash','operationIndex','originalSender','recipient','asset','originalAmount','requestedAmount','returnDestination','nonce','issuedAt','expiresAt'];
function exactKeys(object: unknown, keys: string[]): asserts object is Record<string, unknown> {
  if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).sort().join('|') !== [...keys].sort().join('|')) {
    throw new TypeError('Unexpected or missing recovery request fields');
  }
}
function exactAmount(x: unknown): string {
  if (typeof x !== 'string' || formatStroops(parseStroops(x)) !== x) throw new TypeError('Amount must be canonical, exact, positive stroops');
  return x;
}
function canonicalAsset(asset: unknown): RecoveryAsset {
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) throw new TypeError('Invalid asset');
  if ((asset as {type?: unknown}).type === 'native') {
    exactKeys(asset, ['type']);
    return {type: 'native'};
  }
  exactKeys(asset, ['type', 'code', 'issuer']);
  if (asset.type !== 'credit' || typeof asset.code !== 'string' || !/^[A-Za-z0-9]{1,12}$/.test(asset.code)) throw new TypeError('Invalid credit asset code');
  if (typeof asset.issuer !== 'string') throw new TypeError('Missing asset issuer');
  const issuer = assertAccount(asset.issuer);
  if (issuer.startsWith('M')) throw new TypeError('Asset issuer must be a classic account');
  return {type: 'credit', code: asset.code, issuer};
}

/** Parse untrusted data and return one unique, versioned JSON representation. */
export function canonicalizeRecoveryRequest(raw: unknown): {request: RecoveryRequest; json: string} {
  const rawLength = JSON.stringify(raw);
  if (typeof rawLength !== 'string' || new TextEncoder().encode(rawLength).length > 2048) throw new RangeError('Oversized recovery request');
  exactKeys(raw, KEYS);
  if (raw.version !== 1 || (raw.network !== 'public' && raw.network !== 'testnet') || !Number.isSafeInteger(raw.operationIndex) ||
      (raw.operationIndex as number) < 0 || (raw.operationIndex as number) >= 100 ||
      typeof raw.transactionHash !== 'string' || !/^[0-9a-f]{64}$/.test(raw.transactionHash) ||
      typeof raw.originalSender !== 'string' || typeof raw.recipient !== 'string' || typeof raw.returnDestination !== 'string' ||
      typeof raw.nonce !== 'string' || !/^[0-9a-f]{64}$/.test(raw.nonce) ||
      !Number.isSafeInteger(raw.issuedAt) || !Number.isSafeInteger(raw.expiresAt) ||
      (raw.expiresAt as number) <= (raw.issuedAt as number) || (raw.expiresAt as number) - (raw.issuedAt as number) > 86400) {
    throw new TypeError('Invalid recovery request identity, nonce, or expiry');
  }
  const network = raw.network as Network;
  // Passphrase is included in the signature preimage to defend against network confusion.
  const request: RecoveryRequest = {
    version: 1, domain: assertDomain(raw.domain as string), network,
    transactionHash: assertTransactionHash(raw.transactionHash), operationIndex: raw.operationIndex as number,
    originalSender: assertAccount(raw.originalSender), recipient: assertAccount(raw.recipient),
    asset: canonicalAsset(raw.asset), originalAmount: exactAmount(raw.originalAmount), requestedAmount: exactAmount(raw.requestedAmount),
    returnDestination: assertAccount(raw.returnDestination), nonce: raw.nonce, issuedAt: raw.issuedAt as number, expiresAt: raw.expiresAt as number
  };
  if (parseStroops(request.requestedAmount) > parseStroops(request.originalAmount)) throw new RangeError('Requested amount exceeds original payment');
  const json = JSON.stringify(request);
  if (new TextEncoder().encode(json).length > 2048) throw new RangeError('Oversized canonical request');
  return {request, json};
}

export function requestSigningBytes(raw: unknown): Uint8Array {
  const {request, json} = canonicalizeRecoveryRequest(raw);
  return new TextEncoder().encode(`stellar-reclaim.recovery-request.v1\n${PASSPHRASE[request.network]}\n${json}`);
}

export async function recoveryRequestDigest(raw: unknown): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', requestSigningBytes(raw) as BufferSource);
  return hex(new Uint8Array(hash));
}
