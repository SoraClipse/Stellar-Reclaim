# Contributing

Stellar Reclaim coordinates **voluntary** mistaken-payment requests. It cannot
reverse transfers or enforce repayment. This repository remains experimental.

## Getting started

Read [README](README.md), [deployment operations](docs/operations/deployment.md)
and [security policy](SECURITY.md). Use Node >=22.16 and Corepack pnpm 9.15.9:

```sh
corepack enable
bash scripts/verify.sh
```

For local standalone verification:
`corepack pnpm install --frozen-lockfile`, then `corepack pnpm lint`,
`corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`.

## Submit a change

Choose an [open issue](https://github.com/SoraClipse/Stellar-Reclaim/issues),
discuss trust boundaries and dependencies with maintainers, then create a
focused feature branch. Add positive/negative deterministic tests; avoid
hard-coded success, mock-only network claims, or uncontrolled external calls.
Document changes, unsupported cases, proof and exact commands in your PR.
Link issues with `Closes #N` only when each acceptance criterion is met.
Never submit wallet seeds, private credentials or personal data.

For live transactions follow the [opt-in Testnet steps](docs/verification/testnet.md).
A passing offline test does not verify live Testnet execution. Changes to
signing, privacy, refund accounting or network verification require explicit
threat-model review and fail-closed behavior.

No issue is automatically approved for any reward program; participation
requires separate official project and issue approval.
