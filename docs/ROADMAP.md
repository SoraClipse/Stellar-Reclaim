# Stellar Reclaim engineering roadmap

> **Status:** Early engineering backlog. Planned features below are **not** implemented or verified merely because these issues exist. Maintainers should not advertise public-network readiness before independent review and reproducible testnet evidence.

## Product boundary

Non-custodial coordination of voluntary mistaken-payment refunds; the protocol cannot reverse Stellar payments, guarantee a response, or compel a refund.

## Submission baseline — P0 (19 issues)

These must be implemented, reviewed, and demonstrated before presenting the project as a functioning testnet product. Work is sequenced by actual dependencies; do not infer parallel independence from issue numbering.

- [#1 — Define signed recovery protocol, threat model and no-reversal guarantees](https://github.com/SoraClipse/Stellar-Reclaim/issues/1)
- [#2 — Bootstrap a reproducible TypeScript workspace with working tests](https://github.com/SoraClipse/Stellar-Reclaim/issues/2)
- [#3 — Implement a bounded read-only Stellar network adapter](https://github.com/SoraClipse/Stellar-Reclaim/issues/3)
- [#4 — Normalize supported XLM and issued-asset payment operations](https://github.com/SoraClipse/Stellar-Reclaim/issues/4)
- [#5 — Verify network-bound Stellar wallet ownership challenges](https://github.com/SoraClipse/Stellar-Reclaim/issues/5)
- [#6 — Specify canonical versioned recovery request payloads](https://github.com/SoraClipse/Stellar-Reclaim/issues/6)
- [#7 — Implement request signature validation and replay resistance](https://github.com/SoraClipse/Stellar-Reclaim/issues/7)
- [#8 — Add durable request, consent and receipt database schema](https://github.com/SoraClipse/Stellar-Reclaim/issues/8)
- [#9 — Implement a fail-closed recovery request lifecycle engine](https://github.com/SoraClipse/Stellar-Reclaim/issues/9)
- [#10 — Expose verified sender lookup and recovery creation endpoints](https://github.com/SoraClipse/Stellar-Reclaim/issues/10)
- [#11 — Create recipient-authorized recovery inbox and consent API](https://github.com/SoraClipse/Stellar-Reclaim/issues/11)
- [#12 — Verify voluntary refund settlement and prevent double counting](https://github.com/SoraClipse/Stellar-Reclaim/issues/12)
- [#13 — Add wallet enumeration defenses, rate limits and safe logging](https://github.com/SoraClipse/Stellar-Reclaim/issues/13)
- [#14 — Build sender payment lookup and signed request page](https://github.com/SoraClipse/Stellar-Reclaim/issues/14)
- [#15 — Build recipient inbox and opt-in decision interface](https://github.com/SoraClipse/Stellar-Reclaim/issues/15)
- [#16 — Render redacted status pages and independently verifiable receipts](https://github.com/SoraClipse/Stellar-Reclaim/issues/16)
- [#17 — Run a genuine Testnet payment and voluntary-refund integration scenario](https://github.com/SoraClipse/Stellar-Reclaim/issues/17)
- [#18 — Require reproducible builds and automated security-oriented checks](https://github.com/SoraClipse/Stellar-Reclaim/issues/18)
- [#19 — Publish complete README, contributor guide and honest security limitations](https://github.com/SoraClipse/Stellar-Reclaim/issues/19)

## Contributor extensions — P1 (7 issues)

These are real follow-up technical opportunities, not claims of present functionality. Reassess scopes as the architecture matures.

- [#20 — Build a sanitized Stellar payment fixture conformance corpus](https://github.com/SoraClipse/Stellar-Reclaim/issues/20)
- [#21 — Create an offline recovery request and receipt verification CLI](https://github.com/SoraClipse/Stellar-Reclaim/issues/21)
- [#22 — Publish a typed wallet integration adapter for recipient requests](https://github.com/SoraClipse/Stellar-Reclaim/issues/22)
- [#23 — Add recipient opt-in notifications without wallet address disclosure](https://github.com/SoraClipse/Stellar-Reclaim/issues/23)
- [#24 — Add resumable ledger checkpoints and reconciliation workers](https://github.com/SoraClipse/Stellar-Reclaim/issues/24)
- [#25 — Improve end-to-end accessibility of request and inbox journeys](https://github.com/SoraClipse/Stellar-Reclaim/issues/25)
- [#26 — Add bounded API load benchmarks and operational thresholds](https://github.com/SoraClipse/Stellar-Reclaim/issues/26)

## Launch evidence checklist

- [ ] Fresh-clone install/build instructions work.
- [ ] Functional product behavior is demonstrated end to end.
- [ ] Positive, negative, and adversarial tests run in CI.
- [ ] Signed and network-bound payment evidence, authentication and replay defense, consent-based recipient decisions, idempotent refund matching, privacy controls and reproducible testnet proof.
- [ ] Actual Stellar testnet transactions or Soroban invocations are recorded where relevant, with source links and reproducible instructions.
- [ ] Security and trust limits are documented; no public-funds guarantee is made.
- [ ] Deployment and operations are repeatable and secret-safe.
- [ ] Maintainers independently review claims before any Drips Stellar Wave application or issue nomination.

## Contributor workflow

Read [CONTRIBUTING.md](../CONTRIBUTING.md), select an open issue, discuss API and security assumptions with maintainers, and submit one focused PR with tests. Do not apply Stellar Wave reward labels unless the program approves the repository and selects the issue.
