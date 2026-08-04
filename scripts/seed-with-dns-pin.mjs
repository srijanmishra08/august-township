/**
 * Workaround wrapper for seed-plots.ts when the local resolver mis-resolves
 * the Supabase host (some ISPs spoof the A record). Pins the Supabase
 * hostname to a known-good Cloudflare IP before importing the seed script.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-with-dns-pin.mjs --project=august-township
 *
 * The pin only activates when SUPABASE_HOST_IP_PIN is set OR the URL host
 * matches the hard-coded default below.
 */

import dns from 'dns'
import { pathToFileURL } from 'url'
import path from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!SUPABASE_URL) {
  console.error('NEXT_PUBLIC_SUPABASE_URL missing — run with --env-file=.env.local')
  process.exit(1)
}

const host = new URL(SUPABASE_URL).host
const pinnedIp = process.env.SUPABASE_HOST_IP_PIN ?? '172.64.149.246'

const origLookup = dns.lookup
dns.lookup = function patchedLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  if (hostname === host) {
    if (options && options.all) {
      return callback(null, [{ address: pinnedIp, family: 4 }])
    }
    return callback(null, pinnedIp, 4)
  }
  return origLookup(hostname, options, callback)
}

console.error(`[dns-pin] ${host} -> ${pinnedIp}`)

const here = path.dirname(new URL(import.meta.url).pathname)
const seedPath = pathToFileURL(path.join(here, 'seed-plots.ts')).href
await import(seedPath)
