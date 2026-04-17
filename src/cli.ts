import { Command } from 'commander'
import { exportCsv, exportJson, type PeriodExport } from './export.js'
import { loadPricing } from './models.js'
import { parseAllSessions } from './parser.js'
import { renderStatusBar } from './format.js'
import { installMenubar, renderMenubarFormat, type PeriodData, type ProviderCost, uninstallMenubar } from './menubar.js'
import { CATEGORY_LABELS, type DateRange, type ProjectSummary, type TaskCategory } from './types.js'
import { renderDashboard } from './dashboard.js'
import { getAllProviders } from './providers/index.js'
import { readConfig, saveConfig, getConfigFilePath } from './config.js'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { version } = require('../package.json')
import { loadCurrency, getCurrency, isValidCurrencyCode } from './currency.js'

function getDateRange(period: string): { range: DateRange; label: string } {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  switch (period) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      return { range: { start, end }, label: `Today (${start.toISOString().slice(0, 10)})` }
    }
    case 'yesterday': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
      const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999)
      return { range: { start, end: yesterdayEnd }, label: `Yesterday (${start.toISOString().slice(0, 10)})` }
    }
    case 'week': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
      return { range: { start, end }, label: 'Last 7 Days' }
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { range: { start, end }, label: `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}` }
    }
    case '30days': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
      return { range: { start, end }, label: 'Last 30 Days' }
    }
    case 'all': {
      return { range: { start: new Date(0), end }, label: 'All Time' }
    }
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
      return { range: { start, end }, label: 'Last 7 Days' }
    }
  }
}

function toPeriod(s: string): 'today' | 'week' | '30days' | 'month' {
  if (s === 'today') return 'today'
  if (s === 'month') return 'month'
  if (s === '30days') return '30days'
  return 'week'
}

const program = new Command()
  .name('cai4claude')
  .description('Cost AI 4 Claude — Multi-host observability for Claude Code. Aggregate token usage, costs and task categories across all your machines. By CAI Technology.')
  .version(version)

program.hook('preAction', async () => {
  await loadCurrency()
})

program
  .command('report', { isDefault: true })
  .description('Interactive usage dashboard')
  .option('-p, --period <period>', 'Starting period: today, week, 30days, month', 'week')
  .option('--provider <provider>', 'Filter by provider: all, claude, codex, cursor', 'all')
  .option('--refresh <seconds>', 'Auto-refresh interval in seconds', parseInt)
  .action(async (opts) => {
    await renderDashboard(toPeriod(opts.period), opts.provider, opts.refresh)
  })

function buildPeriodData(label: string, projects: ProjectSummary[]): PeriodData {
  const sessions = projects.flatMap(p => p.sessions)
  const catTotals: Record<string, { turns: number; cost: number; editTurns: number; oneShotTurns: number }> = {}
  const modelTotals: Record<string, { calls: number; cost: number }> = {}
  let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0

  for (const sess of sessions) {
    inputTokens += sess.totalInputTokens
    outputTokens += sess.totalOutputTokens
    cacheReadTokens += sess.totalCacheReadTokens
    cacheWriteTokens += sess.totalCacheWriteTokens
    for (const [cat, d] of Object.entries(sess.categoryBreakdown)) {
      if (!catTotals[cat]) catTotals[cat] = { turns: 0, cost: 0, editTurns: 0, oneShotTurns: 0 }
      catTotals[cat].turns += d.turns
      catTotals[cat].cost += d.costUSD
      catTotals[cat].editTurns += d.editTurns
      catTotals[cat].oneShotTurns += d.oneShotTurns
    }
    for (const [model, d] of Object.entries(sess.modelBreakdown)) {
      if (!modelTotals[model]) modelTotals[model] = { calls: 0, cost: 0 }
      modelTotals[model].calls += d.calls
      modelTotals[model].cost += d.costUSD
    }
  }

  return {
    label,
    cost: projects.reduce((s, p) => s + p.totalCostUSD, 0),
    calls: projects.reduce((s, p) => s + p.totalApiCalls, 0),
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
    categories: Object.entries(catTotals)
      .sort(([, a], [, b]) => b.cost - a.cost)
      .map(([cat, d]) => ({ name: CATEGORY_LABELS[cat as TaskCategory] ?? cat, ...d })),
    models: Object.entries(modelTotals)
      .sort(([, a], [, b]) => b.cost - a.cost)
      .map(([name, d]) => ({ name, ...d })),
  }
}

