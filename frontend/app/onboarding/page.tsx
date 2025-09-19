"use client"
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { apiPost, API_BASE } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { motion, AnimatePresence } from 'framer-motion'
import { useSupabaseStorage, UserAssetMapping } from '@/lib/supabase/storage'
import { useAuth } from '@/lib/auth/context'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { 
  Upload, 
  Image as ImageIcon, 
  CheckCircle2, 
  ArrowRight, 
  Loader2,
  X,
  AlertCircle,
  Palette
} from 'lucide-react'

type ImageCategory = 'logo' | 'products' | 'screenshots' | 'backgrounds'
type SingularCategory = 'logo' | 'product' | 'screenshot' | 'background' | 'ignore'

interface UploadedImage {
  id: string
  file: File
  url: string
  category?: ImageCategory
  confidence?: number
}

interface CategorizedImages {
  logo?: string
  products: string[]
  screenshots: string[]
  backgrounds: string[]
  analyses?: Record<string, any>
}

interface ExtractedColors {
  brand_primary: string
  brand_secondary: string
  accent_1: string
  accent_2: string
}

function OnboardingContent() {
  const router = useRouter()
  const toast = useToast()
  const storage = useSupabaseStorage()
  const { session } = useAuth()
  
  // State
  const [step, setStep] = React.useState(1)
  const [uploading, setUploading] = React.useState(false)
  const [analyzing, setAnalyzing] = React.useState(false)
  const [uploadedImages, setUploadedImages] = React.useState<UploadedImage[]>([])
  const [categorizedImages, setCategorizedImages] = React.useState<CategorizedImages | null>(null)
  const [productOrder, setProductOrder] = React.useState<string[]>([])
  const [screenshotOrder, setScreenshotOrder] = React.useState<string[]>([])
  const [backgroundOrder, setBackgroundOrder] = React.useState<string[]>([])
  const [extractedColors, setExtractedColors] = React.useState<ExtractedColors | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [filenameToUrl, setFilenameToUrl] = React.useState<Record<string, string>>({})
  const [supabaseUploading, setSupabaseUploading] = React.useState(false)
  
  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    
    // Validate file types
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    const invalidFiles = files.filter(f => !validTypes.includes(f.type))
    
    if (invalidFiles.length > 0) {
      toast.add(`Invalid file types: ${invalidFiles.map(f => f.name).join(', ')}`)
      return
    }
    
    // Create preview URLs
    const newImages: UploadedImage[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      url: URL.createObjectURL(file)
    }))
    
    setUploadedImages(prev => [...prev, ...newImages])
  }
  
  // Remove image
  const removeImage = (id: string) => {
    setUploadedImages(prev => {
      const img = prev.find(i => i.id === id)
      if (img) URL.revokeObjectURL(img.url)
      return prev.filter(i => i.id !== id)
    })
  }
  
  // Analyze images
  const analyzeImages = async () => {
    if (uploadedImages.length === 0) {
      toast.add('Please upload at least one image')
      return
    }
    
    setAnalyzing(true)
    
    try {
      // Convert images to base64
      const imagesWithBase64 = await Promise.all(
        uploadedImages.map(async (img) => {
          const reader = new FileReader()
          const base64 = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string)
            reader.readAsDataURL(img.file)
          })
          return { filename: img.file.name, base64 }
        })
      )
      
      // Send to text-overlay API
      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: imagesWithBase64 })
      })
      
      if (!response.ok) throw new Error('Analysis failed')
      
      const result = await response.json()
      
      // Update state with results
      setCategorizedImages(result.categorized)
      setExtractedColors(result.colors)
      setProductOrder((result.categorized?.products || []).filter(Boolean))
      setScreenshotOrder((result.categorized?.screenshots || []).filter(Boolean))
      setBackgroundOrder((result.categorized?.backgrounds || []).filter(Boolean))

      // Build filename->serverURL index using server-provided map (preferred)
      if (result.fileUrls) {
        setFilenameToUrl(result.fileUrls)
      } else {
        try {
          const index: Record<string, string> = {}
          const add = (url?: string) => {
            if (!url) return
            try {
              const p = decodeURIComponent((url as string).replace(/^\/file\?p=/, ''))
              const base = p.split('/').pop() || ''
              index[base] = url as string
            } catch {}
          }
          add(result.categorized?.logo)
          ;(result.categorized?.products || []).forEach(add)
          ;(result.categorized?.screenshots || []).forEach(add)
          ;(result.categorized?.backgrounds || []).forEach(add)
          setFilenameToUrl(index)
        } catch {}
      }
      
      // Map categories back to uploaded images for display
      const updatedImages = uploadedImages.map(img => {
        const safeName = img.file.name.replace(/[^A-Za-z0-9._-]/g, '_')
        const analysis = result.analyses?.[img.file.name] || result.analyses?.[safeName]
        // Map AI category (singular) to our plural type for display section
        const aiCat: SingularCategory | undefined = (analysis?.category as any) || undefined
        const displayCat: ImageCategory | undefined = aiCat === 'logo' ? 'logo'
          : aiCat === 'product' ? 'products'
          : aiCat === 'screenshot' ? 'screenshots'
          : aiCat === 'background' ? 'backgrounds'
          : undefined
        return {
          ...img,
          category: displayCat,
          confidence: analysis?.confidence
        }
      })
      setUploadedImages(updatedImages)
      
      // Move to next step
      setStep(2)
    } catch (error: any) {
      toast.add(`Analysis failed: ${error.message}`)
    } finally {
      setAnalyzing(false)
    }
  }

  // Change category for a specific uploaded image
  const updateImageCategory = (id: string, cat: SingularCategory) => {
    setUploadedImages(prev => prev.map(img => img.id === id ? {
      ...img,
      category: cat === 'logo' ? 'logo' : cat === 'product' ? 'products' : cat === 'screenshot' ? 'screenshots' : cat === 'background' ? 'backgrounds' : undefined
    } : img))
  }

  // Rebuild categorizedImages from uploadedImages and filenameToUrl
  const applyCategoryChanges = () => {
    const out: CategorizedImages = { logo: undefined, products: [], screenshots: [], backgrounds: [], analyses: {} as any }
    for (const img of uploadedImages) {
      if (!img.category) continue
      const safe = img.file.name.replace(/[^A-Za-z0-9._-]/g, '_')
      const url = filenameToUrl[safe]
      if (!url) continue
      if (img.category === 'logo') out.logo = url
      else if (img.category === 'products') out.products.push(url)
      else if (img.category === 'screenshots') out.screenshots.push(url)
      else if (img.category === 'backgrounds') out.backgrounds.push(url)
    }
    // Apply explicit orderings if available
    const orderedP = productOrder.length ? productOrder.filter(u => out.products.includes(u)) : out.products
    const orderedS = screenshotOrder.length ? screenshotOrder.filter(u => out.screenshots.includes(u)) : out.screenshots
    const orderedB = backgroundOrder.length ? backgroundOrder.filter(u => out.backgrounds.includes(u)) : out.backgrounds
    setCategorizedImages({ ...out, products: orderedP, screenshots: orderedS, backgrounds: orderedB })
    toast.add('Updated image categorization')
  }

  // Build mapping object from current selections without mutating state
  const buildMappingFromCurrent = (): CategorizedImages => {
    const out: CategorizedImages = { logo: undefined, products: [], screenshots: [], backgrounds: [], analyses: {} as any }
    for (const img of uploadedImages) {
      if (!img.category) continue
      const safe = img.file.name.replace(/[^A-Za-z0-9._-]/g, '_')
      const url = filenameToUrl[safe]
      if (!url) continue
      if (img.category === 'logo') out.logo = url
      else if (img.category === 'products') out.products.push(url)
      else if (img.category === 'screenshots') out.screenshots.push(url)
      else if (img.category === 'backgrounds') out.backgrounds.push(url)
    }
    const orderedP = productOrder.length ? productOrder.filter(u => out.products.includes(u)) : out.products
    const orderedS = screenshotOrder.length ? screenshotOrder.filter(u => out.screenshots.includes(u)) : out.screenshots
    const orderedB = backgroundOrder.length ? backgroundOrder.filter(u => out.backgrounds.includes(u)) : out.backgrounds
    return { ...out, products: orderedP, screenshots: orderedS, backgrounds: orderedB }
  }

  // Simple reorder helpers
  const moveInOrder = (arr: string[], url: string, dir: -1 | 1) => {
    const i = arr.indexOf(url); if (i === -1) return arr
    const j = i + dir; if (j < 0 || j >= arr.length) return arr
    const next = arr.slice(); const t = next[i]; next[i] = next[j]; next[j] = t; return next
  }
  
  // Upload images to Supabase storage in parallel
  const uploadToSupabase = async (effectiveImages: CategorizedImages | null) => {
    try {
      setSupabaseUploading(true)
      
      // Prepare asset mapping for Supabase
      const assetMapping: UserAssetMapping = {}
      
      // Upload user images to Supabase and build mapping
      for (const img of uploadedImages) {
        if (!img.category || img.category === undefined) continue
        
        const category = img.category === 'products' ? 'product' : 
                        img.category === 'screenshots' ? 'screenshot' :
                        img.category === 'backgrounds' ? 'background' : img.category
        
        // Upload to Supabase storage
        const uploadResult = await fetch('/api/assets/upload', {
          method: 'POST',
          body: (() => {
            const formData = new FormData()
            formData.append('file', img.file)
            formData.append('category', category)
            return formData
          })(),
          headers: (() => {
            const h: HeadersInit = {}
            if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
            return h
          })()
        })
        
        if (uploadResult.ok) {
          const data = await uploadResult.json()
          
          // Build asset mapping
          if (!assetMapping[category]) {
            assetMapping[category] = { selectedImages: [] }
          }
          assetMapping[category].selectedImages.push(data.data.url)
        } else {
          try { console.warn('Supabase upload failed', await uploadResult.text()) } catch {}
        }
      }
      
      // Save user preferences to Supabase
      await fetch('/api/assets/mapping', {
        method: 'POST',
        headers: (() => {
          const h: HeadersInit = { 'Content-Type': 'application/json' }
          if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
          return h
        })(),
        body: JSON.stringify({
          asset_preferences: assetMapping,
          brand_colors: extractedColors || {
            brand_primary: "#3B82F6",
            brand_secondary: "#6366F1",
            accent_1: "#8B5CF6",
            accent_2: "#06B6D4"
          }
        })
      })
      
      console.log('Successfully uploaded to Supabase storage')
      return assetMapping
    } catch (error) {
      console.warn('Failed to upload to Supabase storage:', error)
      return null
    } finally {
      setSupabaseUploading(false)
    }
  }

  // Proceed to text overlay
  const proceedToTextOverlay = async () => {
    setLoading(true)
    
    try {
      // Always use the latest categorization (even if "Apply" wasn't clicked)
      const effectiveImages: CategorizedImages | null = (() => {
        // If user never changed anything, keep server categorization
        // Otherwise, rebuild from the current dropdown selections
        const anyUserSet = uploadedImages.some(u => u.category)
        if (!anyUserSet && categorizedImages) return categorizedImages
        const built = buildMappingFromCurrent()
        // If built has nothing (e.g. no urls yet), fall back
        const hasAny = !!(built.logo || built.products.length || built.screenshots.length || built.backgrounds.length)
        return hasAny ? built : (categorizedImages || built)
      })()
      // Upload to Supabase first so preferences are available for mapping
      const posted = await uploadToSupabase(effectiveImages)

      // Try to prefer Supabase URLs for mapping if available
      let supabaseImages: CategorizedImages | null = null
      let supabaseColors: ExtractedColors | null = null
      // Prefer the mapping we just posted (most up-to-date)
      if (posted) {
        const pickPosted = (k: string): string[] => Array.isArray((posted as any)?.[k]?.selectedImages) ? (posted as any)[k].selectedImages.filter(Boolean) : []
        const logoArrP = pickPosted('logo')
        supabaseImages = {
          logo: logoArrP.length ? logoArrP[0] : undefined,
          products: pickPosted('product'),
          screenshots: pickPosted('screenshot'),
          backgrounds: pickPosted('background'),
          analyses: {}
        }
      }
      try {
        const res = await fetch('/api/assets/mapping', { method: 'GET', headers: (() => {
          const h: HeadersInit = {}
          if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
          return h
        })() })
        if (res.ok) {
          const data = await res.json()
          if (!supabaseImages) {
            const prefs = data?.asset_preferences || {}
            const pickDb = (k: string): string[] => Array.isArray(prefs?.[k]?.selectedImages) ? prefs[k].selectedImages.filter(Boolean) : []
            const logoArr = pickDb('logo')
            supabaseImages = {
              logo: logoArr.length ? logoArr[0] : undefined,
              products: pickDb('product'),
              screenshots: pickDb('screenshot'),
              backgrounds: pickDb('background'),
              analyses: {}
            }
          }
          supabaseColors = data?.brand_colors || null
        }
      } catch {}

      // Save mapping data to session/local storage (prefer supabase if present)
      const imagesToPersist = (supabaseImages && (supabaseImages.logo || supabaseImages.products.length || supabaseImages.screenshots.length || supabaseImages.backgrounds.length))
        ? supabaseImages
        : effectiveImages
      const colorsToPersist = supabaseColors || extractedColors
      const mappingData = {
        images: imagesToPersist,
        colors: colorsToPersist,
        timestamp: Date.now()
      }
      // Persist mapping on backend for single source of truth (prefer supabase URLs)
      try {
        const saveRes = await apiPost<{ ok: boolean; id: string }>(`/mapping/save`, {
          mapping: {
            images: {
              logo: imagesToPersist?.logo || null,
              products: imagesToPersist?.products || [],
              screenshots: imagesToPersist?.screenshots || [],
              backgrounds: imagesToPersist?.backgrounds || []
            },
            colors: colorsToPersist
          }
        })
        if (saveRes?.id) {
          localStorage.setItem('adcreator_mapping_id', saveRes.id)
        }
      } catch (e) {
        console.warn('Failed to persist mapping on backend, falling back to local storage only', e)
      }
      
      localStorage.setItem('adcreator_mapping', JSON.stringify(mappingData))
      
      // Navigate to text overlay
      router.push('/text-overlay')
    } catch (error: any) {
      toast.add(`Failed to save mapping: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 via-slate-50 to-blue-100 p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-900">
            {step === 1 ? 'Upload Your Assets' : 'Review & Confirm'}
          </h1>
          <p className="text-lg text-gray-600">
            {step === 1 
              ? 'Upload your logo, product images, and other marketing assets'
              : 'AI has categorized your images and extracted brand colors'
            }
          </p>
        </div>
        
        {/* Progress indicator */}
        <div className="flex justify-center">
          <div className="flex items-center space-x-4">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
              1
            </div>
            <div className={`w-24 h-1 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`} />
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
              2
            </div>
          </div>
        </div>
        
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card className="p-8 bg-gradient-to-br from-white via-blue-50/30 to-white border border-blue-200">
                {/* Upload area */}
                <div className="space-y-6">
                  <div
                    className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                      uploadedImages.length > 0 ? 'border-gray-300 bg-gray-50' : 'border-gray-400 hover:border-gray-500'
                    }`}
                    onClick={() => document.getElementById('file-input')?.click()}
                  >
                    <input
                      id="file-input"
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-lg font-medium text-gray-700">
                      Click to upload images
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      PNG, JPG, GIF, WebP up to 10MB each
                    </p>
                  </div>
                  
                  {/* Uploaded images grid */}
                  {uploadedImages.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {uploadedImages.map(img => (
                        <motion.div
                          key={img.id}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="relative group"
                        >
                          <img
                            src={img.url}
                            alt={img.file.name}
                            className="w-full h-32 object-cover rounded-lg"
                          />
                          <button
                            onClick={() => removeImage(img.id)}
                            className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <p className="text-xs text-gray-600 mt-1 truncate">
                            {img.file.name}
                          </p>
                        </motion.div>
                      ))}
                    </div>
                  )}
                  
                  {/* Instructions */}
                  <div className="bg-blue-50 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2">What to upload:</h3>
                    <ul className="space-y-1 text-sm text-blue-800">
                      <li>• Your company logo (for brand colors)</li>
                      <li>• Product images (main marketing visuals)</li>
                      <li>• App screenshots (if applicable)</li>
                      <li>• Background images or patterns</li>
                    </ul>
                  </div>
                  
                  {/* Action button */}
                  <div className="flex justify-end">
                    <Button
                      onClick={analyzeImages}
                      disabled={uploadedImages.length === 0 || analyzing}
                      size="lg"
                    >
                      {analyzing ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          Analyze Images
                          <ArrowRight className="ml-2 h-5 w-5" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Categorized Images */}
              <Card className="p-6 bg-gradient-to-br from-white via-blue-50/30 to-white border border-blue-200">
                <h2 className="text-xl font-semibold mb-4">Image Categories</h2>
                <div className="space-y-4">
                  {/* Logo */}
                  {categorizedImages?.logo && (
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-200 via-blue-100 to-blue-50 rounded-xl flex items-center justify-center shadow-sm">
                          <ImageIcon className="w-6 h-6 text-blue-700" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 text-lg">Logo</h3>
                        <p className="text-sm text-slate-500">Primary brand identity</p>
                        <div className="mt-3">
                          <div className="inline-block p-3 bg-gradient-to-br from-blue-50 via-slate-50 to-blue-100 rounded-xl">
                            <img
                              src={`${API_BASE}${categorizedImages.logo}`}
                              alt="Logo"
                              className="h-24 object-contain"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Products */}
                  {categorizedImages?.products && categorizedImages.products.length > 0 && (
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-green-600" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">Product Images ({categorizedImages.products.length})</h3>
                        <p className="text-sm text-gray-500">Main marketing visuals</p>
                        <div className="mt-2 flex gap-2">
                          {categorizedImages.products.map((img, idx) => (
                            <img
                              key={idx}
                              src={`${API_BASE}${img}`}
                              alt={`Product ${idx + 1}`}
                              className="h-20 w-20 object-cover rounded"
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Screenshots */}
                  {categorizedImages?.screenshots && categorizedImages.screenshots.length > 0 && (
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-blue-600" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">Screenshots ({categorizedImages.screenshots.length})</h3>
                        <p className="text-sm text-gray-500">App or website captures</p>
                        <div className="mt-2 flex gap-2">
                          {categorizedImages.screenshots.map((img, idx) => (
                            <img
                              key={idx}
                              src={`${API_BASE}${img}`}
                              alt={`Screenshot ${idx + 1}`}
                              className="h-20 w-20 object-cover rounded"
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Verify & Adjust Categorization */}
              <Card className="p-6 bg-gradient-to-br from-white via-blue-50/30 to-white border border-blue-200">
                <h2 className="text-xl font-semibold mb-4">Verify Categorization</h2>
                <p className="text-sm text-gray-600 mb-3">Adjust any image categories below if needed.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {uploadedImages.map(img => {
                    const current: SingularCategory = img.category === 'logo' ? 'logo' : img.category === 'products' ? 'product' : img.category === 'screenshots' ? 'screenshot' : img.category === 'backgrounds' ? 'background' : 'ignore'
                    return (
                      <div key={img.id} className="border rounded-lg p-3 bg-white">
                        <img src={img.url} alt={img.file.name} className="w-full h-28 object-cover rounded" />
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 truncate">{img.file.name}</p>
                          {typeof img.confidence === 'number' && (
                            <p className="text-xs text-gray-400">AI confidence: {(img.confidence*100).toFixed(0)}%</p>
                          )}
                          <select
                            value={current}
                            onChange={(e) => updateImageCategory(img.id, e.target.value as SingularCategory)}
                            className="mt-2 w-full border rounded px-2 py-1 text-sm"
                          >
                            <option value="ignore">Ignore</option>
                            <option value="logo">Logo</option>
                            <option value="product">Product</option>
                            <option value="screenshot">Screenshot</option>
                            <option value="background">Background</option>
                          </select>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-4 flex justify-end">
                  <Button onClick={applyCategoryChanges} variant="outline">Apply Categorization Changes</Button>
                </div>
              </Card>
              
              {/* Extracted Colors (editable) */}
              {extractedColors && (
                <Card className="p-6 bg-gradient-to-br from-white via-blue-50/30 to-white border border-blue-200">
                  <h2 className="text-xl font-semibold mb-4 flex items-center">
                    <Palette className="mr-2 h-5 w-5" />
                    Brand Colors
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">Automatically extracted from your logo. You can tweak them here.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <div className="h-16 rounded-lg shadow-sm border" style={{ backgroundColor: extractedColors.brand_primary }} />
                      <label className="text-sm">Primary</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(extractedColors.brand_primary||'') ? extractedColors.brand_primary : '#000000'} onChange={(e)=>setExtractedColors(c=>({...c!, brand_primary:e.target.value}))} />
                        <input className="flex-1 px-2 py-1 border rounded" value={extractedColors.brand_primary} onChange={(e)=>setExtractedColors(c=>({...c!, brand_primary:e.target.value}))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-16 rounded-lg shadow-sm border" style={{ backgroundColor: extractedColors.brand_secondary }} />
                      <label className="text-sm">Secondary</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(extractedColors.brand_secondary||'') ? extractedColors.brand_secondary : '#000000'} onChange={(e)=>setExtractedColors(c=>({...c!, brand_secondary:e.target.value}))} />
                        <input className="flex-1 px-2 py-1 border rounded" value={extractedColors.brand_secondary} onChange={(e)=>setExtractedColors(c=>({...c!, brand_secondary:e.target.value}))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-16 rounded-lg shadow-sm border" style={{ backgroundColor: extractedColors.accent_1 }} />
                      <label className="text-sm">Accent 1</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(extractedColors.accent_1||'') ? extractedColors.accent_1 : '#000000'} onChange={(e)=>setExtractedColors(c=>({...c!, accent_1:e.target.value}))} />
                        <input className="flex-1 px-2 py-1 border rounded" value={extractedColors.accent_1} onChange={(e)=>setExtractedColors(c=>({...c!, accent_1:e.target.value}))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-16 rounded-lg shadow-sm border" style={{ backgroundColor: extractedColors.accent_2 }} />
                      <label className="text-sm">Accent 2</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(extractedColors.accent_2||'') ? extractedColors.accent_2 : '#000000'} onChange={(e)=>setExtractedColors(c=>({...c!, accent_2:e.target.value}))} />
                        <input className="flex-1 px-2 py-1 border rounded" value={extractedColors.accent_2} onChange={(e)=>setExtractedColors(c=>({...c!, accent_2:e.target.value}))} />
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Ranking sections */}
              {categorizedImages && (categorizedImages.products?.length || 0) > 0 && (
                <Card className="p-6 bg-gradient-to-br from-white via-blue-50/30 to-white border border-blue-200">
                  <h2 className="text-xl font-semibold mb-2">Product Priority</h2>
                  <p className="text-sm text-gray-600 mb-4">Order determines which product is used first; we cycle through before reusing.</p>
                  <div className="space-y-2">
                    {(productOrder.length ? productOrder : categorizedImages.products).map((u)=> (
                      <div key={u} className="flex items-center justify-between border rounded p-2">
                        <div className="flex items-center gap-3 truncate">
                          <img src={`${API_BASE}${u}`} className="w-12 h-12 object-cover rounded" />
                          <span className="text-sm text-slate-800 truncate max-w-xs">{decodeURIComponent(u.replace(/^\/file\?p=/,''))}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" onClick={()=>setProductOrder(prev=>moveInOrder(prev.length?prev:categorizedImages.products, u, -1))}>↑</Button>
                          <Button variant="outline" onClick={()=>setProductOrder(prev=>moveInOrder(prev.length?prev:categorizedImages.products, u, 1))}>↓</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
              {categorizedImages && (categorizedImages.screenshots?.length || 0) > 0 && (
                <Card className="p-6 bg-gradient-to-br from-white via-blue-50/30 to-white border border-blue-200">
                  <h2 className="text-xl font-semibold mb-2">Screenshot Priority</h2>
                  <div className="space-y-2">
                    {(screenshotOrder.length ? screenshotOrder : categorizedImages.screenshots).map((u)=> (
                      <div key={u} className="flex items-center justify-between border rounded p-2">
                        <div className="flex items-center gap-3 truncate">
                          <img src={`${API_BASE}${u}`} className="w-12 h-12 object-cover rounded" />
                          <span className="text-sm text-slate-800 truncate max-w-xs">{decodeURIComponent(u.replace(/^\/file\?p=/,''))}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" onClick={()=>setScreenshotOrder(prev=>moveInOrder(prev.length?prev:categorizedImages.screenshots, u, -1))}>↑</Button>
                          <Button variant="outline" onClick={()=>setScreenshotOrder(prev=>moveInOrder(prev.length?prev:categorizedImages.screenshots, u, 1))}>↓</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
              {categorizedImages && (categorizedImages.backgrounds?.length || 0) > 0 && (
                <Card className="p-6 bg-gradient-to-br from-white via-blue-50/30 to-white border border-blue-200">
                  <h2 className="text-xl font-semibold mb-2">Background Priority</h2>
                  <div className="space-y-2">
                    {(backgroundOrder.length ? backgroundOrder : categorizedImages.backgrounds).map((u)=> (
                      <div key={u} className="flex items-center justify-between border rounded p-2">
                        <div className="flex items-center gap-3 truncate">
                          <img src={`${API_BASE}${u}`} className="w-12 h-12 object-cover rounded" />
                          <span className="text-sm text-slate-800 truncate max-w-xs">{decodeURIComponent(u.replace(/^\/file\?p=/,''))}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" onClick={()=>setBackgroundOrder(prev=>moveInOrder(prev.length?prev:categorizedImages.backgrounds, u, -1))}>↑</Button>
                          <Button variant="outline" onClick={()=>setBackgroundOrder(prev=>moveInOrder(prev.length?prev:categorizedImages.backgrounds, u, 1))}>↓</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
              
              {/* Action buttons */}
              <div className="flex justify-between items-center">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="px-6 py-3 rounded-xl border-slate-200 hover:bg-slate-50"
                >
                  <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
                  Back
                </Button>
                <Button
                  onClick={proceedToTextOverlay}
                  disabled={loading || supabaseUploading}
                  size="lg"
                  className="bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 hover:from-blue-900 hover:via-blue-800 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all px-8 py-6 text-lg rounded-xl"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Saving configuration...
                    </>
                  ) : supabaseUploading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Uploading to storage...
                    </>
                  ) : (
                    <>
                      Continue to Ad Creation
                      <CheckCircle2 className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <ProtectedRoute>
      <OnboardingContent />
    </ProtectedRoute>
  )
}
