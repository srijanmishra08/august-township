import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  console.error('Run with: node --env-file=.env.local --experimental-strip-types scripts/seed-plots.ts --project=<slug>')
  process.exit(1)
}

const projectArg = process.argv.find((a) => a.startsWith('--project='))
const slug = projectArg?.split('=')[1]?.trim()

if (!slug) {
  console.error('Usage: seed-plots.ts --project=<slug>')
  console.error('Example: --project=august-township | --project=project-2 | --project=project-3')
  process.exit(1)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const seedPath = path.join(__dirname, `../data/projects/${slug}/plots-seed.json`)

let plots: Record<string, unknown>[]
try {
  plots = JSON.parse(readFileSync(seedPath, 'utf-8'))
} catch (err) {
  const code = (err as NodeJS.ErrnoException).code
  if (code === 'ENOENT') {
    console.error(`Seed file not found: ${seedPath}`)
    console.error(`Check that data/projects/${slug}/plots-seed.json exists.`)
  } else {
    console.error(`Failed to read seed file ${seedPath}:`, (err as Error).message)
  }
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const records = plots.map((p) => ({
  ...p,
  project_slug: slug,
}))

const { data, error } = await supabase
  .from('plots')
  .upsert(records, { onConflict: 'project_slug,plot_number' })
  .select('id')

if (error) {
  console.error('Seed failed:', error.message)
  process.exit(1)
}

console.log(`Seeded ${(data as unknown[]).length} plots for ${slug}`)
