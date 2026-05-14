import { createClient } from '@supabase/supabase-js'
import { DEMO_SUPABASE_ANON_KEY, DEMO_SUPABASE_URL } from './supabaseConfig'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEMO_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEMO_SUPABASE_ANON_KEY

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('Supabase public environment variables are not configured; using demo project defaults')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
