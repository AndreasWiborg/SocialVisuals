import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const getSupabaseConfig = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

  return { supabaseUrl, supabaseAnonKey }
}

export async function GET(request: NextRequest) {
  try {
    const config = getSupabaseConfig()

    if (!config) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const supabase = createSupabaseClient(config.supabaseUrl, config.supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Try to get user using the bearer token if present
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined
    const { data: { user } } = token
      ? await supabase.auth.getUser(token)
      : await supabase.auth.getUser()
    
    if (!user) {
      // Return default preferences for unauthenticated users
      return NextResponse.json({
        asset_preferences: {},
        brand_colors: {
          brand_primary: "#3B82F6",
          brand_secondary: "#6366F1",
          accent_1: "#8B5CF6",
          accent_2: "#06B6D4"
        },
        user_images: {}
      })
    }

    // Get user preferences from database
    const { data: preferences, error } = await supabase
      .from('user_preferences')
      .select('asset_preferences, brand_colors')
      .eq('user_id', user.id)
      .single()

    // If table not found or RLS prevents read, try storage fallback
    let assetPreferences: any = preferences?.asset_preferences || {}
    let brandColors: any = preferences?.brand_colors || null
    if (error && error.code !== 'PGRST116') {
      try {
        const storagePath = `${user.id}/prefs/user_preferences.json`
        const { data: file, error: fileErr } = await supabase
          .storage
          .from('user-content')
          .download(storagePath)
        if (!fileErr && file) {
          const txt = await file.text()
          const parsed = JSON.parse(txt)
          assetPreferences = parsed?.asset_preferences || {}
          brandColors = parsed?.brand_colors || null
        }
      } catch (e) {
        console.error('Storage fallback failed:', e)
      }
    }

    // Get user images
    const { data: userImages } = await supabase
      .from('user_images')
      .select('file_path, metadata')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    const imagesByCategory: { [key: string]: string[] } = {}
    
    userImages?.forEach(image => {
      const category = image.metadata?.category || 'general'
      if (!imagesByCategory[category]) {
        imagesByCategory[category] = []
      }
      
      const { data: { publicUrl } } = supabase.storage
        .from('user-content')
        .getPublicUrl(image.file_path)
      
      imagesByCategory[category].push(publicUrl)
    })

    return NextResponse.json({
      asset_preferences: assetPreferences || {},
      brand_colors: brandColors || {
        brand_primary: "#3B82F6",
        brand_secondary: "#6366F1",
        accent_1: "#8B5CF6",
        accent_2: "#06B6D4"
      },
      user_images: imagesByCategory
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const config = getSupabaseConfig()

    if (!config) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const supabase = createSupabaseClient(config.supabaseUrl, config.supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined
    const { data: { user } } = token
      ? await supabase.auth.getUser(token)
      : await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { asset_preferences, brand_colors } = body

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        asset_preferences: asset_preferences || {},
        brand_colors: brand_colors || {
          brand_primary: "#3B82F6",
          brand_secondary: "#6366F1",
          accent_1: "#8B5CF6", 
          accent_2: "#06B6D4"
        },
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    // If DB write fails (table missing / RLS), persist a JSON fallback in storage so the client can still proceed
    if (error) {
      console.error('Database error (will try storage fallback):', error)
      try {
        const storagePath = `${user.id}/prefs/user_preferences.json`
        const blob = new Blob([JSON.stringify({ asset_preferences, brand_colors, updated_at: new Date().toISOString() }, null, 2)], { type: 'application/json' })
        // @ts-ignore: upload accepts Blob
        const { error: upErr } = await supabase
          .storage
          .from('user-content')
          .upload(storagePath, blob, { upsert: true, contentType: 'application/json' as any })
        if (upErr) {
          console.error('Storage fallback failed:', upErr)
          return NextResponse.json({ error: 'Database error' }, { status: 500 })
        }
        return NextResponse.json({ 
          success: true, 
          data: { asset_preferences, brand_colors },
          persisted: 'storage'
        })
      } catch (e) {
        console.error('Storage fallback threw:', e)
        return NextResponse.json({ error: 'Database error' }, { status: 500 })
      }
    }

    return NextResponse.json({ 
      success: true, 
      data: {
        asset_preferences: data.asset_preferences,
        brand_colors: data.brand_colors
      },
      persisted: 'db'
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
