# Contributing to Stellar Reclaim

Thank you for improving an open-source Stellar/Soroban project. This repository is at an **early development stage**, and its [engineering roadmap](docs/ROADMAP.md) is a specification of work to be delivered, not a claim that the product is already functional.

## Picking work

1. Browse [open issues](https://github.com/SoraClipse/Stellar-Reclaim/issues), particularly P0 issues required for the submission baseline. Avoid picking dependent issues before the shared foundations exist.
2. Comment with the intended approach and ask a maintainer to confirm overlapping changes, trust assumptions and interface decisions.
3. Use a feature branch named `feat/<issue>-short-description` (or `fix/<issue>-short-description`).
4. Submit a narrow pull request against `main`. Cite the issue number, security considerations and how the code was validated.

## Delivery standard

- Implement real behavior; avoid empty adapters, misleading green tests, hard-coded success states, or demo-only claims.
- Cover successful operation, malformed input, unauthorized operation and appropriate failure paths in automated tests.
- Keep tests deterministic and offline by default. Clearly separate mocked fixtures from genuine Stellar testnet evidence.
- Do not add wallet seed phrases, production credentials, private transaction evidence, secrets, or personally identifying information to commits, logs or screenshots.
- Update affected documentation and add minimal examples demonstrating working behavior.
- Do not assume a package or CLI exists until the foundational issue that defines it has been merged; follow the setup instructions provided by the actual codebase.
- Treat frontend accessibility, bounded network IO, privacy and failure states as first-class requirements.

## Pull request template

**Issue:** Closes #<number> (only when the full acceptance criteria are met)

**What changed:** concise implementation summary

**Security and trust assumptions:** what is trusted, what is verified, known limitations

**Testing:** exact commands/results and any Testnet transaction references

**Reviewer notes:** migration, deployment and backward-compatibility considerations

## Security-sensitive changes

The protocol coordinates voluntary recovery requests. It cannot reverse a settled Stellar transfer or require a third party to send funds. Do not supply seed phrases, suggest a hidden admin recovery function, or interpret unverified transaction data as settled refunds.

For vulnerabilities, do not disclose exploit details in public issues. See [SECURITY.md](SECURITY.md).

## Drips Wave

No issue is automatically part of Stellar Wave. Only approved repositories and issues officially selected for a Wave are eligible for program-specific participation. Do not label or promise rewards on behalf of Drips.
