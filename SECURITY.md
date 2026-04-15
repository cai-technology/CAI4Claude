# Security Policy

## Supported versions

Only the latest minor release receives security updates.

| Version | Supported |
|---------|:---------:|
| 1.0.x   | ✅ |
| < 1.0   | ❌ |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, email **tehnic@finesynergy.eu** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any proof-of-concept code (optional)

You should receive an acknowledgment within 72 hours. If the vulnerability is confirmed, we will:

1. Work with you on a fix
2. Release a patch as soon as possible
3. Publicly disclose the issue after the fix is available, crediting you if you wish

Thank you for helping keep the Cost AI 4 Claude users safe.

---

## Threat model

Cost AI 4 Claude handles potentially sensitive data:

- **SSH credentials** (private keys, passwords) in `~/.config/cai4claude/hosts.yaml`
- **Claude Code session content** (prompts, responses, code snippets) synced from remote hosts
- **Project names and task categories** exposed as Prometheus labels

### Mitigations in place

- `hosts.yaml` is written with `0600` permissions
- Remote cache at `~/.cache/cai4claude/hosts/` inherits user-only permissions
- No telemetry or outbound network calls except to user-configured SSH hosts and LiteLLM pricing feed
- All source code is auditable (MIT, public)

### Known risks

- Passwords in `hosts.yaml` are **stored in plaintext**. SSH key authentication is strongly preferred.
- `StrictHostKeyChecking=no` is used by default. Override if running over untrusted networks.
- Session data synced from remote hosts is **not encrypted at rest** on the local machine.

If your threat model requires stronger guarantees (full disk encryption of cache, encrypted config), open an issue — we are happy to discuss additions.
