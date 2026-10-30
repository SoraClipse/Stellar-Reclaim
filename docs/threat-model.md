# Threat model: fail-closed voluntary recovery

## Trust boundaries

Network selection is explicit and a Horizon network passphrase must match. Horizon may be compromised or temporarily unavailable, so this milestone confirms response consistency and network identity but **does not authenticate the ledger cryptographically**. Do not allow unvalidated user-controlled RPC URLs. Limit response size (256 KiB), attempts (1–3), timeout (100–20000 ms), operations (100), JSON shape, and redirect behavior. No request accepts external paging URLs.

## Attack scenarios and controls

| Attack | Initial mitigation / later requirement |
| --- | --- |
| Attacker links an unrelated transfer as their own | Per-operation source validation now; signed source-account challenge to be implemented in later issues. |
| Testnet payment used on Public | Fixed network-specific Horizon base URL and exact root passphrase equality. |
| Mismatched XLM/USDC issuer | Asset identity preserves credit code **and** full issuer; unknown/missing issuers rejected. |
| Silent rounding | Integer BigInt stroops only; reject imprecise decimals and out-of-range amounts. |
| SSRF via operation pagination | Construct local path from validated transaction hash and numeric cursor; reject redirects. |
| API/provider hangs, malfunctions or consumes memory | Timeout, bounded attempts, response byte cap and parse failure categories. |
| Failed or pending transaction shown as settled | Successful transaction/operation required; otherwise explicit error. |
| Recipient harassment/spam | Not solved here; recipient-only verified inbox and anti-spam limits required before launch. |
| Forged recipient consent, cross-origin replay | Not solved here; domain-bound authenticated signatures and nonce uniqueness required. |
| Exchange/contract recipient | Unsupported until custody-specific consent and provenance can be proven. |
| Fake return receipts | Not solved; refund matching and durable transaction reconciliation required. |

## Limitations of this milestone

This code is **read-only**. No funds, secrets, approval, signing, request creation, settlement, custody or live RPC test evidence. Some valid Stellar operations are intentionally rejected rather than guessed. Do not treat an unsupported refund as a bug in a deployed consumer recovery service; this foundational component is not a deployed consumer service.

## New coordination-layer requirements (#9–#12)

A typed HTTP router and deterministic state machine are included, but the router is only secure when deployed with cryptographically verified wallet/session and payload/consent signers, fail-closed rate limiting, and durable atomic unique constraints. Acceptance and submitted refund hashes never count as settlement. Actual refund reconciliation requires a finalized successful matching ledger payment and an atomic, globally unique operation claim across requests. Unit mocks are not production controls or live testnet evidence.
