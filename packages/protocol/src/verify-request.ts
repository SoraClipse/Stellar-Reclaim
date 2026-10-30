import {decodeAccount, parseStroops} from '../../core/src/index.ts';
import {normalizePayment, type Payment} from '../../ledger/src/normalize.ts';
import type {Lookup} from '../../ledger/src/client.ts';
import {verifyAccountSignature} from '../../auth/src/crypto.ts';
import {canonicalizeRecoveryRequest, recoveryRequestDigest, requestSigningBytes, type RecoveryRequest} from './request.ts';

export class RequestVerificationError extends Error {
  readonly kind: 'invalid'|'unsupported'|'replayed'|'ledger_mismatch';
  constructor(kind: 'invalid'|'unsupported'|'replayed'|'ledger_mismatch', message: string) {
    super(message); this.name = 'RequestVerificationError'; this.kind = kind;
  }
}
export interface VerifiedRequestStore {
  /** Transactional UNIQUE network/sender/nonce and UNIQUE network/transactionHash/operationIndex. */
  recordVerifiedRequest(request: RecoveryRequest, digest: string, signature: string): Promise<boolean> | boolean;
}

function samePayment(request: RecoveryRequest, payment: Payment): boolean {
  return request.network === payment.network && request.transactionHash === payment.transactionHash &&
    request.operationIndex === payment.operationIndex && request.originalSender === payment.source &&
    request.recipient === payment.destination && request.originalAmount === payment.amount &&
    JSON.stringify(request.asset) === JSON.stringify(payment.asset) &&
    parseStroops(request.requestedAmount) <= parseStroops(payment.amount);
}

/** Only call with a finalized lookup returned by the configured StellarLedgerClient. */
export async function verifyRecoveryRequest(input: {request: unknown; signature: string; lookup: Lookup;
  domain: string; now: number; store: VerifiedRequestStore}): Promise<{digest: string; request: RecoveryRequest}> {
  const {request} = canonicalizeRecoveryRequest(input.request);
  if (request.domain !== input.domain || !Number.isSafeInteger(input.now) || input.now < request.issuedAt - 30 || input.now >= request.expiresAt) {
    throw new RequestVerificationError('invalid', 'Wrong domain, not yet valid, or expired');
  }
  // A muxed (M) sender may be an exchange sub-account: an account-level signature cannot establish sub-account custody.
  if (decodeAccount(request.originalSender).muxed) {
    throw new RequestVerificationError('unsupported', 'Muxed original sender cannot independently prove control');
  }
  if (request.network !== input.lookup.network) throw new RequestVerificationError('ledger_mismatch', 'Cross-network payment reference');
  const payment = normalizePayment(input.lookup, request.operationIndex);
  if (!samePayment(request, payment)) throw new RequestVerificationError('ledger_mismatch', 'Signed request does not match finalized payment operation');
  const valid = await verifyAccountSignature(request.originalSender, input.signature, requestSigningBytes(request));
  if (!valid) throw new RequestVerificationError('invalid', 'Signature does not belong to the original payment sender');
  const digest = await recoveryRequestDigest(request);
  const saved = await input.store.recordVerifiedRequest(request, digest, input.signature);
  if (!saved) throw new RequestVerificationError('replayed', 'Request nonce or payment already redeemed');
  return {digest, request};
}
