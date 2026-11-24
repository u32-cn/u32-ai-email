// Multi-account config: ~/.u32-ai-email/config.json
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function configDir() {
  return path.join(os.homedir(), '.u32-ai-email')
}

export function configPath() {
  return path.join(configDir(), 'config.json')
}

const ACCOUNT_REQUIRED = ['host', 'user', 'pass']

function normalizeAccount(raw) {
  const acc = {
    host: raw.host,
    port: raw.port !== undefined ? Number(raw.port) : 465,
    secure: raw.secure !== undefined ? raw.secure === true || raw.secure === 'true' : Number(raw.port ?? 465) === 465,
    user: raw.user,
    pass: raw.pass,
  }
  if (raw.fromName !== undefined) acc.fromName = raw.fromName
  if (raw.imapHost !== undefined) acc.imapHost = raw.imapHost
  if (raw.imapPort !== undefined) acc.imapPort = Number(raw.imapPort)
  if (raw.imapUser !== undefined) acc.imapUser = raw.imapUser
  if (raw.imapPass !== undefined) acc.imapPass = raw.imapPass
  for (const k of ACCOUNT_REQUIRED) {
    if (!acc[k]) throw new Error(`account missing required field: ${k}`)
  }
  return acc
}

export function loadConfig() {
  const p = configPath()
  if (!fs.existsSync(p)) {
    return { defaultAccount: 'default', accounts: {} }
  }
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
  if (!cfg.accounts || typeof cfg.accounts !== 'object') {
    throw new Error(`invalid config: missing accounts object in ${p}`)
  }
  if (!cfg.defaultAccount) cfg.defaultAccount = 'default'
  return cfg
}

export function saveConfig(cfg) {
  const dir = configDir()
  fs.mkdirSync(dir, { recursive: true })
  const p = configPath()
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, p)
}

export function getAccount(cfg, name) {
  const accName = name || cfg.defaultAccount
  const acc = cfg.accounts[accName]
  if (!acc) {
    const known = Object.keys(cfg.accounts).join(', ') || '(none)'
    throw new Error(`account "${accName}" not found. Known accounts: ${known}. Use "config add" first.`)
  }
  return { name: accName, ...acc }
}

// IMAP derived from SMTP entry unless overridden
export function imapParams(acc) {
  return {
    host: acc.imapHost || String(acc.host).replace(/^smtp\./i, 'imap.'),
    port: acc.imapPort ?? 993,
    user: acc.imapUser || acc.user,
    pass: acc.imapPass || acc.pass,
  }
}

export function maskConfig(cfg) {
  const out = { defaultAccount: cfg.defaultAccount, accounts: {} }
  for (const [name, acc] of Object.entries(cfg.accounts)) {
    out.accounts[name] = { ...acc, pass: acc.pass ? '******' : undefined, imapPass: acc.imapPass ? '******' : undefined }
  }
  return out
}

export { normalizeAccount }
