# Development and deployment operations

## Safe status

Stellar Reclaim is **Testnet-only for manual verification** and is not an
audited production payment service. The API, UI and libraries are development
components. No hosted production system, custody, reversal capability, or
automatic refunds are claimed. A Stellar transaction is final; repayment is
entirely voluntary and requires a new outgoing transfer by the recipient.

## Fresh clone

Requires Node.js 22.16+ and Corepack with pnpm 9.15.9:

```sh
git clone https://github.com/SoraClipse/Stellar-Reclaim.git
cd Stellar-Reclaim
corepack enable
bash scripts/verify.sh
export RECLAIM_ORIGIN=http://127.0.0.1:8787
export RECLAIM_DB_PATH=./reclaim-testnet.sqlite
corepack pnpm api
```

The `verify.sh` script uses `--frozen-lockfile`, lint, TypeScript typecheck,
all offline unit tests, build and `git diff --check`. The authenticated SQLite API listens on loopback, enables Testnet only and is
**not** suitable for exposing to the public internet. See the
[secure API reference](secure-api.md) for routes and remaining integration gates.
The old in-memory HTTP server has been deliberately disabled.

## CI and secrets

Pull requests and pushes to `main` run GitHub Actions with read-only
repository permission, pinned Node version, lockfile-based installation,
checks and a high-severity dependency audit. CI requires **no wallet seeds,
token secrets, production keys or privileged repo tokens**. The audit may
fail if advisories or the registry are unavailable; review the actual output.
Passing CI demonstrates only the scoped checks, not a formal security audit.

## Before any public deployment

Complete live wallet interoperability, automatic ledger indexing and multi-provider settlement reconciliation,
trusted proxy/HTTPS configuration,
distributed abuse controls, careful privacy handling and security review.
Confirm cross-wallet compatibility independently. Never put wallet secret
seeds in environment variables, logs, repository settings or client-side code.

Live Testnet verification is opt-in; see [Testnet procedure](../verification/testnet.md).
