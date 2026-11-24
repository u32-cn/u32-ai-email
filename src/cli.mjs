// CLI subcommand dispatch
import { loadConfig, saveConfig, getAccount, maskConfig, normalizeAccount } from './config.mjs'
import { sendMail, verifyAccount } from './send.mjs'
import { listMail, readMail, searchMail, fetchAttachments } from './imap.mjs'
import { parseArgs, splitList } from './parseArgs.mjs'

const HELP = `u32-ai-email — AI-friendly email CLI (SMTP send + IMAP read, multi-account)

!! IMPORTANT FOR AI AGENTS !!
BEFORE any long-running task that may send or read email, ALWAYS verify
email capability FIRST to avoid failing after hours of work:
  1. npx u32-ai-email config list          # account configured?
  2. npx u32-ai-email config test          # SMTP connect/auth OK?
If either fails, STOP and ask the user to finish mailbox setup
(config add ... + enable SMTP/IMAP service + auth code) before proceeding.

AI PROMPT — notify the user when stuck or slow (share this prompt with an AI agent;
replace <xxx@qq.com> with the real recipient. This is a prompt, not a shell command):
  你在执行任务时，遇到问题或者进度特别缓慢时，可以使用 npx u32-ai-email 发邮件至 <xxx@qq.com> 通知我。

Usage: npx u32-ai-email <command> [options]

Config:
  config add <name> --host H --user U --pass P [--port 465] [--secure true] [--from-name N]
      [--imap-host H] [--imap-port 993] [--imap-user U] [--imap-pass P]
  config list                     list accounts (pass masked)
  config remove <name>            remove account
  config default <name>           set default account
  config test [name]              verify SMTP connection (default account if omitted)

Send (uses default account unless --account):
  send --to a@b.com,c@d.com --subject S (--body TEXT | --html "<html>" | --html-file F)
       [--attach f1,f2] [--cc ..] [--bcc ..] [--from-name N] [--account NAME]

Read (IMAP, readonly):
  list [--limit 10] [--folder INBOX] [--account NAME]
  read --uid N [--raw-html] [--folder INBOX] [--account NAME]
  search (--from A | --subject S | --since YYYY-MM-DD | --before YYYY-MM-DD) [--limit 20] [--folder INBOX] [--account NAME]
  fetch --uid N [--out ./attachments] [--folder INBOX] [--account NAME]

Config file: ~/.u32-ai-email/config.json
Docs: https://u32-ai-email.u32.cn
`

function out(data) {
  console.log(JSON.stringify(data, null, 2))
}

async function cmdConfig(args) {
  const action = args._[1]
  const cfg = loadConfig()
  if (action === 'add') {
    const name = args._[2]
    if (!name) throw new Error('usage: config add <name> --host H --user U --pass P')
    const acc = normalizeAccount(args)
    const isNew = !cfg.accounts[name]
    cfg.accounts[name] = acc
    if (!cfg.accounts[cfg.defaultAccount]) cfg.defaultAccount = name
    saveConfig(cfg)
    return { ok: true, added: name, isDefault: cfg.defaultAccount === name, replaced: !isNew }
  }
  if (action === 'list') {
    return { ok: true, defaultAccount: cfg.defaultAccount, accounts: maskConfig(cfg).accounts }
  }
  if (action === 'remove') {
    const name = args._[2]
    if (!name) throw new Error('usage: config remove <name>')
    if (!cfg.accounts[name]) throw new Error(`account "${name}" not found`)
    delete cfg.accounts[name]
    if (cfg.defaultAccount === name) {
      cfg.defaultAccount = Object.keys(cfg.accounts)[0] ?? 'default'
    }
    saveConfig(cfg)
    return { ok: true, removed: name, defaultAccount: cfg.defaultAccount }
  }
  if (action === 'default') {
    const name = args._[2]
    if (!name) throw new Error('usage: config default <name>')
    if (!cfg.accounts[name]) throw new Error(`account "${name}" not found`)
    cfg.defaultAccount = name
    saveConfig(cfg)
    return { ok: true, defaultAccount: name }
  }
  if (action === 'test') {
    const acc = getAccount(cfg, args._[2] || args.account)
    return verifyAccount(acc)
  }
  throw new Error(`unknown config action: ${action ?? '(none)'}`)
}

async function cmdSend(args) {
  const cfg = loadConfig()
  const acc = getAccount(cfg, args.account)
  return sendMail(acc, args)
}

async function withImap(args, fn) {
  const cfg = loadConfig()
  const acc = getAccount(cfg, args.account)
  const opts = {
    folder: args.folder || 'INBOX',
    account: acc.name,
  }
  return fn(acc, opts, args)
}

export async function main(argv) {
  const args = parseArgs(argv)
  const cmd = args._[0]

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(HELP)
    return 0
  }

  try {
    switch (cmd) {
      case 'config':
        out(await cmdConfig(args))
        return 0
      case 'send': {
        const r = await cmdSend(args)
        out(r)
        return r.ok ? 0 : 2
      }
      case 'list':
        out(await withImap(args, (acc, opts, a) => listMail(acc, { limit: Number(a.limit ?? 10), folder: opts.folder })))
        return 0
      case 'read':
        out(
          await withImap(args, (acc, opts, a) =>
            readMail(acc, { uid: a.uid, folder: opts.folder, rawHtml: a['raw-html'] === true }),
          ),
        )
        return 0
      case 'search':
        out(
          await withImap(args, (acc, opts, a) =>
            searchMail(acc, {
              from: a.from,
              subject: a.subject,
              since: a.since,
              before: a.before,
              limit: Number(a.limit ?? 20),
              folder: opts.folder,
            }),
          ),
        )
        return 0
      case 'fetch':
        out(await withImap(args, (acc, opts, a) => fetchAttachments(acc, { uid: a.uid, out: a.out || './attachments', folder: opts.folder })))
        return 0
      default:
        console.error(JSON.stringify({ ok: false, error: `unknown command: ${cmd}. Run "u32-ai-email help".` }))
        return 1
    }
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }))
    return 2
  }
}
