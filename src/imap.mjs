// IMAP read: list / read / search / fetch (readonly, never mutates mailbox)
import Imap from 'imap'
import { simpleParser } from 'mailparser'
import { imapParams } from './config.mjs'

const TIMEOUT_MS = 30000

function connect(acc) {
  const p = imapParams(acc)
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: p.user,
      password: p.pass,
      host: p.host,
      port: p.port,
      tls: true,
      authTimeout: TIMEOUT_MS,
      connTimeout: TIMEOUT_MS,
    })
    const timer = setTimeout(() => {
      imap.destroy()
      reject(new Error('IMAP connect timeout'))
    }, TIMEOUT_MS)
    imap.once('ready', () => {
      clearTimeout(timer)
      resolve(imap)
    })
    imap.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    imap.connect()
  })
}

function openBox(imap, folder) {
  return new Promise((resolve, reject) => {
    imap.openBox(folder, true, (err) => (err ? reject(err) : resolve())) // readonly
  })
}

function parseHeaderBuf(buf) {
  // reuse simpleParser on raw header text to get RFC2047 decoding for free
  return simpleParser(buf).then((p) => ({
    from: p.from?.text || '',
    subject: p.subject || '',
    date: p.date ? p.date.toUTCString() : '',
  }))
}

function fetchHeadersCommon(imap, seqs, byUid) {
  return new Promise((resolve, reject) => {
    const rows = []
    const parseJobs = []
    const f = byUid
      ? imap.fetch(seqs, { bodies: ['HEADER.FIELDS (FROM SUBJECT DATE)'], struct: false, uid: true })
      : imap.seq.fetch(seqs, { bodies: ['HEADER.FIELDS (FROM SUBJECT DATE)'], struct: false })
    f.on('message', (msg) => {
      const row = { uid: null, date: '', from: '', subject: '', unread: false }
      msg.on('attributes', (attrs) => {
        row.uid = attrs.uid
        row.unread = !(attrs.flags || []).includes('\\Seen')
      })
      let headerBuf = Buffer.alloc(0)
      msg.on('body', (stream) => {
        stream.on('data', (chunk) => (headerBuf = Buffer.concat([headerBuf, chunk])))
      })
      msg.once('end', () => {
        parseJobs.push(
          parseHeaderBuf(headerBuf)
            .then((h) => Object.assign(row, h))
            .catch(() => {})
            .then(() => rows.push(row)),
        )
      })
    })
    f.once('error', reject)
    f.once('end', () => Promise.all(parseJobs).then(() => resolve(rows), reject))
  })
}

export async function listMail(acc, { limit = 10, folder = 'INBOX' } = {}) {
  const imap = await connect(acc)
  try {
    await openBox(imap, folder)
    const total = imap._box?.messages?.total ?? 0
    if (total === 0) return []
    const start = Math.max(1, total - limit + 1)
    const seqs = []
    for (let i = total; i >= start; i--) seqs.push(i)
    const rows = await fetchHeadersCommon(imap, seqs, false)
    return rows // newest first (we fetched in reverse seq order)
  } finally {
    imap.end()
  }
}

function fetchOneRaw(imap, uid) {
  return new Promise((resolve, reject) => {
    const f = imap.fetch([uid], { bodies: '', struct: false, uid: true })
    let buf = Buffer.alloc(0)
    f.on('message', (msg) => {
      msg.on('body', (stream) => {
        stream.on('data', (chunk) => (buf = Buffer.concat([buf, chunk])))
      })
    })
    f.once('error', reject)
    f.once('end', () => resolve(buf))
  })
}

export async function readMail(acc, { uid, folder = 'INBOX', rawHtml = false }) {
  if (!uid) throw new Error('--uid is required')
  const imap = await connect(acc)
  try {
    await openBox(imap, folder)
    const raw = await fetchOneRaw(imap, Number(uid))
    const parsed = await simpleParser(raw)
    const attachments = (parsed.attachments || []).map((a) => ({
      filename: a.filename || 'attachment',
      size: a.size,
      contentType: a.contentType,
    }))
    const body = rawHtml
      ? parsed.html || parsed.textAsHtml || parsed.text || ''
      : parsed.text || parsed.textAsHtml || ''
    return {
      uid: Number(uid),
      from: parsed.from?.text || '',
      to: parsed.to?.text || '',
      subject: parsed.subject || '',
      date: parsed.date ? parsed.date.toISOString() : '',
      body,
      attachments,
    }
  } finally {
    imap.end()
  }
}

function searchUids(imap, criteria) {
  return new Promise((resolve, reject) => {
    imap.search(criteria, (err, uids) => {
      if (err) reject(err)
      else resolve(uids || [])
    })
  })
}

export async function searchMail(acc, { from, subject, since, before, limit = 20, folder = 'INBOX' } = {}) {
  if (!from && !subject && !since && !before) {
    throw new Error('at least one of --from / --subject / --since / --before is required')
  }
  const imap = await connect(acc)
  try {
    await openBox(imap, folder)
    const criteria = []
    if (from) criteria.push(['HEADER', 'FROM', from])
    if (subject) criteria.push(['HEADER', 'SUBJECT', subject])
    if (since) criteria.push(['SINCE', new Date(since)])
    if (before) criteria.push(['BEFORE', new Date(before)])
    const uids = await searchUids(imap, criteria)
    const picked = uids.slice(-limit) // newest
    if (picked.length === 0) return []
    const seqs = picked.map((u) => u) // fetch by uid: use uid fetch
    const rows = await fetchHeadersCommon(imap, seqs, true)
    return rows
  } finally {
    imap.end()
  }
}

export async function fetchAttachments(acc, { uid, out = './attachments', folder = 'INBOX' }) {
  if (!uid) throw new Error('--uid is required')
  const fs = await import('node:fs')
  const path = await import('node:path')
  fs.mkdirSync(out, { recursive: true })
  const imap = await connect(acc)
  try {
    await openBox(imap, folder)
    const raw = await fetchOneRaw(imap, Number(uid))
    const parsed = await simpleParser(raw)
    const saved = []
    for (const a of parsed.attachments || []) {
      const filename = (a.filename || `attachment-${saved.length + 1}`).replace(/[\\/:*?"<>|]/g, '_')
      const dest = path.join(out, filename)
      fs.writeFileSync(dest, a.content)
      saved.push(dest)
    }
    return { ok: true, uid: Number(uid), saved }
  } finally {
    imap.end()
  }
}
