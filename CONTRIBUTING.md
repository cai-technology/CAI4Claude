# Contributing to Cost AI 4 Claude

Thank you for your interest in contributing! This document describes how to report bugs, propose features and submit pull requests.

## Ways to contribute

- 🐛 **Bug reports** — open a [GitHub issue](https://github.com/cai-technology/CAI4Claude/issues)
- 💡 **Feature requests** — same place; please search existing issues first
- 📖 **Documentation** — typos, clarifications, new sections in `README.md`
- 🔧 **Code** — bug fixes and features via pull request

---

## Development setup

```bash
git clone https://github.com/cai-technology/CAI4Claude.git
cd CAI4Claude
npm install
npm run dev        # tsx watch mode
npm run build      # tsup bundle
npm test           # vitest
```

Node.js ≥ 20 is required. We use TypeScript in strict mode.

---

## Branch & commit conventions

- Branch off `main`. Name your branch descriptively: `feat/hosts-yaml-encryption`, `fix/rsync-timeout`.
- Follow [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat:` — new feature
  - `fix:` — bug fix
  - `docs:` — documentation only
  - `refactor:` — code change that is neither a feature nor a bug fix
  - `test:` — adding/updating tests
  - `chore:` — tooling, dependencies, etc.

Example:
```
feat(hosts): add per-host remote_path override

Allow users to specify a non-default location for ~/.claude on
remote hosts, e.g. when Claude Code is installed under a service account.
```

---

## Pull request checklist

Before submitting a PR, please make sure:

- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] No secrets, tokens or IP addresses committed
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] Commits squashed into logical units

A maintainer will review within a few business days. For urgent security issues, follow [SECURITY.md](SECURITY.md).

---

## Code style

- **TypeScript strict mode** — no `any` unless unavoidable
- **No comments describing _what_ the code does** — let identifiers speak. Comments should only explain _why_ a non-obvious decision was made.
- **One export per file** where reasonable
- **Prefer `async/await` over raw promises**
- **Tests** in `tests/` mirroring `src/` structure

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
