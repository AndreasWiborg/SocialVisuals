import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Debug: Log the environment variables
console.log('Supabase URL:', supabaseUrl)
console.log('Supabase Key exists:', !!supabaseKey)
console.log('Supabase Key length:', supabaseKey?.length)

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables!')
}

// Create a singleton instance
let supabaseInstance: ReturnType<typeof createSupabaseClient> | null = null

export const createClient = () => {
  if (!supabaseInstance) {
    console.log('Creating new Supabase client instance')
    supabaseInstance = createSupabaseClient(supabaseUrl, supabaseKey)
  }
  return supabaseInstance
}