program
  .command('status')
  .description('Compact status output (today + week + month)')
  .option('--format <format>', 'Output format: terminal, menubar, json', 'terminal')
  .option('--provider <provider>', 'Filter by provider: all, claude, codex, cursor', 'all')
  .action(async (opts) => {
    await loadPricing()
    const pf = opts.provider
    if (opts.format === 'menubar') {
      const todayRange = getDateRange('today').range
      const todayData = buildPeriodData('Today', await parseAllSessions(todayRange, pf))
      const weekData = buildPeriodData('7 Days', await parseAllSessions(getDateRange('week').range, pf))
      const monthData = buildPeriodData('Month', await parseAllSessions(getDateRange('month').range, pf))
      const todayProviders: ProviderCost[] = []
      for (const p of await getAllProviders()) {
        const data = await parseAllSessions(todayRange, p.name)
        const cost = data.reduce((s, proj) => s + proj.totalCostUSD, 0)
        if (cost > 0) todayProviders.push({ name: p.displayName, cost })
      }
      console.log(renderMenubarFormat(todayData, weekData, monthData, todayProviders))
      return
    }

    if (opts.format === 'json') {
      const todayData = buildPeriodData('today', await parseAllSessions(getDateRange('today').range, pf))
      const monthData = buildPeriodData('month', await parseAllSessions(getDateRange('month').range, pf))
      const { code, rate } = getCurrency()
      console.log(JSON.stringify({
        currency: code,
        today: { cost: Math.round(todayData.cost * rate * 100) / 100, calls: todayData.calls },
        month: { cost: Math.round(monthData.cost * rate * 100) / 100, calls: monthData.calls },
      }))
      return
    }

    const monthProjects = await parseAllSessions(getDateRange('month').range, pf)
    console.log(renderStatusBar(monthProjects))
  })

program
  .command('today')
  .description('Today\'s usage dashboard')
  .option('--provider <provider>', 'Filter by provider: all, claude, codex, cursor', 'all')
  .option('--refresh <seconds>', 'Auto-refresh interval in seconds', parseInt)
  .action(async (opts) => {
    await renderDashboard('today', opts.provider, opts.refresh)
  })

program
  .command('month')
  .description('This month\'s usage dashboard')
  .option('--provider <provider>', 'Filter by provider: all, claude, codex, cursor', 'all')
  .option('--refresh <seconds>', 'Auto-refresh interval in seconds', parseInt)
  .action(async (opts) => {
    await renderDashboard('month', opts.provider, opts.refresh)
  })

program
  .command('export')
  .description('Export usage data to CSV or JSON (includes 1 day, 7 days, 30 days)')
  .option('-f, --format <format>', 'Export format: csv, json', 'csv')
  .option('-o, --output <path>', 'Output file path')
  .option('--provider <provider>', 'Filter by provider: all, claude, codex, cursor', 'all')
  .action(async (opts) => {
    await loadPricing()
    const pf = opts.provider
    const periods: PeriodExport[] = [
      { label: 'Today', projects: await parseAllSessions(getDateRange('today').range, pf) },
      { label: '7 Days', projects: await parseAllSessions(getDateRange('week').range, pf) },
      { label: '30 Days', projects: await parseAllSessions(getDateRange('30days').range, pf) },
    ]

    if (periods.every(p => p.projects.length === 0)) {
      console.log('\n  No usage data found.\n')
      return
    }

    const defaultName = `cai4claude-${new Date().toISOString().slice(0, 10)}`
    const outputPath = opts.output ?? `${defaultName}.${opts.format}`

    let savedPath: string
    if (opts.format === 'json') {
      savedPath = await exportJson(periods, outputPath)
    } else {
      savedPath = await exportCsv(periods, outputPath)
    }

    console.log(`\n  Exported (Today + 7 Days + 30 Days) to: ${savedPath}\n`)
  })

