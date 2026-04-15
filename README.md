<div align="center">

# Cost AI 4 Claude

### Multi-host observability for Claude Code

**Aggregate token usage, costs and task categories across all your machines — in one TUI, one dashboard, one Prometheus endpoint.**

[![CI](https://github.com/cai-technology/CAI4Claude/actions/workflows/ci.yml/badge.svg)](https://github.com/cai-technology/CAI4Claude/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![GitHub release](https://img.shields.io/github/v/release/cai-technology/CAI4Claude?color=blue)](https://github.com/cai-technology/CAI4Claude/releases)
[![GitHub stars](https://img.shields.io/github/stars/cai-technology/CAI4Claude?style=social)](https://github.com/cai-technology/CAI4Claude/stargazers)
[![Based on Codeburn](https://img.shields.io/badge/based%20on-codeburn-orange.svg)](https://github.com/AgentSeal/codeburn)

[Installation](#installation) · [Quick Start](#quick-start) · [Multi-host](#multi-host-setup) · [Prometheus + Grafana](#prometheus--grafana-integration) · [Commands](#command-reference)

</div>

---

## What is this?

**Cost AI 4 Claude** (CLI: `cai4claude`) is a zero-dependency, privacy-first observability tool for [Claude Code](https://claude.com/claude-code). It reads session data directly from disk — **no API keys, no proxy, no telemetry** — and tells you exactly where your tokens and money go.

The killer feature: **it aggregates usage across any number of remote machines**. If you (or your team) run Claude Code on multiple servers, laptops, VMs or cloud instances, Cost AI 4 Claude syncs the session data over SSH and gives you a single unified report.

### Why?

If you've been using Claude Code for more than a week, you probably don't know:

- **How much did you actually spend today / this month?**
- **Which projects are burning the most tokens?**
- **Which tasks have the lowest one-shot success rate** (i.e. where Claude burns tokens on retries)?
- **How does cost distribute across your dev machines, CI runners, and production boxes?**

Cost AI 4 Claude answers all of these in under 5 seconds.

---

## Features

- **Multi-host aggregation** — one command syncs `~/.claude` from any number of remote hosts via SSH/rsync
- **Interactive TUI dashboard** — navigate cost breakdowns by day / week / month, per project, per model, per task category
- **13 task categories** auto-classified: coding, debugging, feature dev, refactoring, testing, exploration, planning, delegation, git, build/deploy, conversation, brainstorming, general
- **One-shot success rate** — tracks which tasks Claude nails first-try vs. which ones require multiple retries
- **Prometheus exporter** — textfile format for `node_exporter`, with `host` and `project` labels
- **Grafana dashboard** — 9 pre-built panels (cost per host, API calls, token distribution, top projects)
- **Privacy-first** — reads session data only from local disk and from SSH-accessible hosts you explicitly configure. Zero data leaves your infrastructure.
- **Claude Code, Claude Desktop, Codex, Cursor** — all supported providers inherited from upstream
- **Currency conversion** — display costs in any ISO 4217 currency (USD, EUR, RON, GBP, etc.)
- **Export to CSV/JSON** — for spreadsheet analysis or long-term archival

---

## Installation

### Prerequisites

- **Node.js ≥ 20**
- **`rsync`** (usually pre-installed on Linux/macOS)
- **`sshpass`** (optional — only if you want to use password-based SSH auth; prefer SSH keys)

### Install from source

```bash
# GitHub (public)
git clone https://github.com/cai-technology/CAI4Claude.git
cd CAI4Claude

# Or from GitLab mirror (internal)
# git clone https://git.finesynergy.eu/gelusi/cai4claude.git

npm install
npm run build
npm install -g .
```

The binary is installed as `cai4claude`.

### Verify

```bash
cai4claude --version
cai4claude --help
```

---

## Quick Start

### Single-host mode

If you only use Claude Code on this machine:

```bash
# Compact one-liner status
cai4claude status

# Full interactive dashboard
cai4claude report

# Today / this month breakdown
cai4claude today
cai4claude month

# Change display currency
cai4claude currency EUR

# Export to JSON / CSV for analysis
cai4claude export -f json -o ~/usage.json
```

That's it for single-host usage. The magic starts when you have **multiple machines** running Claude Code.

---

## Multi-host Setup

### 1. Add your remote hosts

```bash
# SSH key auth (recommended)
cai4claude hosts add laptop 192.168.1.10 alice --key ~/.ssh/id_ed25519

# Password auth (requires: apt install sshpass)
cai4claude hosts add dev-box 10.0.0.42 bob --password 'hunter2'

# Custom SSH port
cai4claude hosts add prod-runner 203.0.113.5 deploy --key ~/.ssh/id_rsa --port 2222

# Different usernames per host are fully supported
cai4claude hosts add ci-runner 203.0.113.6 github-actions --key /opt/keys/ci.pem
```

Host metadata is stored at `~/.config/cai4claude/hosts.yaml` with permissions `0600`.

### 2. List & test connectivity

```bash
cai4claude hosts list
cai4claude hosts test          # probe all hosts
cai4claude hosts test laptop   # probe one
```

Output:

```
  NAME                IP                USER        AUTH      STATUS
  ──────────────────────────────────────────────────────────────────────
  laptop              192.168.1.10      alice       key       enabled
  dev-box             10.0.0.42         bob         password  enabled
  prod-runner         203.0.113.5       deploy      key       enabled
```

### 3. Sync session data

```bash
cai4claude sync              # rsync all hosts (parallel)
cai4claude sync laptop       # sync one host only
cai4claude sync -v           # verbose rsync output
```

Data is cached locally at `~/.cache/cai4claude/hosts/<name>/` — only incremental changes are transferred on subsequent runs.

### 4. View the aggregated report

```bash
cai4claude report            # TUI with all hosts merged
cai4claude status            # one-line multi-host summary
```

In reports, projects coming from remote hosts are prefixed with `[hostname]`, so you can instantly see where each chunk of usage comes from.

### 5. Keep it fresh (cron)

Sync hourly and emit Prometheus metrics in one shot using the bundled script:

```bash
crontab -e
```
```cron
5 * * * * /usr/local/bin/cai4claude-hourly.sh >> /var/log/cai4claude/hourly.log 2>&1
```

The script is at [`scripts/cai4claude-hourly.sh`](scripts/cai4claude-hourly.sh).

---

## `hosts.yaml` reference

Edit manually if you prefer. Example:

```yaml
hosts:
  - name: laptop
    ip: 192.168.1.10
    user: alice
    ssh_key: /home/alice/.ssh/id_ed25519
    # password: hunter2              # alternative, needs sshpass
    port: 22                         # default 22
    remote_path: ~/.claude           # default ~/.claude
    enabled: true                    # default true; set false to skip
  - name: dev-box
    ip: 10.0.0.42
    user: bob
    ssh_key: /home/alice/.ssh/id_ed25519
```

Each host can have its own username, port, path and auth method — perfect for heterogeneous fleets.

---

## Prometheus + Grafana Integration

### 1. Install `node_exporter` with textfile collector

On Debian/Ubuntu:

```bash
sudo apt install prometheus-node-exporter
# Make sure it runs with: --collector.textfile.directory=/var/lib/node_exporter
```

### 2. Emit metrics

```bash
cai4claude prometheus --period today --output /var/lib/node_exporter/cai4claude.prom
```

### 3. Metrics exposed

| Metric | Type | Labels |
|--------|------|--------|
| `cai4claude_cost_usd_total` | gauge | `host`, `period`, `project` (optional) |
| `cai4claude_api_calls_total` | gauge | `host`, `period`, `project` (optional) |
| `cai4claude_tokens_input_total` | gauge | `host`, `period` |
| `cai4claude_tokens_output_total` | gauge | `host`, `period` |
| `cai4claude_tokens_cache_read_total` | gauge | `host`, `period` |
| `cai4claude_tokens_cache_write_total` | gauge | `host`, `period` |

Values for `period`: `today`, `week`, `month`.

### 4. Import the Grafana dashboard

1. Open Grafana → **+** → **Import**
2. Upload [`grafana/dashboard.json`](grafana/dashboard.json) (or paste the JSON)
3. Bind to your Prometheus data source

The dashboard includes **9 panels**:

| # | Panel | Chart type |
|---|-------|------------|
| 1 | Total Cost — Today | Stat (with color thresholds) |
| 2 | Total API Calls — Today | Stat |
| 3 | Total Cost — This Month | Stat |
| 4 | Active Hosts | Stat |
| 5 | Cost per Host — Today | Horizontal bar chart |
| 6 | API Calls per Host — Today | Horizontal bar chart |
| 7 | Top Projects — This Month | Table (top 20) |
| 8 | Input vs Output Tokens | Timeseries |
| 9 | Cache Read vs Cache Write | Timeseries |

---

## Command Reference

| Command | Description |
|---------|-------------|
| `cai4claude report` | Interactive TUI dashboard (default) |
| `cai4claude status` | Compact one-line summary (today + week + month) |
| `cai4claude today` | Today's breakdown |
| `cai4claude month` | Current month breakdown |
| `cai4claude export -f <json\|csv>` | Export raw usage data |
| `cai4claude currency [CODE]` | Show / set display currency (ISO 4217) |
| **`cai4claude hosts list`** | List configured remote hosts |
| **`cai4claude hosts add <name> <ip> <user>`** | Add/update a host |
| **`cai4claude hosts remove <name>`** | Remove a host |
| **`cai4claude hosts test [name]`** | Test SSH connectivity |
| **`cai4claude sync [name]`** | Rsync session data from remote hosts |
| **`cai4claude prometheus --period <p> --output <file>`** | Emit Prometheus metrics |

Run `cai4claude <command> --help` for per-command options.

---

## Security notes

- `hosts.yaml` is written with permissions **`0600`** (owner read/write only).
- **Prefer SSH keys over passwords.** If you must use a password, install `sshpass` and understand that it will be stored in plaintext in your config file.
- Remote sync uses `rsync -az` over SSH with `StrictHostKeyChecking=no`. This is appropriate for trusted LAN environments. For public-internet hops, enable strict host key checking by editing the `ssh` invocation in [`src/hosts.ts`](src/hosts.ts).
- Local cache lives at `~/.cache/cai4claude/hosts/` and is **not** purged automatically. Remove with `rm -rf ~/.cache/cai4claude/` if you rotate hosts or want a clean slate.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Remote Host A                  Remote Host B               │
│  ──────────────                 ──────────────              │
│  ~/.claude/projects             ~/.claude/projects          │
│         │                              │                    │
└─────────┼──────────────────────────────┼────────────────────┘
          │                              │
          ▼         rsync over SSH       ▼
┌─────────────────────────────────────────────────────────────┐
│  Local Machine                                              │
│                                                             │
│  ~/.cache/cai4claude/hosts/<name>/ ← synced, per-host       │
│  ~/.claude/                        ← local                  │
│                                                             │
│            │                                                │
│            ▼                                                │
│  ┌─────────────────────┐                                    │
│  │  Session Parser     │ classifies 13 task categories      │
│  │  Cost Calculator    │ uses LiteLLM-derived pricing       │
│  └──────────┬──────────┘                                    │
│             │                                               │
│      ┌──────┴──────────────────────────┐                    │
│      ▼              ▼         ▼         ▼                   │
│  ┌─────────┐  ┌────────┐  ┌─────────┐  ┌─────────────┐      │
│  │  TUI    │  │ CSV/   │  │ Status  │  │ Prometheus  │      │
│  │  (ink)  │  │ JSON   │  │  line   │  │  textfile   │      │
│  └─────────┘  └────────┘  └─────────┘  └──────┬──────┘      │
└───────────────────────────────────────────────┼─────────────┘
                                                ▼
                                        node_exporter → Prometheus → Grafana
```

---

## Development

```bash
npm run dev          # tsx watch mode (live reload)
npm run build        # tsup bundle (ESM, single file)
npm test             # vitest
```

Code layout:

```
src/
├── cli.ts                   # Commander entry point + all commands
├── parser.ts                # JSONL session parsing
├── classifier.ts            # Task categorization heuristics
├── dashboard.tsx            # Ink/React TUI
├── hosts.ts                 # Multi-host config + SSH sync (cai4claude addition)
├── models.ts                # Pricing data (LiteLLM-derived)
├── providers/
│   ├── claude.ts            # Claude Code + Desktop (multi-host aware)
│   ├── codex.ts             # OpenAI Codex sessions
│   └── cursor.ts            # Cursor IDE (SQLite)
├── export.ts                # CSV/JSON emitters
├── format.ts                # Terminal formatting helpers
├── currency.ts              # ISO 4217 conversion
└── config.ts                # User config persistence
```

---

## Credits

Cost AI 4 Claude is a **friendly fork and rewrite** of the excellent [**codeburn**](https://github.com/AgentSeal/codeburn) by [AgentSeal](https://github.com/AgentSeal). Codeburn pioneered the approach of reading Claude Code session data directly from disk and classifying tasks by category — we kept all of that goodness and extended it for multi-host fleet management, with a Prometheus exporter, a Grafana dashboard, and a proper `hosts.yaml` config.

Huge thanks to the codeburn maintainers for publishing under MIT, without which this project would not exist.

---

## License

**MIT**. See [`LICENSE`](LICENSE).

Derivative work of [AgentSeal/codeburn](https://github.com/AgentSeal/codeburn) (also MIT).

---

## About CAI Technology

Built by **[CAI Technology](https://ai.caitech.ro)** — engineering AI-first infrastructure and observability tooling.

If you find this useful, star the repo and share with a friend who also has runaway Claude Code bills. 🌟
