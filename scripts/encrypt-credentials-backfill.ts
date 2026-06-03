import { loadEnvConfig } from '@next/env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ENCRYPTED_SECRET_PREFIX, encryptSecret } from '@/lib/credentialCrypto'

loadEnvConfig(process.cwd())

const SECRET_COLUMNS = ['bot_token', 'access_token', 'wa_access_token'] as const

type SecretColumn = typeof SECRET_COLUMNS[number]

type StorePlatformCredentialRow = {
  id: string
} & Partial<Record<SecretColumn, string | null>>

type SecretColumnCounts = Partial<Record<SecretColumn, number>>
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

function isMissingColumnError(error: { code?: string; message: string }) {
  const message = error.message.toLowerCase()

  return error.code === '42703'
    || error.code === 'PGRST204'
    || (message.includes('column') && message.includes('does not exist'))
    || (message.includes('could not find') && message.includes('column'))
}

async function secretColumnExists(supabase: SupabaseClient, column: SecretColumn) {
  const { error } = await supabase
    .from('store_platforms')
    .select(column)
    .limit(0)

  if (!error) return true
  if (isMissingColumnError(error)) return false

  throw new Error(`Failed to check store_platforms.${column}: ${error.message}`)
}

async function getActiveSecretColumns(supabase: SupabaseClient): Promise<SecretColumn[]> {
  const activeColumns: SecretColumn[] = []

  for (const column of SECRET_COLUMNS) {
    if (await secretColumnExists(supabase, column)) {
      activeColumns.push(column)
      continue
    }

    console.log(`Skipping ${column} (column not present in store_platforms)`)
  }

  return activeColumns
}

async function fetchCredentialRows(
  supabase: SupabaseClient,
  activeColumns: readonly SecretColumn[],
): Promise<StorePlatformCredentialRow[]> {
  const selectColumns = ['id', ...activeColumns].join(', ')
  const { data, error } = await supabase
    .from('store_platforms')
    .select(selectColumns)
    .returns<StorePlatformCredentialRow[]>()

  if (error) {
    throw new Error(`Failed to fetch store platform credentials: ${error.message}`)
  }

  return data ?? []
}

function createEmptyCounts(activeColumns: readonly SecretColumn[]): SecretColumnCounts {
  return Object.fromEntries(activeColumns.map(column => [column, 0])) as SecretColumnCounts
}

function shouldEncrypt(value: string | null | undefined): value is string {
  return typeof value === 'string' && !value.startsWith(ENCRYPTED_SECRET_PREFIX)
}

async function backfillCredentials(supabase: SupabaseClient) {
  const activeColumns = await getActiveSecretColumns(supabase)
  const rows = await fetchCredentialRows(supabase, activeColumns)
  const counts = createEmptyCounts(activeColumns)
  let rowsChanged = 0

  for (const row of rows) {
    const updates: SecretColumnUpdates = {}
    let rowHasChanges = false

    for (const column of activeColumns) {
      const value = row[column]
      if (!shouldEncrypt(value)) continue

      counts[column] = (counts[column] ?? 0) + 1
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

  return { rowsScanned: rows.length, rowsChanged, counts, activeColumns }
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

  for (const column of result.activeColumns) {
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