program
  .command('install-menubar')
  .description('Install macOS menu bar plugin (SwiftBar/xbar)')
  .action(async () => {
    const result = await installMenubar()
    console.log(result)
  })

program
  .command('uninstall-menubar')
  .description('Remove macOS menu bar plugin')
  .action(async () => {
    const result = await uninstallMenubar()
    console.log(result)
  })

program
  .command('currency [code]')
  .description('Set display currency (e.g. cai4claude currency GBP)')
  .option('--symbol <symbol>', 'Override the currency symbol')
  .option('--reset', 'Reset to USD (removes currency config)')
  .action(async (code?: string, opts?: { symbol?: string; reset?: boolean }) => {
    if (opts?.reset) {
      const config = await readConfig()
      delete config.currency
      await saveConfig(config)
      console.log('\n  Currency reset to USD.\n')
      return
    }

    if (!code) {
      const { code: activeCode, rate, symbol } = getCurrency()
      if (activeCode === 'USD' && rate === 1) {
        console.log('\n  Currency: USD (default)')
        console.log(`  Config: ${getConfigFilePath()}\n`)
      } else {
        console.log(`\n  Currency: ${activeCode}`)
        console.log(`  Symbol: ${symbol}`)
        console.log(`  Rate: 1 USD = ${rate} ${activeCode}`)
        console.log(`  Config: ${getConfigFilePath()}\n`)
      }
      return
    }

    const upperCode = code.toUpperCase()
    if (!isValidCurrencyCode(upperCode)) {
      console.error(`\n  "${code}" is not a valid ISO 4217 currency code.\n`)
      process.exitCode = 1
      return
    }

    const config = await readConfig()
    config.currency = {
      code: upperCode,
      ...(opts?.symbol ? { symbol: opts.symbol } : {}),
    }
    await saveConfig(config)

    await loadCurrency()
    const { rate, symbol } = getCurrency()

    console.log(`\n  Currency set to ${upperCode}.`)
    console.log(`  Symbol: ${symbol}`)
    console.log(`  Rate: 1 USD = ${rate} ${upperCode}`)
    console.log(`  Config saved to ${getConfigFilePath()}\n`)
  })

// ─────────────────────────────────────────────────────────────
// CAI4Claude — Multi-host commands
// ─────────────────────────────────────────────────────────────

import {
  readHosts,
  readHostsRaw,
  addHost,
  removeHost,
  syncAllHosts,
  syncHost,
  testHost,
  getHostsFilePath,
  type HostConfig,
} from './hosts.js'

const hosts = program
  .command('hosts')
  .description('Manage remote hosts for multi-host session aggregation')

hosts
  .command('list')
  .description('List configured hosts')
  .action(() => {
    const all = readHostsRaw()
    console.log(`\n  CAI4Claude — Hosts (${getHostsFilePath()})\n`)
    if (all.length === 0) {
      console.log('  No hosts configured.')
      console.log('  Add one: cai4claude hosts add <name> <ip> <user> [--password pwd] [--key path]\n')
      return
    }
    const pad = (s: string, n: number) => (s + ' '.repeat(n)).slice(0, n)
    console.log('  ' + pad('NAME', 20) + pad('IP', 18) + pad('USER', 12) + pad('AUTH', 10) + 'STATUS')
    console.log('  ' + '─'.repeat(70))
    for (const h of all) {
      const auth = h.ssh_key ? 'key' : h.password ? 'password' : 'agent'
      const status = h.enabled === false ? 'disabled' : 'enabled'
      console.log('  ' + pad(h.name, 20) + pad(h.ip, 18) + pad(h.user, 12) + pad(auth, 10) + status)
    }
    console.log()
  })

