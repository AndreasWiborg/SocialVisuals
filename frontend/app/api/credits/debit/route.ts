import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const amountBody = await request.json().catch(() => ({}))
    const amount = Math.max(0, Math.ceil(Number(amountBody?.amount || 0)))
    if (!amount) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    // Verify user via anon client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables for /api/credits/debit')
    }

    const authClient = createClient(
      supabaseUrl,
      supabaseAnonKey
    )
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServerClient()
    // Get latest credits row
    const { data: rows, error: fetchErr } = await admin
      .from('user_credits')
      .select('id, credits_remaining')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (fetchErr) {
      return NextResponse.json({ error: 'Database error', details: fetchErr.message }, { status: 500 })
    }

    // Initialize default if missing
    let current = rows?.[0]
    if (!current) {
      const { data: inserted, error: insertErr } = await admin
        .from('user_credits')
        .insert({ user_id: user.id, credits_remaining: 5, plan_type: 'free' })
        .select('id, credits_remaining')
        .single()
      if (insertErr) {
        return NextResponse.json({ error: 'Database error', details: insertErr.message }, { status: 500 })
      }
      current = inserted
    }

    if ((current.credits_remaining ?? 0) < amount) {
      return NextResponse.json({ error: 'Insufficient credits', credits_remaining: current.credits_remaining }, { status: 402 })
    }

    // Deduct against the latest row id
    const { data: updated, error: updateErr } = await admin
      .from('user_credits')
      .update({
        credits_remaining: current.credits_remaining - amount,
        updated_at: new Date().toISOString()
      })
      .eq('id', current.id)
      .select('id, user_id, credits_remaining, plan_type')
      .single()

    if (updateErr) {
      return NextResponse.json({ error: 'Database error', details: updateErr.message }, { status: 500 })
    }

    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
