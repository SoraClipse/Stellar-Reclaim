# Issues #9–#12: recovery coordination APIs and settlement

## Scope and status

This change provides a deterministic lifecycle engine, injectable HTTP Request/Response handlers, offline API contract tests, and a verified-operation refund matcher. **It does not deploy a server**, contain keys, independently validate cryptographic signatures, supply a durable database, or run actual Stellar transactions. Those require Issues #5–#8 and subsequent integration/deployment work. Never advertise this as a live recovery service.

## Routes and security prerequisites

Call `createRecoveryRouter(deps)` and mount its resulting `Request => Promise<Response>` handler in an HTTPS application with request-size limits and safe logs.

- `POST /v1/payments/lookup`: bearer wallet proof; JSON `{network,transactionHash,operationIndex}`. Performs network-bound Horizon lookup, successful-operation normalization and exact source-account comparison. Returns sanitized payment or structured error.
- `POST /v1/recovery/requests`: bearer proof; JSON `{network,transactionHash,operationIndex,requestedStroops,returnAddress,expiresAt,nonce,signature}`. Validates the successful original payment, source account and return address, bounds requested stroops, and invokes mandatory signed-request verifier. The repository must **transactionally** enforce unique `(network, hash, operationIndex)` and signed nonce.
- `GET /v1/recovery/inbox?network=testnet`: only exact verified recipient identity can see its request metadata. No sender identity metadata is returned by this handler.
- `POST /v1/recovery/consent`: bearer proof; JSON `{network,id,decision,nonce,signature}`. Validates verified recipient, network, expiry, signed accept/decline and atomic versioned state transition. Consent is **never** a refund transfer. A submitted transaction hash is only a user claim until the ledger confirms it.

**Required adapters:** `authenticate` must validate a fresh, replay-safe, domain/network-bound wallet challenge; `verifySignedRequest` must cryptographically bind the whole canonical payload and original transfer; `verifyConsentSignature` must cryptographically bind the decision and recipient; `rateLimit` must enforce rate limits across processes; `repository` must provide transactional durable unique nonce/payment enforcement, consistent private inbox filtering and compare-and-swap transitions; `ledger` must use the network-checked finalized Horizon client. The example tests intentionally mock these ports; the router has no permissive default implementations. Muxed/delegated signing must not be enabled until ownership semantics are specified and independently tested.

### Transition rules

`requested -> viewed|accepted|declined|expired`; `viewed -> accepted|declined|expired`; `accepted -> refund_submitted|partially_refunded|refunded`; `refund_submitted -> partially_refunded|refunded`; `partially_refunded -> partially_refunded|refunded`. Decisions after expiry, unauthorized actors, terminal-state regressions, over-refunds and duplicate operation counting fail closed. Events include unique IDs, reasons, monotonic timestamps and version increments. Exact event retries are idempotent.

### Refund settlement

Only a finalized successfully normalized **direct payment** can be considered, with matching `network`, original payee as refund source, original sender as return destination and exact native or issuer-qualified asset. The receipt key is `network:transactionHash:operationIndex`. The `RefundSettlementStore.applyVerifiedRefund` port **must** atomically reserve that global operation key, check request state and remaining amount, and persist the corresponding lifecycle event. In-memory simulation in tests is not a production transaction implementation. A verification result is evidence only; real refund claims require real Horizon data and durable replay protection.

## Validation

`corepack pnpm install --frozen-lockfile && corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` from the workspace root. Tests are offline mocks, including sender spoofing, replay, recipient-only consent, failed provider, issuer mismatch, partial settlement and cross-request refund reuse. Tests do not establish testnet proof, network deployment or security audit coverage.
