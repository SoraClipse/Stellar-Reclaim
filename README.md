# Stellar Reclaim

A proposed **voluntary**, non-custodial recovery-coordination protocol for mistaken Stellar payments. There is no mechanism to undo an irreversible transfer or compel repayment.

## Current state

This first implementation PR covers Issues #1–#4 only: a signed recovery protocol **specification** (not a signed-request implementation), a working TypeScript workspace, a bounded read-only Stellar Horizon client, and lossless payment normalization. There is **no** deployed product, connected wallet, request API, or actual payment recovery yet. Unit tests use isolated mocked ledger responses; a live network demonstration is future work.

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

Never pass a secret seed to this service. The API does not sign or submit transactions. No arbitrary public RPC URLs are accepted; network identity is checked against the Stellar passphrase.

## Documentation

- [Product protocol and sequence](docs/product-spec.md)
- [Threat model and unsupported cases](docs/threat-model.md)
- [Roadmap](docs/ROADMAP.md)
- [Issues](https://github.com/SoraClipse/Stellar-Reclaim/issues)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## License

Apache-2.0, see [LICENSE](LICENSE). Independent open-source project, not an official SDF or Drips product.
