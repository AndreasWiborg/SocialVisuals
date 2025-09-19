"use client"
import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

interface UserCredits {
  credits_remaining: number
  plan_type: string
}

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  userCredits: UserCredits | null
  refreshCredits: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [userCredits, setUserCredits] = useState<UserCredits | null>(null)

  // Use useMemo to ensure we get the same instance
  const supabase = useMemo(() => createClient(), [])

  const refreshCredits = async (targetUser?: User) => {
    const currentUser = targetUser || user
    if (!currentUser) {
      console.log('refreshCredits: No user found')
      return
    }

    try {
      // Prefer token from context; if missing, try to fetch it briefly
      let token = session?.access_token
      console.log('refreshCredits: using context session token?', !!token)
      if (!token) {
        // Try a short retry loop to let Supabase finish initializing
        for (let i = 0; i < 4 && !token; i++) {
          await new Promise((r) => setTimeout(r, 250))
          try {
            const res = await (async () => {
              try { return await (createClient()).auth.getSession() } catch { return null as any } })()
            token = res?.data?.session?.access_token || token
          } catch {}
        }
        console.log('refreshCredits: token after retry?', !!token)
      }
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      console.log('refreshCredits: calling /api/credits ...')
      const res = await fetch('/api/credits', { headers, cache: 'no-store' })
      console.log('refreshCredits: /api/credits status', res.status)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('refreshCredits: API error', err)
        return
      }
      const payload = await res.json()
      console.log('refreshCredits: payload', payload)
      setUserCredits({
        credits_remaining: payload.credits_remaining ?? 0,
        plan_type: payload.plan_type ?? 'free'
      })
    } catch (error) {
      console.error('refreshCredits: Exception:', error)
    }
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('Initial session:', session?.user?.email || 'No user')
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      // Defer credits loading until token is ready; handled by next effect
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event, session?.user?.email || 'No user')
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)

        if (!session?.user) {
          setUserCredits(null)
        } else {
          // Defer to token-aware effect
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase])

  // Load credits when we have a user and a token
  useEffect(() => {
    if (user && session?.access_token) {
      console.log('Loading credits (token available) for user')
      refreshCredits(user)
    }
  }, [user, session?.access_token])

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        return { error: error.message }
      }

      return {}
    } catch (error: any) {
      return { error: 'An unexpected error occurred' }
    }
  }

  const signUp = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        return { error: error.message }
      }

      return {}
    } catch (error: any) {
      return { error: 'An unexpected error occurred' }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    userCredits,
    refreshCredits
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
