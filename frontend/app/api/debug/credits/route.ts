import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    console.log('[api/debug/credits][GET] called')
    const authHeader = request.headers.get('authorization')
    console.log('[api/debug/credits][GET] auth header present?', !!authHeader)
    
    if (!authHeader) {
      return NextResponse.json({ 
        error: 'Unauthorized',
        note: 'Authorization header missing'
      }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Create a lightweight client to verify the JWT token
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    // Verify the JWT token
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    console.log('[api/debug/credits][GET] user?', user?.id, 'authError?', authError?.message)
    
    if (authError || !user) {
      console.log('Debug API - Auth error:', authError)
      return NextResponse.json({ 
        error: 'Unauthorized',
        auth_error: authError?.message,
        note: 'Invalid or expired token'
      }, { status: 401 })
    }

    console.log('[api/debug/credits][GET] Found user:', user.email)

    // Use server-side client (service role) to bypass RLS safely after verifying the user
    const admin = createServerClient()

    // Check if user_credits record exists
    const { data: credits, error: creditsError } = await admin
      .from('user_credits')
      .select('*')
      .eq('user_id', user.id)
    console.log('[api/debug/credits][GET] credits result:', { credits, error: creditsError })

    if (creditsError) {
      console.error('Credits query error:', creditsError)
      return NextResponse.json({ 
        error: 'Database error', 
        details: creditsError.message,
        code: creditsError.code,
        hint: creditsError.hint,
        user_id: user.id 
      }, { status: 500 })
    }

    return NextResponse.json({
      user_id: user.id,
      user_email: user.email,
      credits_records: credits,
      credits_count: credits?.length || 0,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[api/debug/credits][GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('[api/debug/credits][POST] called')
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader) {
      return NextResponse.json({ 
        error: 'Unauthorized',
        note: 'Authorization header missing'
      }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Create a lightweight client to verify the JWT token
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    // Verify the JWT token
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    console.log('[api/debug/credits][POST] user?', user?.id, 'authError?', authError?.message)
    
    if (authError || !user) {
      console.log('Debug API POST - Auth error:', authError)
      return NextResponse.json({ 
        error: 'Unauthorized',
        auth_error: authError?.message,
        note: 'Invalid or expired token'
      }, { status: 401 })
    }

    const body = await request.json()
    const { credits, plan_type } = body

    // Use server-side client (service role) to bypass RLS safely after verifying the user
    const admin = createServerClient()

    // Fetch newest row for this user
    const { data: rows, error: fetchErr } = await admin
      .from('user_credits')
      .select('id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (fetchErr) {
      console.error('Credits update fetch error:', fetchErr)
      return NextResponse.json({ error: 'Database error', details: fetchErr.message }, { status: 500 })
    }

    let result
    if (!rows || rows.length === 0) {
      const { data: inserted, error: insertErr } = await admin
        .from('user_credits')
        .insert({
          user_id: user.id,
          credits_remaining: typeof credits === 'number' ? credits : 950,
          plan_type: plan_type || 'premium',
          updated_at: new Date().toISOString()
        })
        .select()
        .single()
      if (insertErr) {
        console.error('Credits insert error:', insertErr)
        return NextResponse.json({ error: 'Database error', details: insertErr.message }, { status: 500 })
      }
      result = inserted
    } else {
      const latestId = rows[0].id
      const { data: updated, error: updateErr } = await admin
        .from('user_credits')
        .update({
          credits_remaining: typeof credits === 'number' ? credits : 950,
          plan_type: plan_type || 'premium',
          updated_at: new Date().toISOString()
        })
        .eq('id', latestId)
        .select()
        .single()
      if (updateErr) {
        console.error('Credits update error:', updateErr)
        return NextResponse.json({ error: 'Database error', details: updateErr.message }, { status: 500 })
      }
      result = updated
    }

    // Optional: cleanup duplicates keeping latest id
    if (rows && rows.length > 1) {
      const extras = rows.slice(1).map(r => r.id)
      await admin.from('user_credits').delete().in('id', extras).eq('user_id', user.id)
    }

    return NextResponse.json({ success: true, data: result })

  } catch (error) {
    console.error('[api/debug/credits][POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
