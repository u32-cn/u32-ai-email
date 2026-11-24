// SMTP send + verify via nodemailer
import nodemailer from 'nodemailer'
import { splitList } from './parseArgs.mjs'

const TIMEOUT_MS = 30000

export function makeTransport(acc) {
  return nodemailer.createTransport({
    host: acc.host,
    port: acc.port,
    secure: acc.secure,
    auth: { user: acc.user, pass: acc.pass },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  })
}

async function buildMail(acc, args) {
  const to = splitList(args.to)
  if (to.length === 0) throw new Error('--to is required')
  const hasBody = args.body !== undefined || args.html !== undefined || args.htmlFile !== undefined
  if (!hasBody) throw new Error('one of --body / --html / --html-file is required')
  if ([args.body, args.html, args.htmlFile].filter((v) => v !== undefined).length > 1) {
    throw new Error('--body / --html / --html-file are mutually exclusive')
  }

  let html
  if (args.html !== undefined) html = args.html
  if (args.htmlFile !== undefined) {
    // lazy import to avoid fs extra at module top is fine; use sync fs
    const fs = await import('node:fs')
    if (!fs.existsSync(args.htmlFile)) throw new Error(`html file not found: ${args.htmlFile}`)
    html = fs.readFileSync(args.htmlFile, 'utf8')
  }

  const mail = {
    from: acc.fromName ? { name: acc.fromName, address: acc.user } : acc.user,
    to: to.join(', '),
    subject: args.subject ?? '',
  }
  if (html !== undefined) mail.html = html
  else mail.text = args.body

  const cc = splitList(args.cc)
  if (cc.length) mail.cc = cc.join(', ')
  const bcc = splitList(args.bcc)
  if (bcc.length) mail.bcc = bcc.join(', ')

  const attaches = splitList(args.attach)
  if (attaches.length) {
    const fs = await import('node:fs')
    mail.attachments = attaches.map((p) => {
      if (!fs.existsSync(p)) throw new Error(`attachment not found: ${p}`)
      return { filename: p.split(/[\\/]/).pop(), path: p }
    })
  }
  return mail
}

export async function sendMail(acc, args) {
  const mail = await buildMail(acc, args)
  const transport = makeTransport(acc)
  try {
    const info = await transport.sendMail(mail)
    return {
      ok: true,
      account: acc.name,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
    }
  } finally {
    transport.close()
  }
}

export async function verifyAccount(acc) {
  const transport = makeTransport(acc)
  try {
    await transport.verify()
    return { ok: true, account: acc.name, host: acc.host, user: acc.user }
  } finally {
    transport.close()
  }
}
