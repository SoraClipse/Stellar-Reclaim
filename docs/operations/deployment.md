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
corepack pnpm api
```

The `verify.sh` script uses `--frozen-lockfile`, lint, TypeScript typecheck,
all offline unit tests, build and `git diff --check`. The API runs locally
and is **not** suitable for exposing to the public internet. See
[the existing API/UI prototype notes](../issues-13-16.md) for route details.

## CI and secrets

Pull requests and pushes to `main` run GitHub Actions with read-only
repository permission, pinned Node version, lockfile-based installation,
checks and a high-severity dependency audit. CI requires **no wallet seeds,
token secrets, production keys or privileged repo tokens**. The audit may
fail if advisories or the registry are unavailable; review the actual output.
Passing CI demonstrates only the scoped checks, not a formal security audit.

## Before any public deployment

Implement durable authenticated request/consent verification, transactional
settlement reconciliation and deduplication, trusted proxy/HTTPS configuration,
distributed abuse controls, careful privacy handling and security review.
Confirm cross-wallet compatibility independently. Never put wallet secret
seeds in environment variables, logs, repository settings or client-side code.

Live Testnet verification is opt-in; see [Testnet procedure](../verification/testnet.md).
