# Authenticated recovery requests and durable storage (Issues #5–#8)

This is an **offline-tested protocol component**, not a wallet app, hosted API, recipient notification system or proof of live Stellar settlement. An executed Stellar payment cannot be reversed. Returns are voluntary.

## Wallet ownership challenge (#5)

`issueWalletChallenge(store,{domain,network,account,now})` creates and **persists** a cryptographically random 32-byte nonce; the integrator asks the Stellar wallet to Ed25519-sign `challengeSigningBytes(challenge)` and passes its base64 64-byte detached signature to `verifyWalletChallenge`. This verifies the G public key encoded in the account and **atomically consumes** the issued challenge. The domain must be a complete HTTPS origin (loopback HTTP is only for development), network passphrase is fixed, and max TTL is 300 seconds. Do not accept self-issued or unpersisted challenges.

Muxed M account ownership checks authenticate its underlying G public key only, **not** the muxed sub-account or its rightful individual owner. Do not use this as proof of exchange custody. Stellar multisig thresholds, signed transactions with multiple signers, contract (C) accounts and custodial/exchange accounts are unsupported. This is standalone Ed25519 message signing; integrators must first confirm their wallet supports such signatures. Never request secret seeds or private keys.

## Canonical signed request (#6–#7)

`canonicalizeRecoveryRequest(untrusted)` enforces the exact v1 field set and returns deterministically ordered UTF-8 JSON with a 2048-byte limit. All amounts use exact canonical decimal stroops; network `testnet`/`public`, ledger tx hash, **zero-based operation index**, actual original sender, recipient, issuer-qualified asset, original amount, requested amount, return destination, domain, nonce, issuedAt and expiresAt are bound. Request TTL is at most 86400 seconds. Unknown fields, invalid precision, missing credit issuer and overclaims are rejected. Schema: `schemas/recovery-request.v1.json`; the TypeScript validator additionally enforces StrKey checksums, bounded TTL, origin validation, canonical amounts and cross-field comparisons.

Message to sign with wallet Ed25519 private key (held *only in wallet*) is the **exact** UTF-8 bytes:

```text
stellar-reclaim.recovery-request.v1\n<network passphrase>\n<canonical JSON>
```

`recoveryRequestDigest(request)` = lowercase hex SHA-256 of those bytes. Deterministic golden vector: version `1`, domain `https://reclaim.example`, network `testnet`, hash `aa…aa` (64 a), index `0`, sender/recipient/return destination `GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF`, native asset, original amount `12.3456789`, requested `12`, nonce `11…11` (64 ones), issuedAt `1800000000`, expiresAt `1800000300`; digest:

```text
47a0e835450499609864c3725f4f4833caf742a8280f11c21ab907b4addc61a5
```

`verifyRecoveryRequest({request,signature,lookup,domain,now,store})` verifies signer control using the original **operation** source, checks the exact normalized finalized payment and asset, then inserts one request under atomic uniqueness constraints. Pass `lookup` **only from the pinned-network `StellarLedgerClient.lookup`**, not user-supplied JSON; Horizon is not cryptographic proof of chain finality. Only classic G original senders are supported; an M original sender explicitly returns `unsupported` because its underlying G signature cannot prove user control of the muxed subaccount. Requests do not transfer funds or compel consent. Signature verification does not prove real-world ownership of a recipient address.

## SQLite adapter and migrations (#8)

`new RecoveryStorage('/persistent/path/reclaim.sqlite')` applies `001_init.sql`, enables foreign keys, WAL and a busy timeout. Callers **must** use a persistent writable disk; avoid `:memory:` in production and ensure exclusive application control of this file. `issueChallenge`/`consumeChallenge` and `recordVerifiedRequest` use `BEGIN IMMEDIATE` / commit / rollback. Unique indexes prevent duplicate `(network, sender, nonce)` and `(network, txHash, operationIndex)` requests and duplicate receipts; foreign keys prevent orphan decisions/receipts. The migration has an explicit version record and can run idempotently. A new migration is needed for future schema changes.

`recordRecipientDecision` and `recordSettlementReceipt` are **storage-only** helpers, not proof validators. Upstream code MUST verify the recipient's signature and separately reconcile a finalized voluntary return payment (network, asset, destination, amount, operation) before storing these records. Never interpret a database row alone as consent or completed refund. This branch does not expose these methods as untrusted HTTP endpoints.

## Validation and operational limits

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Tests use generated local Ed25519 keys, deterministic mock ledger records and temporary SQLite files (including two-connection write contention and reopening). They do not establish deployment or real testnet transactions. SQLite support in Node 22.16.0 is experimental; review runtime compatibility and use a mature database service/migration tool for larger multi-instance production deployments. Run load testing and external security review before accepting user funds or sensitive personal information.
