import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

// Secure credits endpoint used by the app to read/init/update credits
// 1) Verifies the user's JWT using anon client
// 2) Performs DB operations using service-role client scoped to that user

export async function GET(request: NextRequest) {
  try {
    console.log('[api/credits][GET] called')
    const authHeader = request.headers.get('authorization')
    console.log('[api/credits][GET] auth header present?', !!authHeader)
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    console.log('[api/credits][GET] user?', user?.id, 'authError?', authError?.message)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServerClient()
    // Fetch all rows for this user, newest first
    const { data: rows, error, count } = await admin
      .from('user_credits')
      .select('id, user_id, credits_remaining, plan_type, updated_at', { count: 'exact' })
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    console.log('[api/credits][GET] fetch error?', error?.message, 'count?', count)
    if (error) {
      return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 })
    }

    const latest = rows?.[0]

    // Initialize default credits if none
    if (!latest) {
      const { data: inserted, error: insertError } = await admin
        .from('user_credits')
        .insert({
          user_id: user.id,
          credits_remaining: 5,
          plan_type: 'free'
        })
        .select('id, user_id, credits_remaining, plan_type, updated_at')
        .single()
      console.log('[api/credits][GET] insert error?', insertError?.message, 'inserted?', inserted)
      if (insertError) {
        return NextResponse.json({ error: 'Database error', details: insertError.message }, { status: 500 })
      }
      return NextResponse.json({
        user_id: inserted.user_id,
        credits_remaining: inserted.credits_remaining,
        plan_type: inserted.plan_type
      })
    }

    // If duplicates, cleanup extras and return the latest
    if ((count ?? rows!.length) > 1) {
      const extras = rows!.slice(1).map(r => r.id)
      console.log('[api/credits][GET] duplicate rows detected, deleting', extras.length)
      if (extras.length) {
        await admin
          .from('user_credits')
          .delete()
          .in('id', extras)
          .eq('user_id', user.id)
      }
    }

    return NextResponse.json({
      user_id: latest.user_id,
      credits_remaining: latest.credits_remaining,
      plan_type: latest.plan_type
    })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('[api/credits][POST] called')
    const authHeader = request.headers.get('authorization')
    console.log('[api/credits][POST] auth header present?', !!authHeader)
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    console.log('[api/credits][POST] user?', user?.id, 'authError?', authError?.message)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { credits, plan_type } = await request.json()
    const admin = createServerClient()

    // Fetch newest row for this user
    const { data: rows, error: fetchErr } = await admin
      .from('user_credits')
      .select('id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (fetchErr) {
      return NextResponse.json({ error: 'Database error', details: fetchErr.message }, { status: 500 })
    }

    let result
    if (!rows || rows.length === 0) {
      const { data: inserted, error: insertErr } = await admin
        .from('user_credits')
        .insert({
          user_id: user.id,
          credits_remaining: typeof credits === 'number' ? credits : 5,
          plan_type: plan_type || 'free',
          updated_at: new Date().toISOString()
        })
        .select('user_id, credits_remaining, plan_type')
        .single()
      if (insertErr) {
        return NextResponse.json({ error: 'Database error', details: insertErr.message }, { status: 500 })
      }
      result = inserted
    } else {
      const latestId = rows[0].id
      const { data: updated, error: updateErr } = await admin
        .from('user_credits')
        .update({
          credits_remaining: typeof credits === 'number' ? credits : 5,
          plan_type: plan_type || 'free',
          updated_at: new Date().toISOString()
        })
        .eq('id', latestId)
        .select('user_id, credits_remaining, plan_type')
        .single()
      if (updateErr) {
        return NextResponse.json({ error: 'Database error', details: updateErr.message }, { status: 500 })
      }
      result = updated
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
