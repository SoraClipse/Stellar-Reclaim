# Stellar Reclaim

**A proposed non-custodial protocol for coordinating voluntary refunds of mistaken Stellar payments.**

> **Project status: early development.** No recovery workflow is currently deployed, audited or independently tested here. The [open engineering issues](https://github.com/SoraClipse/Stellar-Reclaim/issues) specify what needs to be built and proven before a testnet submission. Opening a recovery request cannot reverse a settled blockchain payment or compel a recipient to cooperate.

## What problem are we addressing?

A Stellar user can accidentally send a payment to an unintended recipient, or select the wrong asset/operation. The transfer cannot simply be undone. Users need a way to show the original ledger transaction, ask a recipient to return it voluntarily, establish consent safely, and prove any subsequent refund without handing custody of funds to a platform.

## Planned user workflow

1. The sender selects the correct Stellar network and identifies an actual payment operation, including its asset identity and destination.
2. The sender proves control of the sending account and signs a narrowly scoped, expiring recovery request.
3. A participating recipient wallet (or opt-in inbox) authenticates the true recipient and displays the request without leaking private information.
4. The recipient can accept or decline. Acceptance **does not** automatically transfer assets; the recipient initiates any voluntary return using their own wallet.
5. The system confirms actual return payments from ledger evidence and produces a limited verifiable receipt, including partial returns when applicable.

## Core engineering principles

- **No custody or reversal claims:** The service never requests a seed phrase, moves funds on behalf of a user, or overrides Stellar finality.
- **Ledger correctness:** Exact network, operation, destination, amount, asset issuer, and transaction identifiers matter. Unsupported cases must fail clearly.
- **Anti-impersonation:** Sender and recipient requests and consent require domain/network-bound proofs and replay protection.
- **Safety:** Protect against spam, harassment, malicious links, duplicate refund credit and private request leakage.
- **Evidence over simulation:** Document real testnet evidence separately from unit tests and example fixtures.

## Project planning and contribution

- [Engineering roadmap and issue breakdown](docs/ROADMAP.md)
- [Open issues](https://github.com/SoraClipse/Stellar-Reclaim/issues)
- [Contributor guide](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)

All P0 issues must be implemented and validated before the maintainer describes a functioning testnet submission. P1 issues are future contributor opportunities, not rewards or approved program tasks. This repository is independent and does not imply endorsement by the Stellar Development Foundation or Drips.

## License

See [LICENSE](LICENSE).
