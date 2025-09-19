import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
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

    const formData = await request.formData()
    const file = formData.get('file') as File
    const category = formData.get('category') as string || 'general'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
    const fileType = (file.type || '').toLowerCase()
    const nameExt = (file.name.split('.').pop() || '').toLowerCase()
    const extOk = ['jpg','jpeg','png','webp','gif','heic','heif'].includes(nameExt)
    if (!allowedTypes.includes(fileType) && !extOk) {
      return NextResponse.json({ error: `Invalid file type: ${fileType || nameExt}` }, { status: 400 })
    }

    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 })
    }

    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `${user.id}/${category}/${fileName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('user-content')
      .upload(filePath, file)

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage
      .from('user-content')
      .getPublicUrl(uploadData.path)

    const { data: dbData, error: dbError } = await supabase
      .from('user_images')
      .insert({
        user_id: user.id,
        file_path: uploadData.path,
        metadata: {
          category,
          original_name: file.name,
          size: file.size,
          type: file.type
        }
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      await supabase.storage.from('user-content').remove([uploadData.path])
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: {
        id: dbData.id,
        file_path: uploadData.path,
        url: publicUrl,
        category,
        metadata: dbData.metadata
      }
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