hosts
  .command('add <name> <ip> <user>')
  .description('Add or update a host')
  .option('--password <pwd>', 'SSH password (requires sshpass installed)')
  .option('--key <path>', 'Path to SSH private key')
  .option('--port <port>', 'SSH port', (v) => parseInt(v), 22)
  .option('--remote-path <path>', 'Remote ~/.claude path', '~/.claude')
  .action((name: string, ip: string, user: string, opts: any) => {
    const host: HostConfig = {
      name, ip, user,
      port: opts.port,
      remote_path: opts.remotePath,
      enabled: true,
    }
    if (opts.password) host.password = opts.password
    if (opts.key) host.ssh_key = opts.key
    addHost(host)
    console.log(`\n  ✓ Host "${name}" added/updated in ${getHostsFilePath()}\n`)
  })

hosts
  .command('remove <name>')
  .description('Remove a host')
  .action((name: string) => {
    const ok = removeHost(name)
    console.log(ok
      ? `\n  ✓ Host "${name}" removed.\n`
      : `\n  ✗ Host "${name}" not found.\n`)
  })

hosts
  .command('test [name]')
  .description('Test SSH connectivity to one or all hosts')
  .action((name?: string) => {
    const all = readHosts()
    const targets = name ? all.filter(h => h.name === name) : all
    if (targets.length === 0) {
      console.log(`  No host${name ? ` named "${name}"` : 's configured'}.`)
      return
    }
    console.log(`\n  CAI4Claude — Testing ${targets.length} host(s)\n`)
    for (const h of targets) {
      process.stdout.write(`  ${h.name.padEnd(20)} ${h.ip.padEnd(18)} ... `)
      const r = testHost(h)
      console.log(r.ok ? '✓ ' + r.message : '✗ ' + r.message)
    }
    console.log()
  })

program
  .command('sync [name]')
  .description('Sync .claude data from one or all configured hosts (rsync via SSH)')
  .option('-v, --verbose', 'Verbose rsync output')
  .action(async (name: string | undefined, opts: any) => {
    const all = readHosts()
    const targets = name ? all.filter(h => h.name === name) : all
    if (targets.length === 0) {
      console.log(`\n  No host${name ? ` named "${name}"` : 's configured to sync'}.`)
      console.log(`  Add with: cai4claude hosts add <name> <ip> <user> [--password pwd] [--key path]\n`)
      return
    }
    console.log(`\n  CAI4Claude — Syncing ${targets.length} host(s)\n`)
    const results = await Promise.all(
      targets.map(h => Promise.resolve(syncHost(h, !!opts.verbose)).then(r => ({ host: h, ...r })))
    )
    let ok = 0, fail = 0
    for (const r of results) {
      if (r.ok) { ok++; console.log(`  ✓ ${r.host.name.padEnd(20)} ${r.localPath}`) }
      else      { fail++; console.log(`  ✗ ${r.host.name.padEnd(20)} ${r.message}`) }
    }
    console.log(`\n  Summary: ${ok} OK / ${fail} FAIL\n`)
  })

