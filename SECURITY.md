# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `0.1.x` (main) | Yes |
| Older / unreleased forks | Best effort only |

OpenPress is under active development. Security fixes are applied to the latest `main` branch first.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately so we can fix the issue before it is disclosed:

1. Prefer **GitHub Security Advisories** on this repository:
   - https://github.com/foisalislambd/openpress/security/advisories/new
2. If advisories are unavailable, open a **private** contact with the maintainers (do not post exploit details in a public issue).

Include as much detail as you can:

- Description of the issue and impact
- Steps to reproduce (PoC if possible)
- Affected version / commit
- Suggested fix (optional)

## What to expect

- We will acknowledge receipt when we can (typically within a few days).
- We will investigate and work on a fix for confirmed issues.
- We may ask for more details or a minimal reproduction.
- Once a fix is released, we may credit you in the advisory or changelog (unless you prefer to stay anonymous).

## Scope

In scope examples:

- Auth / JWT issues (token leakage, privilege escalation)
- Broken access control on admin or API routes
- Injection, XSS, or unsafe handling of uploaded themes/plugins
- Secrets committed to the repo or unsafe defaults in production docs

Out of scope examples:

- Denial of service from unbounded legitimate traffic alone
- Issues only present with intentionally malicious self-hosted plugins/themes the operator installed
- Social engineering of individual operators

## Production hardening

Operators should follow [docs/deployment.md](docs/deployment.md):

- Change all JWT / session secrets
- Use HTTPS and a strong `DATABASE_URL`
- Only install trusted themes and plugins
- Keep Node.js and dependencies updated

Thank you for helping keep OpenPress and its users safe.
