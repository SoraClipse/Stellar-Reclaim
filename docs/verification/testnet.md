# Live Stellar Testnet recovery verification

**Status: not yet evidenced by this repository.** This is a repeatable opt-in
integration test, not proof that live payments have already occurred. No real
transaction hashes or completed Testnet scenario are committed.

## Prerequisites

Use three publicly verifiable, finalized Stellar **Testnet** classic payment
operations. Send test XLM from A to B (original), then have B voluntarily send
a strictly smaller amount back to A (partial) and the remaining amount back
to A (final). Obtain hashes and zero-based operation indexes from a trusted
Testnet Horizon explorer/API. Never use secret seeds or private keys in CI.
Ensure these are distinct operations and the returned asset and issuer match.

The Testnet account owner must explicitly consent to both return payments
in their own wallet. A request, a recipient's refusal, or an accepted recovery
does not authorize Stellar Reclaim to move any funds.

## Run

From a fresh clone, install the locked dependencies, then set the following
variables in your local shell (replace the markers with your **own real hashes**):

```sh
corepack enable
corepack pnpm install --frozen-lockfile
export RECLAIM_ORIGINAL_TX=YOUR_REAL_ORIGINAL_64_HEX_HASH
export RECLAIM_PARTIAL_TX=YOUR_REAL_PARTIAL_64_HEX_HASH
export RECLAIM_FINAL_TX=YOUR_REAL_FINAL_64_HEX_HASH
export RECLAIM_ORIGINAL_OP=0
export RECLAIM_PARTIAL_OP=0
export RECLAIM_FINAL_OP=0
node --experimental-strip-types --test tests/e2e/testnet-recovery.test.mjs
```

The test refuses missing/malformed hashes; reads the real Testnet Horizon
network passphrase, transaction success and operations; normalizes exact
stroops; checks strong refund operation identity, direction, asset, partial
and full amounts; and asserts refusal, no-consent and wrong-network paths.
It does not submit payments or persist settlement to a deployed database.

## Evidence checklist

Record the execution date (UTC), Git commit SHA, redacted account identifiers
(if publishing), three public Testnet transaction hashes, operation indexes,
and a link to a passing run. Stellar transaction hashes are **public**, not
secrets; never substitute fabricated hashes or fixture-only tests for evidence.
Retain the public Horizon response / explorer URLs for independent inspection:

- `https://horizon-testnet.stellar.org/transactions/<hash>`
- `https://horizon-testnet.stellar.org/transactions/<hash>/operations`

The test has not verified deployed API request authentication, durable
settlement storage or production safety. Testnet funds have no monetary value.
Never run this flow on mainnet without separate security review.
