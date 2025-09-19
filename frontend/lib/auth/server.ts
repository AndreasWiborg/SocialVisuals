import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function getAuthenticatedUser(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null
    }

    const token = authHeader.substring(7) // Remove 'Bearer ' prefix
    
    // Create Supabase client with the token
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    
    // Set the auth token
    await supabase.auth.setSession({
      access_token: token,
      refresh_token: '',
    })

    // Get the user
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      return null
    }

    return { user, supabase }
  } catch (error) {
    console.error('Error getting authenticated user:', error)
    return null
  }
}