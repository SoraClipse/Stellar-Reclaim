# Secure API: testnet-first hardening

This is the hardened API foundation, **not** a production launch or a wallet-certified web application. It does not move assets or reverse transactions. A separate **read-only** refund-proof endpoint matches independently finalized Horizon operations; this is not a production claim or permission to submit transactions.

## Start safely

- Node 22.16+ and Corepack/pnpm 9.15.9 are required.
- Set a persistent SQLite file path; **never** put an application database into a public repository or web root.
- Only the Stellar Testnet is supported. The server binds to `127.0.0.1`.
- If deployed behind a proxy, require TLS, a fixed trusted origin, request filtering and carefully configured forwarding. Do not expose the development server to the internet.

```sh
corepack enable
corepack pnpm install --frozen-lockfile
export RECLAIM_ORIGIN=http://127.0.0.1:8787
export RECLAIM_DB_PATH=./reclaim-testnet.sqlite
corepack pnpm api
```

There are no default application credentials. The API refuses to start without `RECLAIM_DB_PATH` and a valid domain, or when configured for `public`. This file path contains sensitive request metadata. Protect file permissions and backups.

## Protocol endpoints

All JSON routes respond with no-cache headers. Authentication uses Ed25519 wallet-ownership signatures verified against the Stellar account public key, and 15-minute **hashed, persisted bearer sessions**. The signed challenge binds to the fixed origin, exact network and passphrase, account, expiry and single-use nonce.

- `POST /v2/challenges`: `{"network":"testnet","account":"G..."}`, returns challenge and exact signing message.
- `POST /v2/auth`: `{"challenge":{...},"signature":"<canonical base64 Ed25519 signature>"}`, returns an expiring bearer token. Challenges can be used once.
- `POST /v2/requests` (bearer): `{"request":{...},"signature":"<canonical base64 Ed25519 signature>"}`. The request is the **full canonical v1 structure** from `packages/protocol/src/request.ts` and must be signed using `requestSigningBytes`. The source must match the authenticated account and finalized Testnet operation. Only direct classic payments are supported. Once stored, a matching request/nonce cannot be replayed.
- `GET /v2/inbox` (bearer): recipient-only request listing, bounded to 100 entries per request.
- `POST /v2/decisions` (bearer): `{"digest":"64 hex","decision":"accept","nonce":"64 hex","signature":"base64 Ed25519"}`. The recipient signs the bytes built by `decisionSigningBytes` from `apps/api/src/secure-service.mjs`.
- `POST /v2/refunds` (bearer, original sender or recipient): `{"digest":"64 hex","transactionHash":"64 hex","operationIndex":0}`. Independently re-fetches the original and return transfer, checks exact network/source/destination/asset issuer/amount, and commits globally unique, bounded partial refunds in SQLite. Rejects unconsented requests, replays and overpayment. This route **does not submit or sign transfers**.
- `GET /v2/receipts/<digest>`: redacted public receipt. `refundVerified:true` is emitted only when a verified refund operation has been persisted; acceptance alone stays unverified.
- `GET /health`: minimal readiness response. The response does not certify external Horizon connectivity.

The obsolete `apps/api/src/server.ts` and its ephemeral endpoints are deliberately disabled. Existing prototype UI HTML is **not** wired to the new secure routes. It should not be advertised as a working authenticated wallet frontend.

## Trust boundaries and work required before any production claim

1. Implement and independently test a real wallet adapter, including Freighter SEP-53 message semantics. Raw Ed25519 signing in the test harness **does not prove wallet interoperability**, hardware-wallet support or delegated-signature support.
2. Add resumable, provider-diverse ledger indexing, automatic reconciliation and finality verification. The manual `/v2/refunds` proof endpoint validates the submitted operation against the configured Horizon provider but has not been independently proven against a real Testnet refund sequence or audited for production. Persisted checks prevent duplicate operations and overpayment; they do not guarantee provider honesty.
3. Introduce distributed, persistent abuse controls, monitoring, backup/restore drills, encryption-at-rest, session revocation, audit logging and operational response procedures. Current throttling is process-local.
4. Complete real Testnet transaction verification, publish redacted, replayable evidence and run multi-wallet end-to-end UX tests.
5. Perform independent security review, privacy/legal assessment and capacity tests before enabling public traffic or mainnet.
6. Review wallet-ownership limitations for Stellar multisig and muxed exchange deposits. The current API deliberately cannot authenticate arbitrary delegated/muxed account authority.

Do not use this API to promise reimbursement, reverse transfers or submit transactions on behalf of the recipient.
