# Security policy — Stellar Reclaim

## Current security posture

**Development-stage project.** There is no claim of an audited, production-ready release. Treat examples and planned modules as experimental until actual code, tests, deployment evidence, and independent review are available.

The protocol coordinates voluntary recovery requests. It cannot reverse a settled Stellar transfer or require a third party to send funds. Do not supply seed phrases, suggest a hidden admin recovery function, or interpret unverified transaction data as settled refunds.

## Reporting a vulnerability privately

Use GitHub's **Report a vulnerability** button under this repository's Security tab **if private vulnerability reporting is enabled**. Otherwise, contact the repository maintainers privately through an established organization contact channel before sharing exploit specifics. Never post wallet keys, personal information, active attack steps, or unpatched exploit details in a public issue.

Include affected commit/tag, vulnerable component and network, concise impact, minimal safe reproduction, and mitigations if known. Do not test against third-party users or real funds without authorization.

## Security review scope

Threats to consider include Sender signature impersonation, replay, wrong-network and wrong-operation references, spoofed asset issuers, recipient harassment, private request disclosure, false refund receipts, unbounded external API calls and duplicate crediting.

Security-sensitive PRs should include negative tests, access-control tests, boundary checks, and a written summary of the trust model. Never claim an audit or bug bounty program exists unless it has actually been established.

## Dependencies and disclosures

Use maintained dependencies and reproducible lockfiles where applicable. Report vulnerabilities responsibly; any remediation timeline must be agreed with the maintainers and cannot be promised here. Before production use, require external review appropriate to asset custody, authentication, and financial-loss risk.