// Prometheus exporter endpoint — emits textfile for node_exporter
program
  .command('prometheus')
  .description('Emit Prometheus metrics (textfile format) for node_exporter textfile collector')
  .option('-o, --output <path>', 'Output .prom file', '/var/lib/node_exporter/cai4claude.prom')
  .option('--period <period>', 'Aggregate period: today, week, month', 'today')
  .action(async (opts: any) => {
    const { writeFileSync } = await import('fs')
    const now = new Date()
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    let start: Date
    if (opts.period === 'today') start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    else if (opts.period === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1)
    else start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
    const range: DateRange = { start, end }

    const pricing = await loadPricing()
    const providers = getAllProviders('claude')
    const projects = await parseAllSessions(providers, range, pricing)

    const lines: string[] = []
    const pushHelp = (metric: string, help: string, type: string) => {
      lines.push(`# HELP ${metric} ${help}`)
      lines.push(`# TYPE ${metric} ${type}`)
    }

    pushHelp('cai4claude_cost_usd_total', 'Total cost in USD per host/project', 'gauge')
    pushHelp('cai4claude_api_calls_total', 'Total API calls per host/project', 'gauge')
    pushHelp('cai4claude_tokens_input_total', 'Input tokens per host/project', 'gauge')
    pushHelp('cai4claude_tokens_output_total', 'Output tokens per host/project', 'gauge')
    pushHelp('cai4claude_tokens_cache_read_total', 'Cache read tokens per host/project', 'gauge')
    pushHelp('cai4claude_tokens_cache_write_total', 'Cache write tokens per host/project', 'gauge')

    // Aggregate per host (extract from project prefix "[host] project-name")
    const perHost: Record<string, { cost: number; calls: number; inp: number; out: number; cr: number; cw: number; projects: Record<string, { cost: number; calls: number }> }> = {}
    const hostOf = (project: string) => {
      const m = project.match(/^\[([^\]]+)\]\s*(.*)$/)
      return m ? { host: m[1], name: m[2] } : { host: 'local', name: project }
    }

    for (const p of projects) {
      const { host, name } = hostOf(p.project)
      if (!perHost[host]) perHost[host] = { cost: 0, calls: 0, inp: 0, out: 0, cr: 0, cw: 0, projects: {} }
      const h = perHost[host]
      h.cost += p.totalCostUSD
      h.calls += p.totalApiCalls
      for (const s of p.sessions) {
        h.inp += s.totalInputTokens
        h.out += s.totalOutputTokens
        h.cr += s.totalCacheReadTokens
        h.cw += s.totalCacheWriteTokens
      }
      if (!h.projects[name]) h.projects[name] = { cost: 0, calls: 0 }
      h.projects[name].cost += p.totalCostUSD
      h.projects[name].calls += p.totalApiCalls
    }

    for (const [host, h] of Object.entries(perHost)) {
      const period = opts.period
      lines.push(`cai4claude_cost_usd_total{host="${host}",period="${period}"} ${h.cost.toFixed(6)}`)
      lines.push(`cai4claude_api_calls_total{host="${host}",period="${period}"} ${h.calls}`)
      lines.push(`cai4claude_tokens_input_total{host="${host}",period="${period}"} ${h.inp}`)
      lines.push(`cai4claude_tokens_output_total{host="${host}",period="${period}"} ${h.out}`)
      lines.push(`cai4claude_tokens_cache_read_total{host="${host}",period="${period}"} ${h.cr}`)
      lines.push(`cai4claude_tokens_cache_write_total{host="${host}",period="${period}"} ${h.cw}`)
      for (const [proj, p] of Object.entries(h.projects)) {
        const safeProj = proj.replace(/"/g, '\\"').slice(0, 60)
        lines.push(`cai4claude_cost_usd_total{host="${host}",period="${period}",project="${safeProj}"} ${p.cost.toFixed(6)}`)
        lines.push(`cai4claude_api_calls_total{host="${host}",period="${period}",project="${safeProj}"} ${p.calls}`)
      }
    }

    const out = lines.join('\n') + '\n'
    try {
      writeFileSync(opts.output, out)
      console.log(`  ✓ Wrote ${lines.length} metrics to ${opts.output}`)
    } catch (err: any) {
      // Fallback: stdout
      console.log(out)
      console.error(`  (write failed: ${err.message}; metrics printed to stdout instead)`)
    }
  })

program.parse()
