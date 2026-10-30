# Stellar Reclaim

A proposed **voluntary**, non-custodial recovery-coordination protocol for mistaken Stellar payments. There is no mechanism to undo an irreversible transfer or compel repayment.

## Current state

This repository has a working TypeScript workspace, a bounded read-only Stellar Horizon client, and lossless payment normalization from Issues #1–#4. The Issues #5–#8 contribution adds domain/network-bound Ed25519 ownership challenges, versioned canonical recovery request signing and verification, replay protection, and an SQLite migration plus durable request/decision/receipt persistence.

**Not yet available:** deployed product, wallet integration, public request API, recipient inbox, validated recipient consent, or genuine testnet refund reconciliation. Unit tests use generated keys, isolated mock ledger responses and a temporary local database, not real Stellar network settlement. No private keys are held by this service.

## Local development

Requirements: Node >=22.16, pnpm 9.15.9 via Corepack. From repository root:

```sh
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm example -- --amount 12.3456789
```

The example outputs exact stroops without floating-point rounding. Read-only client usage:

```ts
import {StellarLedgerClient,normalizePayment} from './packages/ledger/src/index.ts';
const tx = await new StellarLedgerClient('testnet').lookup('YOUR_64_CHARACTER_TRANSACTION_HASH');
const payment = normalizePayment(tx, 0);
console.log(payment); // only successful supported payments
```

For authenticated challenges, canonical signed payload bytes, digest vectors, the SQLite API, and explicit security limitations, see [Authenticated requests and storage](docs/security-protocol.md).

Never pass a secret seed to this service. The API does not sign or submit transactions. No arbitrary public RPC URLs are accepted; network identity is checked against the Stellar passphrase.

## Documentation

- [Product protocol and sequence](docs/product-spec.md)
- [Authenticated requests and storage](docs/security-protocol.md)
- [Threat model and unsupported cases](docs/threat-model.md)
- [Roadmap](docs/ROADMAP.md)
- [Issues](https://github.com/SoraClipse/Stellar-Reclaim/issues)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## License

Apache-2.0, see [LICENSE](LICENSE). Independent open-source project, not an official SDF or Drips product.
