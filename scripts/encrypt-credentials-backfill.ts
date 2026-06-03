import { loadEnvConfig } from '@next/env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ENCRYPTED_SECRET_PREFIX, encryptSecret } from '@/lib/credentialCrypto'

loadEnvConfig(process.cwd())

const SECRET_COLUMNS = ['bot_token', 'access_token', 'wa_access_token'] as const

type SecretColumn = typeof SECRET_COLUMNS[number]

interface StorePlatformCredentialRow {
  id: string
  bot_token: string | null
  access_token: string | null
  wa_access_token: string | null
}

type SecretColumnCounts = Record<SecretColumn, number>
type SecretColumnUpdates = Partial<Record<SecretColumn, string>>

const allowedFlags = new Set(['--dry-run', '--help'])
const passedFlags = process.argv.slice(2)
const dryRun = passedFlags.includes('--dry-run')
const shouldPrintHelp = passedFlags.includes('--help')

for (const flag of passedFlags) {
  if (!allowedFlags.has(flag)) {
    console.error(`Unknown flag: ${flag}`)
    printUsage()
    process.exit(1)
  }
}

function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function fetchCredentialRows(supabase: SupabaseClient): Promise<StorePlatformCredentialRow[]> {
  const { data, error } = await supabase
    .from('store_platforms')
    .select('id, bot_token, access_token, wa_access_token')
    .returns<StorePlatformCredentialRow[]>()

  if (error) {
    throw new Error(`Failed to fetch store platform credentials: ${error.message}`)
  }

  return data ?? []
}

function createEmptyCounts(): SecretColumnCounts {
  return {
    bot_token: 0,
    access_token: 0,
    wa_access_token: 0,
  }
}

function shouldEncrypt(value: string | null): value is string {
  return value !== null && !value.startsWith(ENCRYPTED_SECRET_PREFIX)
}

async function backfillCredentials(supabase: SupabaseClient) {
  const rows = await fetchCredentialRows(supabase)
  const counts = createEmptyCounts()
  let rowsChanged = 0

  for (const row of rows) {
    const updates: SecretColumnUpdates = {}
    let rowHasChanges = false

    for (const column of SECRET_COLUMNS) {
      const value = row[column]
      if (!shouldEncrypt(value)) continue

      counts[column] += 1
      rowHasChanges = true

      if (!dryRun) {
        updates[column] = encryptSecret(value)
      }
    }

    if (!rowHasChanges) continue
    rowsChanged += 1

    if (dryRun) continue

    const { error } = await supabase
      .from('store_platforms')
      .update(updates)
      .eq('id', row.id)

    if (error) {
      throw new Error(`Failed to encrypt credentials for store_platforms row ${row.id}: ${error.message}`)
    }
  }

  return { rowsScanned: rows.length, rowsChanged, counts }
}

function printUsage() {
  console.log([
    'Usage:',
    '  npx tsx scripts/encrypt-credentials-backfill.ts [--dry-run]',
    '',
    'Options:',
    '  --dry-run  Report plaintext credentials that would be encrypted, but do not write to Supabase.',
    '  --help     Show this help text.',
  ].join('\n'))
}

function printCounts(result: Awaited<ReturnType<typeof backfillCredentials>>) {
  console.log(`Rows scanned: ${result.rowsScanned}`)
  console.log(`${dryRun ? 'Rows that would change' : 'Rows changed'}: ${result.rowsChanged}`)

  for (const column of SECRET_COLUMNS) {
    console.log(`${column}: ${result.counts[column]}`)
  }
}

async function main() {
  if (shouldPrintHelp) {
    printUsage()
    return
  }

  if (dryRun) {
    console.log('Dry run enabled - no Supabase writes will be performed.')
  }

  const supabase = getSupabase()
  const result = await backfillCredentials(supabase)
  printCounts(result)
  console.log('Credential encryption backfill complete.')
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
