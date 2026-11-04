# Stellar Reclaim

**Development-stage, Testnet-only verification. Not audited or production-ready.**

Stellar Reclaim is an open-source, **voluntary**, **non-custodial** coordination
tool for requesting the return of mistaken Stellar payments. It **cannot reverse
a settled transaction, freeze assets, compel a recipient, or send funds for a
recipient**. A recipient may refuse without any protocol penalty.

## Implemented and not implemented

Implemented in this repository: exact stroop arithmetic, bounded read-only
Horizon lookups and payment normalization, signed authentication primitives,
recovery lifecycle logic, an authenticated and SQLite-backed Testnet API, and
unit tests for operation matching, consent transitions and refund accounting.

**Not implemented/verified:** an audited or deployed service, full wallet
compatibility, end-to-end durable production settlement, live Testnet recovery
evidence, or automatic payment execution. The old ephemeral API was disabled; the prototype UI is not connected to the
new secure endpoints. Durable storage does not by itself establish production readiness. Unit tests and fixtures
are not proof of live Stellar settlement.

## Supported payments and wallets

Read-only ledger parsing covers successful classic payment and supported
path-payment operations on explicitly selected Stellar networks; the
voluntary refund matcher currently accepts **classic payment operations**
only, with matching network, asset, issuer and return destination. Contract
invocations and arbitrary operations are not eligible for refund matching.
The secure API uses domain/network-bound Ed25519 authentication and requires
correctly encoded signed messages. A real Freighter SEP-53 adapter has **not**
been certified or integrated; the legacy browser prototype is not connected.
Never enter or upload a wallet seed phrase.

## Fresh-clone development

Install Node.js >=22.16.0 and enable Corepack:

```sh
git clone https://github.com/SoraClipse/Stellar-Reclaim.git
cd Stellar-Reclaim
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
export RECLAIM_ORIGIN=http://127.0.0.1:8787
export RECLAIM_DB_PATH=./reclaim-testnet.sqlite
corepack pnpm api
```

Or run `bash scripts/verify.sh` to run the complete offline verification.
The API is **local-development-only** and not production hardened.
To inspect real transactions, use `StellarLedgerClient('testnet')` and the
read-only lookup/normalization APIs; no secret key is required.

## Trust, privacy and limitations

Horizon responses are checked for network passphrase, successful transaction
and consistent operations. Network access does not independently prove the
honesty or availability of a Horizon server. Users must independently confirm
recipient identity, transaction hash and asset issuer. Recovery notes and
transaction metadata can be sensitive; do not publish identifying details,
use public CI artifacts for private evidence, or assume public ledgers are
private. SQLite persists signed requests and recipient decisions, but distributed abuse
limits, production privacy controls and verified refund reconciliation remain unfinished. A recipient's `accepted` status is **not** a refund;
a verified new transaction is required, and duplicate crediting must be
prevented by transactional persistent storage.

## Documentation

- [Authenticated SQLite Testnet API and launch gates](docs/operations/secure-api.md)
- [Development and deployment operations](docs/operations/deployment.md)
- [Opt-in real Testnet verification (evidence pending)](docs/verification/testnet.md)
- [Contribution guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Technical security protocol](docs/security-protocol.md)
- [Threat model](docs/threat-model.md)
- [Recovery coordination and refund matching](docs/implementation-9-12.md)
- [API/UI prototype caveats](docs/issues-13-16.md)
- [Product specification](docs/product-spec.md)
- [Engineering roadmap](docs/ROADMAP.md)
- [Open issues](https://github.com/SoraClipse/Stellar-Reclaim/issues)

Apache-2.0 licensed; see [LICENSE](LICENSE). Independent project, not an
official Stellar Development Foundation or Drips release.
