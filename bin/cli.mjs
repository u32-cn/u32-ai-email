#!/usr/bin/env node
// u32-ai-email CLI entry: subcommand dispatch
import { main } from '../src/cli.mjs'

main(process.argv.slice(2)).then(
  (code) => process.exit(code ?? 0),
  (err) => {
    console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }))
    process.exit(1)
  },
)
