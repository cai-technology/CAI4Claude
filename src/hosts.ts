/**
 * CAI4Claude — Multi-host Configuration Manager
 * CAI Technology | ai.caitech.ro
 *
 * Manages hosts.yaml config file with ip/user/password/ssh_key entries
 * and provides rsync-based session data sync from remote hosts.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { execSync, spawnSync } from 'child_process'
import yaml from 'js-yaml'
import chalk from 'chalk'

export interface HostConfig {
  /** Friendly name (used as source label in reports) */
  name: string
  /** IP address or hostname */
  ip: string
  /** SSH user */
  user: string
  /** SSH port (default 22) */
  port?: number
  /** SSH password (optional if ssh_key is set) */
  password?: string
  /** Path to SSH private key (optional) */
  ssh_key?: string
  /** Remote path to Claude projects dir (default: ~/.claude/projects) */
  remote_path?: string
  /** Enable/disable this host without removing it */
  enabled?: boolean
}

export interface HostsFile {
  hosts: HostConfig[]
}

export function getConfigDir(): string {
  const dir = join(homedir(), '.config', 'cai4claude')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getHostsFilePath(): string {
  return join(getConfigDir(), 'hosts.yaml')
}

export function getCacheDir(): string {
  const dir = join(homedir(), '.cache', 'cai4claude', 'hosts')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function readHosts(): HostConfig[] {
  const path = getHostsFilePath()
  if (!existsSync(path)) return []
  try {
    const content = readFileSync(path, 'utf-8')
    const parsed = yaml.load(content) as HostsFile | null
    if (!parsed || !Array.isArray(parsed.hosts)) return []
    return parsed.hosts.filter(h => h.enabled !== false)
  } catch (err) {
    console.error(chalk.red(`Error reading ${path}:`), err)
    return []
  }
}

export function writeHosts(hosts: HostConfig[]): void {
  const path = getHostsFilePath()
  const data: HostsFile = { hosts }
  const content = yaml.dump(data, { lineWidth: 120, noRefs: true })
  const header = [
    '# CAI4Claude — Multi-host Config',
    '# CAI Technology | ai.caitech.ro',
    '#',
    '# WARNING: this file may contain plaintext passwords.',
    '# Permissions automatically set to 0600 (owner read/write only).',
    '#',
    '# Field reference:',
    '#   name        (required) friendly label for reports',
    '#   ip          (required) hostname or IPv4',
    '#   user        (required) SSH username',
    '#   port        (optional) default 22',
    '#   password    (optional) plaintext, only if sshpass is installed',
    '#   ssh_key     (optional) path to private key, preferred over password',
    '#   remote_path (optional) default ~/.claude',
    '#   enabled     (optional) default true; set false to skip without deleting',
    '',
  ].join('\n')
  writeFileSync(path, header + content, { mode: 0o600 })
}

export function addHost(host: HostConfig): void {
  const hosts = readHostsRaw()
  const idx = hosts.findIndex(h => h.name === host.name)
  if (idx >= 0) hosts[idx] = host
  else hosts.push(host)
  writeHosts(hosts)
}

export function removeHost(name: string): boolean {
  const hosts = readHostsRaw()
  const idx = hosts.findIndex(h => h.name === name)
  if (idx < 0) return false
  hosts.splice(idx, 1)
  writeHosts(hosts)
  return true
}

export function readHostsRaw(): HostConfig[] {
  const path = getHostsFilePath()
  if (!existsSync(path)) return []
  try {
    const content = readFileSync(path, 'utf-8')
    const parsed = yaml.load(content) as HostsFile | null
    if (!parsed || !Array.isArray(parsed.hosts)) return []
    return parsed.hosts
  } catch {
    return []
  }
}

/**
 * Build SSH command prefix based on host auth method.
 * Prefers ssh_key > password (via sshpass) > ssh-agent default.
 */
function buildSshPrefix(host: HostConfig): { cmd: string; args: string[] } {
  const port = host.port ?? 22
  const sshOpts = [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'ConnectTimeout=5',
    '-o', 'LogLevel=ERROR',
    '-p', String(port),
  ]
  if (host.ssh_key) {
    sshOpts.push('-i', host.ssh_key, '-o', 'BatchMode=yes')
    return { cmd: 'ssh', args: sshOpts }
  }
  if (host.password) {
    // Use sshpass if available
    const hasSshpass = spawnSync('which', ['sshpass']).status === 0
    if (hasSshpass) {
      return { cmd: 'sshpass', args: ['-p', host.password, 'ssh', ...sshOpts] }
    }
    console.warn(chalk.yellow(`Warning: host "${host.name}" has password but sshpass is not installed. Install with: apt install sshpass`))
  }
  sshOpts.push('-o', 'BatchMode=yes')
  return { cmd: 'ssh', args: sshOpts }
}

/**
 * Test SSH connectivity to a host (no actual sync).
 */
export function testHost(host: HostConfig): { ok: boolean; message: string } {
  const { cmd, args } = buildSshPrefix(host)
  const fullArgs = [...args, `${host.user}@${host.ip}`, 'echo CAI4CLAUDE_OK']
  const result = spawnSync(cmd, fullArgs, { encoding: 'utf-8', timeout: 10000 })
  if (result.status === 0 && result.stdout.includes('CAI4CLAUDE_OK')) {
    return { ok: true, message: 'Connection OK' }
  }
  const err = (result.stderr || result.stdout || 'unknown error').trim().split('\n').pop() || 'unknown'
  return { ok: false, message: err }
}

/**
 * Sync a single host's .claude data to local cache.
 * Returns local path where data is stored.
 */
export function syncHost(host: HostConfig, verbose: boolean = false): { ok: boolean; localPath: string; message: string } {
  const remotePath = host.remote_path || '~/.claude'
  const localPath = join(getCacheDir(), host.name)
  if (!existsSync(localPath)) mkdirSync(localPath, { recursive: true })

  const sshPrefix = buildSshPrefix(host)
  // Build: rsync -az -e "ssh ..." user@ip:~/.claude/ local/
  const rsyncE = `${sshPrefix.cmd} ${sshPrefix.args.join(' ')}`
  const remoteSpec = `${host.user}@${host.ip}:${remotePath}/`
  const rsyncArgs = [
    '-az',
    '--delete',
    '--include=projects/***',
    '--include=sessions/***',
    '--exclude=*',
    '-e', rsyncE,
    remoteSpec,
    localPath + '/',
  ]
  if (verbose) rsyncArgs.unshift('-v')

  const result = spawnSync('rsync', rsyncArgs, {
    encoding: 'utf-8',
    timeout: 300000, // 5min per host
    stdio: verbose ? 'inherit' : 'pipe',
  })

  if (result.status === 0) {
    return { ok: true, localPath, message: 'Synced' }
  }
  const err = (result.stderr || 'rsync failed').trim().split('\n').slice(-3).join(' | ')
  return { ok: false, localPath, message: err }
}

/**
 * Sync all enabled hosts in parallel (best-effort).
 */
export async function syncAllHosts(verbose: boolean = false): Promise<Array<{ host: HostConfig; ok: boolean; message: string; localPath: string }>> {
  const hosts = readHosts()
  if (hosts.length === 0) return []
  const results = await Promise.all(
    hosts.map(h => Promise.resolve(syncHost(h, verbose)).then(r => ({ host: h, ...r })))
  )
  return results
}

/**
 * Get all local paths (synced hosts + local ~/.claude) that contain Claude data.
 * Each path is returned with a host label.
 */
export function getAllClaudeDirs(): Array<{ host: string; path: string }> {
  const results: Array<{ host: string; path: string }> = []

  // Local
  const localClaude = process.env['CLAUDE_CONFIG_DIR'] || join(homedir(), '.claude')
  if (existsSync(localClaude)) {
    results.push({ host: 'local', path: localClaude })
  }

  // Remote (cached)
  const hosts = readHosts()
  for (const host of hosts) {
    const cached = join(getCacheDir(), host.name)
    if (existsSync(cached)) {
      results.push({ host: host.name, path: cached })
    }
  }

  return results
}
