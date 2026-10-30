import {assertAccount, PASSPHRASE, type Network} from '../../core/src/index.ts';
import {hex, verifyAccountSignature} from './crypto.ts';

export type WalletChallenge = Readonly<{
  version: 1;
  domain: string;
  network: Network;
  networkPassphrase: string;
  account: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}>;

export interface ChallengeStore {
  /** Must persist the exact issued challenge and reject repeated issuance. */
  issueChallenge(challenge: WalletChallenge): Promise<void> | void;
  /** Atomic compare-and-consume. A replay or unissued challenge must return false. */
  consumeChallenge(challenge: WalletChallenge, now: number): Promise<boolean> | boolean;
}

export function assertDomain(domain: string): string {
  if (typeof domain !== 'string' || domain.length > 253) throw new TypeError('Invalid challenge domain');
  let url: URL;
  try { url = new URL(domain); } catch { throw new TypeError('Invalid challenge domain'); }
  const local = url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  if ((!local && url.protocol !== 'https:') || !url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.origin !== domain) {
    throw new TypeError('Expected an HTTPS origin (or loopback development origin)');
  }
  return domain;
}

export function validateChallenge(value: WalletChallenge, now: number, expectedDomain: string, expectedNetwork: Network): WalletChallenge {
  if (!value || typeof value !== 'object' || value.version !== 1 || value.domain !== assertDomain(expectedDomain) || value.network !== expectedNetwork ||
      !(expectedNetwork in PASSPHRASE) || value.networkPassphrase !== PASSPHRASE[expectedNetwork] ||
      !/^[0-9a-f]{64}$/.test(value.nonce) || !Number.isSafeInteger(value.issuedAt) || !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt <= value.issuedAt || value.expiresAt - value.issuedAt > 300 ||
      !Number.isSafeInteger(now) || value.issuedAt > now + 30 || now >= value.expiresAt) {
    throw new Error('Invalid, expired, or differently scoped wallet challenge');
  }
  assertAccount(value.account);
  return value;
}

export function challengeSigningBytes(challenge: WalletChallenge): Uint8Array {
  // Fixed field ordering and a protocol tag prohibit signing an unrelated message.
  return new TextEncoder().encode('stellar-reclaim.wallet-ownership.v1\n' + JSON.stringify({
    version: challenge.version, domain: challenge.domain, network: challenge.network,
    networkPassphrase: challenge.networkPassphrase, account: challenge.account,
    nonce: challenge.nonce, issuedAt: challenge.issuedAt, expiresAt: challenge.expiresAt
  }));
}

export async function issueWalletChallenge(store: ChallengeStore, input: {domain: string; network: Network; account: string; now: number; ttlSeconds?: number}): Promise<WalletChallenge> {
  const domain = assertDomain(input.domain);
  if (!(input.network in PASSPHRASE)) throw new TypeError('Unsupported Stellar network');
  assertAccount(input.account);
  const ttl = input.ttlSeconds ?? 180;
  if (!Number.isSafeInteger(input.now) || !Number.isSafeInteger(ttl) || ttl < 1 || ttl > 300) throw new RangeError('Invalid challenge time or TTL');
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  const challenge: WalletChallenge = {version: 1, domain, network: input.network, networkPassphrase: PASSPHRASE[input.network],
    account: input.account, nonce: hex(nonce), issuedAt: input.now, expiresAt: input.now + ttl};
  await store.issueChallenge(challenge);
  return challenge;
}

export async function verifyWalletChallenge(store: ChallengeStore, challenge: WalletChallenge, signature: string,
  context: {domain: string; network: Network; now: number}): Promise<boolean> {
  validateChallenge(challenge, context.now, context.domain, context.network);
  if (!await verifyAccountSignature(challenge.account, signature, challengeSigningBytes(challenge))) return false;
  return store.consumeChallenge(challenge, context.now);
}
