# Changelog

All notable changes to **Cost AI 4 Claude** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-04-15

### First release

Initial public release of **Cost AI 4 Claude** (`cai4claude`) — a fork and rewrite of [codeburn](https://github.com/AgentSeal/codeburn) with native multi-host support for Claude Code fleets.

### Added (vs. upstream codeburn)

- **Multi-host architecture**
  - New YAML configuration at `~/.config/cai4claude/hosts.yaml` (permissions `0600`)
  - `cai4claude hosts list / add / remove / test` — full CRUD over remote hosts
  - Per-host fields: `name`, `ip`, `user`, `port`, `password`, `ssh_key`, `remote_path`, `enabled`
  - **Heterogeneous credentials supported** — each host can have its own user, port and auth method (SSH key or password)
- **Data synchronization**
  - `cai4claude sync [name]` — rsync `~/.claude` from one or all remote hosts over SSH
  - Parallel execution across hosts (best-effort, 5-minute timeout per host)
  - Local cache at `~/.cache/cai4claude/hosts/<name>/` with incremental rsync
- **Multi-host reporting**
  - Projects from remote hosts are prefixed `[hostname]` in every report
  - TUI, `status`, `today`, `month` commands all transparently aggregate across hosts
- **Prometheus exporter**
  - `cai4claude prometheus --period <today|week|month> --output <path>` emits [textfile format](https://github.com/prometheus/node_exporter#textfile-collector)
  - Metrics: `cai4claude_cost_usd_total`, `cai4claude_api_calls_total`, `cai4claude_tokens_input_total`, `cai4claude_tokens_output_total`, `cai4claude_tokens_cache_read_total`, `cai4claude_tokens_cache_write_total`
  - Labels: `host`, `period`, `project` (optional)
- **Grafana dashboard**
  - `grafana/dashboard.json` — 9 pre-built panels (cost per host, API calls, active hosts, top projects, token breakdown)
  - Ready to import via Grafana UI
- **Cron automation**
  - `scripts/cai4claude-hourly.sh` — bundled hourly sync + Prometheus export
  - Suitable for `crontab` or systemd timers
- **CAI Technology branding**
  - CLI name renamed to `cai4claude`
  - Package renamed to `cai4claude` on npm
  - Documentation rewritten in English with modern Markdown

### Preserved from codeburn

All of the following functionality is inherited unchanged:

- Reading session data directly from disk — no API keys, no proxy, no telemetry
- 13 task category classifier (coding, debugging, testing, etc.)
- One-shot success rate tracking
- Claude Code + Claude Desktop session parsers
- OpenAI Codex session parser
- Cursor IDE SQLite adapter (with `better-sqlite3` optional dependency)
- Interactive TUI dashboard built with [Ink](https://github.com/vadimdemedes/ink) + React
- CSV/JSON exporters (`cai4claude export -f <format>`)
- Currency conversion (ISO 4217) via `cai4claude currency <CODE>`
- Model pricing data derived from LiteLLM
- Task retry / one-shot / edit heuristics
- Result caching for expensive session parses

### Dependencies added

- `js-yaml ^4.1.0` + `@types/js-yaml ^4.0.9` — for `hosts.yaml` parsing

### Dependencies unchanged

- `chalk`, `commander`, `ink`, `react`, `better-sqlite3` (optional) — all inherited from upstream

---

## Attribution

**Cost AI 4 Claude** is a derivative work of **codeburn** by [AgentSeal](https://github.com/AgentSeal), released under the MIT License. This fork is also MIT-licensed.

Full upstream source: https://github.com/AgentSeal/codeburn
