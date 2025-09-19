import { createClient } from './client'

export const STORAGE_BUCKETS = {
  USER_CONTENT: 'user-content',
  TEMPLATE_ASSETS: 'template-assets',
  PUBLIC_ASSETS: 'public-assets'
} as const

export type StorageBucket = typeof STORAGE_BUCKETS[keyof typeof STORAGE_BUCKETS]

export interface UserAssetMapping {
  [category: string]: {
    selectedImages: string[]
    preferences?: {
      style?: string
      mood?: string
      colorScheme?: string
    }
  }
}

export interface UserPreferences {
  id?: string
  user_id: string
  brand_colors: {
    brand_primary: string
    brand_secondary: string
    accent_1: string
    accent_2: string
  }
  asset_preferences: UserAssetMapping
  onboarding_completed: boolean
  created_at?: string
  updated_at?: string
}

export class SupabaseStorage {
  private supabase: ReturnType<typeof createClient>
  
  constructor() {
    this.supabase = createClient()
  }

  async uploadUserAsset(
    userId: string, 
    file: File, 
    category: string = 'general'
  ): Promise<{ path: string; url: string } | null> {
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `${userId}/${category}/${fileName}`

      const { data, error } = await this.supabase.storage
        .from(STORAGE_BUCKETS.USER_CONTENT)
        .upload(filePath, file)

      if (error) {
        console.error('Upload error:', error)
        return null
      }

      const { data: { publicUrl } } = this.supabase.storage
        .from(STORAGE_BUCKETS.USER_CONTENT)
        .getPublicUrl(data.path)

      await (this.supabase.from('user_images') as any)
        .insert({
          user_id: userId,
          file_path: data.path,
          metadata: {
            category,
            original_name: file.name,
            size: file.size,
            type: file.type
          }
        })

      return { path: data.path, url: publicUrl }
    } catch (error) {
      console.error('Upload failed:', error)
      return null
    }
  }

  async getUserAssets(userId: string, category?: string): Promise<Array<{ path: string; url: string; metadata: any }>> {
    try {
      let query = this.supabase
        .from('user_images')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (category) {
        query = query.eq('metadata->>category', category)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching user assets:', error)
        return []
      }

      const items = (data ?? []) as Array<{ file_path: string; metadata: any }>

      return items.map(item => {
        const { data: { publicUrl } } = this.supabase.storage
          .from(STORAGE_BUCKETS.USER_CONTENT)
          .getPublicUrl(item.file_path)
        
        return {
          path: item.file_path,
          url: publicUrl,
          metadata: item.metadata
        }
      })
    } catch (error) {
      console.error('Failed to fetch user assets:', error)
      return []
    }
  }

  async uploadTemplateAsset(file: File, templateId: string): Promise<{ path: string; url: string } | null> {
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${templateId}/${file.name}`

      const { data, error } = await this.supabase.storage
        .from(STORAGE_BUCKETS.TEMPLATE_ASSETS)
        .upload(fileName, file)

      if (error) {
        console.error('Template upload error:', error)
        return null
      }

      const { data: { publicUrl } } = this.supabase.storage
        .from(STORAGE_BUCKETS.TEMPLATE_ASSETS)
        .getPublicUrl(data.path)

      return { path: data.path, url: publicUrl }
    } catch (error) {
      console.error('Template upload failed:', error)
      return null
    }
  }

  async getTemplateAssets(templateId: string): Promise<Array<{ path: string; url: string }>> {
    try {
      const { data, error } = await this.supabase.storage
        .from(STORAGE_BUCKETS.TEMPLATE_ASSETS)
        .list(templateId)

      if (error) {
        console.error('Error fetching template assets:', error)
        return []
      }

      return data.map(file => {
        const path = `${templateId}/${file.name}`
        const { data: { publicUrl } } = this.supabase.storage
          .from(STORAGE_BUCKETS.TEMPLATE_ASSETS)
          .getPublicUrl(path)
        
        return { path, url: publicUrl }
      })
    } catch (error) {
      console.error('Failed to fetch template assets:', error)
      return []
    }
  }

  async saveUserPreferences(preferences: Partial<UserPreferences>): Promise<UserPreferences | null> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser()
      if (!user) return null

      const preferencesTable = this.supabase.from('user_preferences') as any

      const { data, error } = await preferencesTable
        .upsert({
          user_id: user.id,
          ...preferences,
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        console.error('Error saving preferences:', error)
        return null
      }

      return data as UserPreferences
    } catch (error) {
      console.error('Failed to save preferences:', error)
      return null
    }
  }

  async getUserPreferences(userId?: string): Promise<UserPreferences | null> {
    try {
      const targetUserId = userId || (await this.supabase.auth.getUser()).data.user?.id
      if (!targetUserId) return null

      const preferencesTable = this.supabase.from('user_preferences') as any

      const { data, error } = await preferencesTable
        .select('*')
        .eq('user_id', targetUserId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return this.createDefaultPreferences(targetUserId)
        }
        console.error('Error fetching preferences:', error)
        return null
      }

      return data as UserPreferences
    } catch (error) {
      console.error('Failed to fetch preferences:', error)
      return null
    }
  }

  private async createDefaultPreferences(userId: string): Promise<UserPreferences | null> {
    const defaultPreferences: Partial<UserPreferences> = {
      user_id: userId,
      brand_colors: {
        brand_primary: "#3B82F6",
        brand_secondary: "#6366F1",
        accent_1: "#8B5CF6",
        accent_2: "#06B6D4"
      },
      asset_preferences: {},
      onboarding_completed: false
    }

    return this.saveUserPreferences(defaultPreferences)
  }

  async deleteUserAsset(userId: string, filePath: string): Promise<boolean> {
    try {
      const { error: storageError } = await this.supabase.storage
        .from(STORAGE_BUCKETS.USER_CONTENT)
        .remove([filePath])

      if (storageError) {
        console.error('Storage deletion error:', storageError)
        return false
      }

      const imagesTable = this.supabase.from('user_images') as any

      const { error: dbError } = await imagesTable
        .delete()
        .eq('user_id', userId)
        .eq('file_path', filePath)

      if (dbError) {
        console.error('Database deletion error:', dbError)
        return false
      }

      return true
    } catch (error) {
      console.error('Failed to delete asset:', error)
      return false
    }
  }

  async getAssetWithFallback(
    userId: string, 
    category: string, 
    templateFallbackPath?: string
  ): Promise<string | null> {
    try {
      const userAssets = await this.getUserAssets(userId, category)
      
      if (userAssets.length > 0) {
        return userAssets[0].url
      }

      if (templateFallbackPath) {
        const { data: { publicUrl } } = this.supabase.storage
          .from(STORAGE_BUCKETS.TEMPLATE_ASSETS)
          .getPublicUrl(templateFallbackPath)
        return publicUrl
      }

      return null
    } catch (error) {
      console.error('Failed to get asset with fallback:', error)
      return null
    }
  }
}

// Create a singleton storage instance
let storageInstance: SupabaseStorage | null = null

export const getSupabaseStorage = () => {
  if (!storageInstance) {
    storageInstance = new SupabaseStorage()
  }
  return storageInstance
}

export const useSupabaseStorage = () => {
  return getSupabaseStorage()
}
