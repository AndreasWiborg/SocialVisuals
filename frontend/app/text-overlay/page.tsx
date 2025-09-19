"use client"
import * as React from 'react'
import { apiGet, apiPost, API_BASE } from '@/lib/api'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { useToast } from '@/components/ui/toast'
import { Loader2, Download, AlertCircle, Wand2, Image as ImageIcon } from 'lucide-react'
import { useAuth } from '@/lib/auth/context'

// Types used in this module
type GalleryItem = { name: string; url?: string; outPath?: string; templateId: string; selected: boolean }

const ABSOLUTE_URL_RE = /^https?:\/\//i

type RenderedImage = { templateId: string; url: string; downloadUrl?: string; downloadName?: string }
type ComposeSvgResult = { ok: boolean; url?: string; outPath?: string; name: string }

function buildImageUrls(templateId: string, result: { url?: string | null; outPath?: string | null }) {
  const rawUrl = (result?.url ?? '').trim()
  const hasRawUrl = rawUrl.length > 0
  const isAbsolute = hasRawUrl && ABSOLUTE_URL_RE.test(rawUrl)
  const localUrl = result?.outPath ? `${API_BASE}/file?p=${encodeURIComponent(result.outPath)}` : ''
  const relativeUrl = hasRawUrl && !isAbsolute ? `${API_BASE}${rawUrl}` : ''
  const proxiedUrl = isAbsolute ? `${API_BASE}/image/proxy?u=${encodeURIComponent(rawUrl)}` : ''
  const filename = (() => {
    if (result?.outPath) {
      const parts = result.outPath.split('/')
      return parts[parts.length - 1] || `${templateId}.png`
    }
    if (hasRawUrl) {
      try {
        const parsed = new URL(rawUrl)
        const segments = parsed.pathname.split('/')
        const name = segments.pop()
        if (name && name.trim().length > 0) return name
      } catch {}
    }
    return `${templateId}.png`
  })()
  const displayUrl = localUrl || relativeUrl || proxiedUrl || rawUrl
  let downloadUrl = ''
  if (proxiedUrl) {
    downloadUrl = `${proxiedUrl}${proxiedUrl.includes('?') ? '&' : '?'}download=1&filename=${encodeURIComponent(filename)}`
  } else if (rawUrl) {
    downloadUrl = rawUrl
  } else if (relativeUrl) {
    downloadUrl = relativeUrl
  } else if (localUrl) {
    downloadUrl = localUrl
  }
  return { displayUrl, downloadUrl, downloadName: filename }
}

function TextOverlayContent() {
  const toast = useToast()
  const { userCredits, session, refreshCredits, user } = useAuth()
  const brandId = session?.user?.id || user?.id || null
  
  // Form state
  const [url, setUrl] = React.useState('https://example.com')
  const [product, setProduct] = React.useState({ name: '', benefit: '' })
  const [audience, setAudience] = React.useState('')
  const [tone, setTone] = React.useState('friendly, concise')
  const [brandVoice, setBrandVoice] = React.useState('confident, helpful')
  const [tab, setTab] = React.useState<'url'|'manual'>('url')
  const [manualOverride, setManualOverride] = React.useState(false)
  const [manualDoc, setManualDoc] = React.useState('')
  const [locale, setLocale] = React.useState('en-US')
  const [mustInclude, setMustInclude] = React.useState<string[]>([])
  const [mustAvoid, setMustAvoid] = React.useState<string[]>([])
  
  // Generation state
  const [generating, setGenerating] = React.useState(false)
  const [renderedImages, setRenderedImages] = React.useState<RenderedImage[]>([])
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [progress, setProgress] = React.useState(0)
  const [phase, setPhase] = React.useState<'idle'|'compose'|'overlay'>('idle')
  const [statusMsg, setStatusMsg] = React.useState('')
  
  // Mapping data from onboarding
  const [mappingData, setMappingData] = React.useState<any>(null)
  // Optional AI research enrichment
  const [aiResearch, setAiResearch] = React.useState<boolean>(false)
  
  // Fonts
  const curatedFonts = [
    'Random',
    'Montserrat','Poppins','Playfair Display','Bebas Neue','Oswald','Raleway','Inter','Lato','Rubik','Nunito','DM Sans','Kanit','Archivo Black','Barlow','Exo 2','Source Sans 3','Pacifico'
  ]
  const [selectedFont, setSelectedFont] = React.useState<string>('Random')
  const [headlineUppercase, setHeadlineUppercase] = React.useState<boolean>(false)
  const [headlineBold, setHeadlineBold] = React.useState<boolean>(false)
  const [bodyUppercase, setBodyUppercase] = React.useState<boolean>(false)
  const [bodyBold, setBodyBold] = React.useState<boolean>(false)
  const [subUppercase, setSubUppercase] = React.useState<boolean>(false)
  const [subBold, setSubBold] = React.useState<boolean>(false)
  const [ctaUppercase, setCtaUppercase] = React.useState<boolean>(false)
  const [ctaBold, setCtaBold] = React.useState<boolean>(false)
  const [headlineColor, setHeadlineColor] = React.useState<string>('')
  const [bodyColor, setBodyColor] = React.useState<string>('')
  const [subheadlineColor, setSubheadlineColor] = React.useState<string>('')
  const [ctaColor, setCtaColor] = React.useState<string>('')
  const [showColorHelp, setShowColorHelp] = React.useState<boolean>(false)
  const headlineColorRef = React.useRef<HTMLInputElement>(null)
  const bodyColorRef = React.useRef<HTMLInputElement>(null)
  const subColorRef = React.useRef<HTMLInputElement>(null)
  const ctaColorRef = React.useRef<HTMLInputElement>(null)
  
  // Template Gallery state
  const [gallery, setGallery] = React.useState<GalleryItem[]>([])
  const [galleryLoading, setGalleryLoading] = React.useState(false)
  // Color overrides for quick recompose (session-only)
  const [colorOverrides, setColorOverrides] = React.useState<{ brand_primary?: string; brand_secondary?: string; accent_1?: string; accent_2?: string }>({})

  const handleDownload = React.useCallback(async (img: RenderedImage) => {
    const href = img.downloadUrl || img.url
    if (!href) return
    const filename = img.downloadName || `${img.templateId}.png`
    try {
      const response = await fetch(href, { credentials: 'include' })
      if (!response.ok) throw new Error(`status ${response.status}`)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('download failed, opening fallback', err)
      window.open(href, '_blank')
    }
  }, [])

  // Credit calculator (shown after click)
  const selectedCount = React.useMemo(() => gallery.filter(g => g.selected).length, [gallery])
  const perTemplate = 1 + ((aiResearch && !manualOverride) ? 0.5 : 0)
  const defaultBatchCount = 5 // when generating without selection
  const [lastCost, setLastCost] = React.useState<number | null>(null)
  const [insufficient, setInsufficient] = React.useState<{ needed: number; have: number } | null>(null)
  
  // Load mapping data on mount
  React.useEffect(() => {
    const data = localStorage.getItem('adcreator_mapping')
    if (data) {
      try {
        setMappingData(JSON.parse(data))
      } catch (e) {
        console.error('Failed to parse mapping data:', e)
      }
    }
  }, [])

  // Load settings for font style (headline uppercase/bold)
  React.useEffect(() => {
    (async () => {
      try {
        const res = await apiGet('/settings') as { ok: boolean, settings: any }
        const s = res.settings || {}
        setHeadlineUppercase(!!s.headlineUppercase)
        setHeadlineBold(String(s.headlineWeight || 'normal').toLowerCase() === 'bold')
        setBodyUppercase(!!s.bodyUppercase)
        setBodyBold(String(s.bodyWeight || 'normal').toLowerCase() === 'bold')
        setSubUppercase(!!s.subheadlineUppercase)
        setSubBold(String(s.subheadlineWeight || 'normal').toLowerCase() === 'bold')
        setCtaUppercase(!!s.ctaUppercase)
        setCtaBold(String(s.ctaWeight || 'normal').toLowerCase() === 'bold')
        setHeadlineColor(s.headlineColor || '')
        setBodyColor(s.bodyColor || '')
        setSubheadlineColor(s.subheadlineColor || '')
        setCtaColor(s.ctaColor || '')
      } catch {}
    })()
  }, [])

  const saveFontStyleSettings = async (u: boolean, b: boolean) => {
    try {
      await apiPost('/settings', { headlineUppercase: u, headlineWeight: b ? 'bold' : 'normal' })
      toast.add('Headline style saved')
    } catch (e: any) {
      toast.add(`Failed to save: ${e.message}`)
    }
  }
  const saveBodyStyle = async (u: boolean, b: boolean) => {
    try { await apiPost('/settings', { bodyUppercase: u, bodyWeight: b ? 'bold' : 'normal' }); toast.add('Body style saved') } catch (e:any) { toast.add(`Failed to save: ${e.message}`) }
  }
  const saveSubStyle = async (u: boolean, b: boolean) => {
    try { await apiPost('/settings', { subheadlineUppercase: u, subheadlineWeight: b ? 'bold' : 'normal' }); toast.add('Subheadline style saved') } catch (e:any) { toast.add(`Failed to save: ${e.message}`) }
  }
  const saveCtaStyle = async (u: boolean, b: boolean) => {
    try { await apiPost('/settings', { ctaUppercase: u, ctaWeight: b ? 'bold' : 'normal' }); toast.add('CTA style saved') } catch (e:any) { toast.add(`Failed to save: ${e.message}`) }
  }

  const saveColor = async (key: 'headlineColor'|'bodyColor'|'subheadlineColor'|'ctaColor', value: string) => {
    try {
      const payload: any = {}; payload[key] = value || null;
      await apiPost('/settings', payload)
      toast.add('Text color saved')
    } catch (e:any) {
      toast.add(`Failed to save color: ${e.message}`)
    }
  }

  // Auto-compose previews when mapping is present and gallery is empty
  const autoComposedRef = React.useRef(false)
  React.useEffect(() => {
    const mappingId = localStorage.getItem('adcreator_mapping_id') || ''
    if (!autoComposedRef.current && mappingId && gallery.length === 0 && !galleryLoading) {
      autoComposedRef.current = true
      composePreviews()
    }
  }, [mappingData, gallery.length, galleryLoading])

  // Animated progress + rotating messages while generating
  React.useEffect(() => {
    if (!generating) { setProgress(0); setPhase('idle'); return }
    let pct = 0
    const tick = () => {
      const cap = phase === 'compose' ? 90 : 95
      if (pct < cap) {
        pct += Math.max(1, Math.floor((cap - pct) * 0.05))
        setProgress(pct)
      }
    }
    const timer = setInterval(tick, 300)
    const msgs = [
      'Brewing ideas and arranging layers…',
      'Composing SVG and inlining images…',
      'Measuring text areas and constraints…',
      'Generating headline candidates…',
      'Laying out text with pixel-fit passes…'
    ]
    let mi = 0
    setStatusMsg(msgs[0])
    const msgTimer = setInterval(() => { mi = (mi + 1) % msgs.length; setStatusMsg(msgs[mi]) }, 1200)
    return () => { clearInterval(timer); clearInterval(msgTimer) }
  }, [generating, phase])

  // Close preview with ESC
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewUrl(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  
  // Handle URL fetch
  const fetchFromUrl = async () => {
    if (!url) {
      toast.add('Please enter a URL')
      return
    }
    
    // Ensure URL has protocol
    let validUrl = url.trim()
    if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
      validUrl = 'https://' + validUrl
    }
    
    try {
      const res = await apiPost<{ ctx?: any }>('/ctx/fromUrl', { url: validUrl, enrich: aiResearch })
      let fetched = res.ctx
      
      // Update form with fetched data
      if (fetched.product) {
        setProduct({ name: fetched.product.name || '', benefit: fetched.product.benefit || '' })
      }
      if (fetched.audience) setAudience(fetched.audience)
      if (fetched.tone) setTone(fetched.tone)
      if (fetched.brandVoice) setBrandVoice(fetched.brandVoice)
      if (fetched.locale) setLocale(fetched.locale)
      // Persist fetched context (including optional enrichment)
      try { localStorage.setItem('adcreator_ctx', JSON.stringify(fetched)) } catch {}
      
      toast.add('Context fetched from URL')
    } catch (e: any) {
      console.error('Failed to fetch from URL:', e)
      toast.add(`Failed to fetch from URL: ${e.message}`)
    }
  }
  
  // Helper to normalize template ID from filename
  const inferTemplateId = (name: string): string => {
    // Keep original casing/underscores to match template JSON ids
    return name.replace(/\.(png|svg)$/i, '')
  }

  // Compose previews from all SVGs using current mapping (fast, cached)
  const composePreviews = async () => {
    const mappingId = localStorage.getItem('adcreator_mapping_id') || ''
    if (!mappingId) {
      toast.add('No mapping found. Complete onboarding first.')
      return
    }
    setGalleryLoading(true)
    try {
      const res = await apiPost<{ results?: ComposeSvgResult[] }>(
        '/compose/svgBatch',
        { mappingId, useCache: true }
      )
      const items = (res.results || []).filter(r => r.ok).map(r => {
        const url = r.url ? `${API_BASE}${r.url}` : (r.outPath ? `${API_BASE}/file?p=${encodeURIComponent(r.outPath)}` : undefined)
        const templateId = inferTemplateId(r.name)
        return { name: r.name, url, outPath: r.outPath, templateId, selected: false } as GalleryItem
      })
      setGallery(items)
      toast.add(`Composed ${items.length} previews`)
    } catch (e: any) {
      console.error('compose previews failed:', e)
      toast.add(`Compose failed: ${e.message}`)
    } finally {
      setGalleryLoading(false)
    }
  }

  // Recompose previews using temporary color overrides (before running text)
  const recomposeWithColors = async () => {
    const mappingId = localStorage.getItem('adcreator_mapping_id') || ''
    const base = mappingData?.mapping || mappingData || {}
    const colors = {
      brand_primary: colorOverrides.brand_primary || mappingData?.colors?.brand_primary,
      brand_secondary: colorOverrides.brand_secondary || mappingData?.colors?.brand_secondary,
      accent_1: colorOverrides.accent_1 || mappingData?.colors?.accent_1,
      accent_2: colorOverrides.accent_2 || mappingData?.colors?.accent_2,
    }
    const mapping = { ...(base || {}), colors }
    setGalleryLoading(true)
    try {
      const res = await apiPost<{ results?: ComposeSvgResult[] }>(
        '/compose/svgBatch',
        { mappingId, mapping, force: true, useCache: false }
      )
      const items = (res.results || []).filter(r => r.ok).map(r => {
        const url = r.url ? `${API_BASE}${r.url}` : (r.outPath ? `${API_BASE}/file?p=${encodeURIComponent(r.outPath)}` : undefined)
        const templateId = inferTemplateId(r.name)
        return { name: r.name, url, outPath: r.outPath, templateId, selected: false } as GalleryItem
      })
      setGallery(items)
      toast.add('Recomposed previews with updated colors')
    } catch (e: any) {
      console.error('recompose failed:', e)
      toast.add(`Recompose failed: ${e.message}`)
    } finally {
      setGalleryLoading(false)
    }
  }

  const toggleSelect = (idx: number) => {
    setGallery(g => g.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it))
  }
  const selectAll = () => setGallery(g => g.map(it => ({ ...it, selected: true })))
  const clearSelection = () => setGallery(g => g.map(it => ({ ...it, selected: false })))

  // Run text overlay only on selected previews
  const runOverlayOnSelected = async () => {
    const picked = gallery.filter(it => it.selected && (it.outPath || it.url))
    if (picked.length === 0) { toast.add('Select at least one template'); return }
    // Credits: 1 per template (+0.5 if AI research and not manual override)
    const debit = Math.ceil(picked.length * (1 + ((aiResearch && !manualOverride) ? 0.5 : 0)))
    setLastCost(debit)
    setInsufficient(null)
    if ((userCredits?.credits_remaining ?? 0) < debit) {
      setInsufficient({ needed: debit, have: userCredits?.credits_remaining ?? 0 })
      toast.add('Not enough credits')
      return
    }
    try {
      if (!brandId) {
        toast.add('User session not ready—please reload and try again')
        return
      }
      // Debit credits before generation
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      const debitRes = await fetch('/api/credits/debit', { method: 'POST', headers, body: JSON.stringify({ amount: debit }) })
      if (!debitRes.ok) {
        const err = await debitRes.json().catch(() => ({}))
        toast.add(err?.error || 'Failed to debit credits')
        return
      }
      await refreshCredits()
      setGenerating(true)
      setRenderedImages([])
      setPhase('overlay')
      setStatusMsg('Generating text overlays on selected templates…')
      // Build ctx similarly to main flow (with optional enrichment)
      let ctx: any = { product, audience, tone, brandVoice, locale, mustInclude, mustAvoid, brandId }
      if (!manualOverride && aiResearch && url && url.trim().length > 0) {
        try {
          let validUrl = url.trim(); if (!validUrl.startsWith('http')) validUrl = 'https://' + validUrl
          const enr = await apiPost<{ ctx?: any }>('/ctx/fromUrl', { url: validUrl, enrich: true })
          if (enr?.ctx?.enriched) ctx = { ...ctx, enriched: enr.ctx.enriched }
        } catch {}
      }
      const jobs = picked.map(it => ({ templateId: it.templateId, bgPath: it.outPath!, ctx, fontFamily: selectedFont && selectedFont !== 'Random' ? selectedFont : undefined }))
      const response = await apiPost('/pipeline/batchFromComposed', { jobs, n: 10, k: 3, enrich: (!manualOverride && aiResearch) }) as { ok: boolean, results: Array<{ templateId: string, ok: boolean, outPath?: string, url?: string }>, runDir: string }
      const successful = response.results.filter(r => r.ok && (r.url || r.outPath))
      setRenderedImages(successful.map(r => {
        const { displayUrl, downloadUrl, downloadName } = buildImageUrls(r.templateId, { url: r.url, outPath: r.outPath })
        return { templateId: r.templateId, url: displayUrl, downloadUrl, downloadName }
      }))
      toast.add(`Generated ${successful.length} images from ${picked.length} selections`)
    } catch (e: any) {
      console.error('overlay-on-selected failed:', e)
      toast.add(`Overlay failed: ${e.message}`)
    } finally {
      setGenerating(false)
    }
  }

  // Generate text overlays
  const generateOverlays = async () => {
    // Credits: estimate default batch size (5)
    const debit = Math.ceil(defaultBatchCount * (1 + (aiResearch ? 0.5 : 0)))
    setLastCost(debit)
    setInsufficient(null)
    if ((userCredits?.credits_remaining ?? 0) < debit) {
      setInsufficient({ needed: debit, have: userCredits?.credits_remaining ?? 0 })
      toast.add('Not enough credits')
      return
    }
    
    try {
      if (!brandId) {
        toast.add('User session not ready—please reload and try again')
        return
      }
      // Debit credits before generation
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      const debitRes = await fetch('/api/credits/debit', { method: 'POST', headers, body: JSON.stringify({ amount: debit }) })
      if (!debitRes.ok) {
        const err = await debitRes.json().catch(() => ({}))
        toast.add(err?.error || 'Failed to debit credits')
        return
      }
      await refreshCredits()
      setGenerating(true)
      setRenderedImages([])
      setProgress(5)
      // Build context
      let ctx: any = {
        product,
        audience,
        tone,
        brandVoice,
        locale,
        mustInclude,
        mustAvoid,
        brandId
      }
      try { localStorage.setItem('adcreator_ctx', JSON.stringify(ctx)) } catch {}
      // If AI research is enabled and URL is provided, enrich ctx via API
      if (aiResearch && url && url.trim().length > 0) {
        try {
          let validUrl = url.trim()
          if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) validUrl = 'https://' + validUrl
          const enr = await apiPost<{ ctx?: any }>('/ctx/fromUrl', { url: validUrl, enrich: true })
          if (enr?.ctx?.enriched) {
            ctx = { ...ctx, enriched: enr.ctx.enriched }
          }
        } catch (e) {
          // Non-fatal; continue without enrichment
        }
      }
      
      // If we have a saved mapping, compose fresh backgrounds from SVGs using it
      const mappingId = localStorage.getItem('adcreator_mapping_id') || ''
      let jobs: Array<{ templateId: string; bgPath: string; ctx: any }> = []

      if (mappingId) {
        setPhase('compose')
        setStatusMsg('Composing backgrounds from SVGs…')
        const composed = await apiPost<{ results?: ComposeSvgResult[] }>(
          '/compose/svgBatch',
          { mappingId, force: true }
        )
        const good = (composed.results || []).filter(r => r.ok && !!r.outPath)
        const limited = good.slice(0, defaultBatchCount)
        jobs = limited.map(r => ({
          templateId: inferTemplateId(r.name),
          bgPath: r.outPath!,
          ctx,
          fontFamily: selectedFont && selectedFont !== 'Random' ? selectedFont : undefined
        }))
      } else {
        // Fallback to prebuilt backgrounds
        const bgResponse = await apiGet('/bg/list?dir=../AdCreator2/backend/output/base-images-test') as { files: Array<{ name: string; path: string }> }
        const preFiles = bgResponse.files.filter(f => f.name.toLowerCase().endsWith('-pre.png'))
        const limitedFiles = preFiles.slice(0, defaultBatchCount)
        jobs = limitedFiles.map(file => ({
          templateId: inferTemplateId(file.name.replace(/-pre$/i, '')),
          bgPath: file.path,
          ctx,
          fontFamily: selectedFont && selectedFont !== 'Random' ? selectedFont : undefined
        }))
      }
      
      if (jobs.length === 0) {
        toast.add('No background templates found')
        return
      }
      
      toast.add(`Generating ${jobs.length} images... This may take ${jobs.length * 10} seconds.`)
      setPhase('overlay')
      setStatusMsg('Generating text overlays and rendering PNGs…')
      
      // Run batch generation without timeout for now
      const response = await apiPost<{ ok: boolean; results: Array<{ templateId: string; ok: boolean; outPath?: string; url?: string }>; runDir: string }>(
        '/pipeline/batchFromComposed',
        {
          jobs,
          n: 10, // LLM generates 10 text variations per template
          k: 3,   // Keep top 3 for ranking
          enrich: aiResearch,
          brandColors: mappingData?.colors ? [
          mappingData.colors.brand_primary,
          mappingData.colors.brand_secondary,
          mappingData.colors.accent_1,
          mappingData.colors.accent_2
        ] : []
        }
      )
      
      // Extract successful results
      const successfulResults = response.results.filter(r => r.ok && (r.url || r.outPath))
      
      if (successfulResults.length === 0) {
        toast.add('No images were generated successfully')
        return
      }
      
      // Store results for display
      setRenderedImages(successfulResults.map(r => {
        const { displayUrl, downloadUrl, downloadName } = buildImageUrls(r.templateId, { url: (r as any).url, outPath: r.outPath })
        return { templateId: r.templateId, url: displayUrl, downloadUrl, downloadName }
      }))
      setProgress(100)
      
      toast.add(`Generated ${successfulResults.length} images successfully`)
    } catch (e: any) {
      console.error('Generation failed:', e)
      toast.add(`Generation failed: ${e.message}`)
    } finally {
      // Small delay to let 100% be visible
      setTimeout(() => setGenerating(false), 400)
    }
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 via-slate-50 to-blue-100">
      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-8">
        {/* Fullscreen loader overlay */}
        {generating && (
          <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center justify-center">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md mx-auto p-8 rounded-3xl shadow-2xl bg-white/95 backdrop-blur-xl border border-slate-200/50"
            >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full border-4 border-gray-200" />
                <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center font-semibold">{progress}%</div>
              </div>
              <div className="text-2xl font-bold">Brewing…</div>
              <div className="text-sm text-gray-600 min-h-[1.25rem]">{statusMsg}</div>
              <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                <div className="h-2 bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-xs text-gray-500">
                This step composes SVGs, inlines images, generates text, and fits it into template areas.
              </div>
            </div>
          </motion.div>
        </div>
      )}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-6xl rounded-3xl overflow-hidden"
        >
          <div className="relative p-6 sm:p-8 text-center bg-gradient-to-br from-blue-100 via-slate-50 via-blue-50 to-slate-100 border border-blue-200">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">
              Provide your URL. Select your font style. Choose your templates.
            </h1>
            <p className="mt-1 text-2xl sm:text-3xl md:text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-800 via-blue-600 via-blue-700 to-blue-900">
              Enjoy finished personalized images.
            </p>
          </div>
        </motion.div>
      
        {/* Input Section */}
        <Card className="p-8 max-w-6xl mx-auto bg-gradient-to-br from-white via-blue-50/30 to-white backdrop-blur-sm border border-blue-200 rounded-3xl shadow-xl">
        <Tabs value={tab} onValueChange={(v)=>setTab(v as 'url' | 'manual')}>
          <TabsList className="grid w-full grid-cols-2 rounded-2xl p-1 bg-gradient-to-r from-slate-100 via-blue-50 to-slate-100">
            <TabsTrigger
              value="url"
              className="rounded-xl text-sm font-semibold transition-all data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-800 data-[state=active]:via-blue-700 data-[state=active]:to-blue-600"
            >From URL</TabsTrigger>
            <TabsTrigger
              value="manual"
              className="rounded-xl text-sm font-semibold transition-all data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-800 data-[state=active]:via-blue-700 data-[state=active]:to-blue-600"
            >Manual Input</TabsTrigger>
          </TabsList>
          
          <TabsContent value="url" className="space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-4 py-3 border border-slate-300 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all text-[15px]"
                />
              </div>
              <Button onClick={fetchFromUrl} className="px-6 rounded-2xl bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 hover:from-blue-900 hover:via-blue-800 hover:to-blue-700 text-white shadow-md hover:shadow-lg">
                Fetch
              </Button>
            </div>
            {/* Tone chips (visual only) */}
            <div className="flex items-center gap-2 text-sm">
              {['Friendly','Bold','Premium','Playful'].map((t) => (
                <span key={t} className="inline-flex items-center px-3 py-1 rounded-xl border border-slate-300 bg-white shadow-sm text-slate-700">
                  {t}
                </span>
              ))}
              <span className="text-slate-500 ml-1">applies to generated copy</span>
            </div>
            {/* AI Research Card (design-only; same toggle state) */}
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-100 via-slate-50 via-blue-50 to-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">AI Research: Stand Out Beyond Your Brand</div>
                  <p className="text-sm text-slate-700 mt-1">Understands your service beyond your site. Analyzes industry and competitors before text creation so your visuals truly stand out.</p>
                  <div className="text-xs text-indigo-700 mt-1">+0.5 credit per template</div>
                </div>
                <label className="flex items-center gap-2 text-sm select-none">
                  <input id="ai-research-inline" type="checkbox" className="hidden" checked={aiResearch} onChange={(e)=>setAiResearch(e.target.checked)} />
                  <button
                    onClick={()=>setAiResearch(v=>!v)}
                    className={`px-4 py-1.5 rounded-full border transition shadow-sm ${aiResearch ? 'text-white bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 border-transparent' : 'bg-gradient-to-r from-white via-blue-50/50 to-white text-slate-700 border-slate-300 hover:bg-gradient-to-r hover:from-blue-50 hover:to-slate-50'}`}
                  >{aiResearch ? 'Enabled' : 'Enable'}</button>
                </label>
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              <input
                value={product.name}
                onChange={(e) => setProduct({ ...product, name: e.target.value })}
                placeholder="Product Name (e.g., Acme Pro)"
                className="px-4 py-3 border border-slate-300 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all text-[15px]"
              />
              <input
                value={product.benefit}
                onChange={(e) => setProduct({ ...product, benefit: e.target.value })}
                placeholder="Key Benefit (e.g., Save 10 hours per week)"
                className="px-4 py-3 border border-slate-300 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all text-[15px]"
              />
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Target Audience (e.g., Small business owners)"
                className="px-4 py-3 border border-slate-300 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all text-[15px]"
              />
            </div>
          </TabsContent>
          
          {tab === 'manual' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-semibold text-slate-900">Manual Input</div>
                    <p className="text-sm text-slate-700 mt-1">Paste any information about your product, audience, industry and competitors. This replaces website context for text generation.</p>
                  </div>
                  <label className="flex items-center gap-2 whitespace-nowrap text-sm">
                    <input type="checkbox" checked={manualOverride} onChange={(e)=>setManualOverride(e.target.checked)} />
                    <span className="text-slate-700">Use manual context</span>
                  </label>
                </div>
                <textarea
                  placeholder="Paste your document here..."
                  value={manualDoc}
                  onChange={(e)=>setManualDoc(e.target.value)}
                  className="mt-3 w-full min-h-[160px] p-3 border border-slate-300 rounded-2xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
                <div className="text-xs text-slate-500 mt-1">Secure: used only for generation. URL enrichment is disabled when manual context is enabled.</div>
              </div>
            </div>
          )}
        </Tabs>

        {/* Font picker */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">Font family</label>
          <select
            value={selectedFont}
            onChange={(e) => setSelectedFont(e.target.value)}
            className="md:col-span-10 px-3 py-2 border border-slate-300 rounded-2xl bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 text-[15px]"
          >
            {curatedFonts.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        {/* Dynamic font preview */}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">Preview</label>
          <div className="md:col-span-10 border border-slate-300 rounded-2xl p-4 bg-white">
            <div
              className="text-lg"
              style={{
                fontFamily: selectedFont === 'Random' ? 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif' : selectedFont,
                fontWeight: headlineBold ? 800 : 700,
                letterSpacing: '0.02em',
                textTransform: headlineUppercase ? ('uppercase' as React.CSSProperties['textTransform']) : 'none',
                color: headlineColor || undefined
              }}
            >
              HEADLINE SAMPLE — AA BB CC 123
            </div>
            <div
              className="mt-1 text-sm tracking-wide"
              style={{
                fontFamily: selectedFont === 'Random' ? 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif' : selectedFont,
                fontWeight: bodyBold ? 600 : 500,
                textTransform: bodyUppercase ? ('uppercase' as React.CSSProperties['textTransform']) : 'none',
                color: bodyColor || '#475569'
              }}
            >
              BODY SAMPLE — THE QUICK BROWN FOX JUMPS.
            </div>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          <div className="hidden md:block md:col-span-2" />
          <div className="md:col-span-10 grid grid-cols-12 gap-6 items-start">
            <div className="col-span-12 lg:col-span-7 space-y-4">
              <div className="grid grid-cols-12 gap-3 items-center">
                <label className="text-sm font-semibold text-slate-700 col-span-12 lg:col-span-3">Headline style</label>
                <div className="col-span-12 lg:col-span-9 flex items-center gap-3 flex-wrap">
                  <label className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-xl border transition ${headlineUppercase ? 'bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 text-white border-transparent shadow' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                    <input type="checkbox" checked={headlineUppercase} onChange={(e)=>{ setHeadlineUppercase(e.target.checked); saveFontStyleSettings(e.target.checked, headlineBold) }} />
                    UPPERCASE
                  </label>
                  <label className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-xl border transition ${headlineBold ? 'bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 text-white border-transparent shadow' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                    <input type="checkbox" checked={headlineBold} onChange={(e)=>{ setHeadlineBold(e.target.checked); saveFontStyleSettings(headlineUppercase, e.target.checked) }} />
                    Bold
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-12 gap-3 items-center">
                <label className="text-sm font-semibold text-slate-700 col-span-12 lg:col-span-3">Body style</label>
                <div className="col-span-12 lg:col-span-9 flex items-center gap-3 flex-wrap">
                  <label className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-xl border transition ${bodyUppercase ? 'bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 text-white border-transparent shadow' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}><input type="checkbox" checked={bodyUppercase} onChange={(e)=>{ setBodyUppercase(e.target.checked); saveBodyStyle(e.target.checked, bodyBold) }} /> UPPERCASE</label>
                  <label className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-xl border transition ${bodyBold ? 'bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 text-white border-transparent shadow' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}><input type="checkbox" checked={bodyBold} onChange={(e)=>{ setBodyBold(e.target.checked); saveBodyStyle(bodyUppercase, e.target.checked) }} /> Bold</label>
                </div>
              </div>
              <div className="grid grid-cols-12 gap-3 items-center">
                <label className="text-sm font-semibold text-slate-700 col-span-12 lg:col-span-3">Subheadline style</label>
                <div className="col-span-12 lg:col-span-9 flex items-center gap-3 flex-wrap">
                  <label className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-xl border transition ${subUppercase ? 'bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 text-white border-transparent shadow' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}><input type="checkbox" checked={subUppercase} onChange={(e)=>{ setSubUppercase(e.target.checked); saveSubStyle(e.target.checked, subBold) }} /> UPPERCASE</label>
                  <label className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-xl border transition ${subBold ? 'bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 text-white border-transparent shadow' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}><input type="checkbox" checked={subBold} onChange={(e)=>{ setSubBold(e.target.checked); saveSubStyle(subUppercase, e.target.checked) }} /> Bold</label>
                </div>
              </div>
              <div className="grid grid-cols-12 gap-3 items-center">
                <label className="text-sm font-semibold text-slate-700 col-span-12 lg:col-span-3">CTA style</label>
                <div className="col-span-12 lg:col-span-9 flex items-center gap-3 flex-wrap">
                  <label className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-xl border transition ${ctaUppercase ? 'bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 text-white border-transparent shadow' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}><input type="checkbox" checked={ctaUppercase} onChange={(e)=>{ setCtaUppercase(e.target.checked); saveCtaStyle(e.target.checked, ctaBold) }} /> UPPERCASE</label>
                  <label className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-xl border transition ${ctaBold ? 'bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 text-white border-transparent shadow' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}><input type="checkbox" checked={ctaBold} onChange={(e)=>{ setCtaBold(e.target.checked); saveCtaStyle(ctaUppercase, e.target.checked) }} /> Bold</label>
                </div>
              </div>
            </div>
            <div className="col-span-12 lg:col-span-5 space-y-3">
              <div className="relative flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-slate-700">Text colors (optional)</span>
                <button
                  type="button"
                  aria-label="About text colors"
                  onClick={() => setShowColorHelp(v => !v)}
                  className="h-5 w-5 rounded-full border border-slate-300 text-slate-600 text-[11px] leading-5 text-center hover:bg-slate-100 transition-colors"
                >
                  ?
                </button>
              {showColorHelp && (
                <div className="absolute z-10 left-0 top-full mt-2 w-64 p-3 rounded-xl border border-slate-200 bg-white shadow-xl text-xs text-slate-700">
                  If you don’t set a color, we’ll automatically choose a highly legible color based on the image background and your brand colors.
                </div>
              )}
            </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-700">Headline</div>
                  <button type="button" onClick={() => headlineColorRef.current?.click()} className="h-10 w-full rounded-lg border border-slate-300 overflow-hidden shadow-sm cursor-pointer hover:shadow-md transition-shadow" title="Click to set headline color">
                    <span className={`block h-full w-full ${headlineColor ? '' : 'bg-gradient-to-br from-violet-500 via-sky-400 to-fuchsia-500'}`} style={{ background: headlineColor || undefined }} />
                  </button>
                  <input ref={headlineColorRef} className="sr-only" type="color" value={headlineColor || '#000000'} onChange={(e)=>{ setHeadlineColor(e.target.value); saveColor('headlineColor', e.target.value) }} />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-700">Body</div>
                  <button type="button" onClick={() => bodyColorRef.current?.click()} className="h-10 w-full rounded-lg border border-slate-300 overflow-hidden shadow-sm cursor-pointer hover:shadow-md transition-shadow" title="Click to set body color">
                    <span className={`block h-full w-full ${bodyColor ? '' : 'bg-gradient-to-br from-violet-500 via-sky-400 to-fuchsia-500'}`} style={{ background: bodyColor || undefined }} />
                  </button>
                  <input ref={bodyColorRef} className="sr-only" type="color" value={bodyColor || '#000000'} onChange={(e)=>{ setBodyColor(e.target.value); saveColor('bodyColor', e.target.value) }} />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-700">Subheadline</div>
                  <button type="button" onClick={() => subColorRef.current?.click()} className="h-10 w-full rounded-lg border border-slate-300 overflow-hidden shadow-sm cursor-pointer hover:shadow-md transition-shadow" title="Click to set subheadline color">
                    <span className={`block h-full w-full ${subheadlineColor ? '' : 'bg-gradient-to-br from-violet-500 via-sky-400 to-fuchsia-500'}`} style={{ background: subheadlineColor || undefined }} />
                  </button>
                  <input ref={subColorRef} className="sr-only" type="color" value={subheadlineColor || '#000000'} onChange={(e)=>{ setSubheadlineColor(e.target.value); saveColor('subheadlineColor', e.target.value) }} />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-700">CTA</div>
                  <button type="button" onClick={() => ctaColorRef.current?.click()} className="h-10 w-full rounded-lg border border-slate-300 overflow-hidden shadow-sm cursor-pointer hover:shadow-md transition-shadow" title="Click to set CTA color">
                    <span className={`block h-full w-full ${ctaColor ? '' : 'bg-gradient-to-br from-violet-500 via-sky-400 to-fuchsia-500'}`} style={{ background: ctaColor || undefined }} />
                  </button>
                  <input ref={ctaColorRef} className="sr-only" type="color" value={ctaColor || '#000000'} onChange={(e)=>{ setCtaColor(e.target.value); saveColor('ctaColor', e.target.value) }} />
                </div>
            </div>
          </div>
        </div>
        </div>
        
        {/* Instruction banner above gallery */}
        <div className="mt-6">
          <Card className="p-3 bg-gradient-to-r from-white via-indigo-50 to-white border border-indigo-200 shadow-sm">
            <div className="text-sm text-slate-700">
              Select the templates you want text generated for — <span className="font-semibold text-indigo-700">1 credit per template</span>{aiResearch && !manualOverride ? ' + 0.5 credit for AI research' : ''}
            </div>
          </Card>
        </div>

        {/* Template Gallery */}
        <Card className="mt-8 p-4 sm:p-6 bg-gradient-to-br from-white via-blue-50/20 to-white border border-blue-200">
          <div className="flex items-center justify-between mb-4">
            <div className="text-lg font-semibold">Template Gallery</div>
            {/* Controls removed per request; auto-compose still runs */}
          </div>
          {/* Quick color overrides (session-only) */}
          <div className="mb-6 space-y-4">
            <div className="text-sm font-semibold text-slate-700">Brand Color Overrides</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600">Brand Primary</label>
                <div className="flex gap-2 items-center">
                  <input 
                    type="color" 
                    value={colorOverrides.brand_primary || mappingData?.colors?.brand_primary || '#000000'} 
                    onChange={(e)=>setColorOverrides(c=>({...c, brand_primary:e.target.value}))}
                    className="w-10 h-8 rounded border border-slate-300 cursor-pointer"
                  />
                  <input 
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100" 
                    value={colorOverrides.brand_primary || mappingData?.colors?.brand_primary || ''} 
                    onChange={(e)=>setColorOverrides(c=>({...c, brand_primary:e.target.value}))}
                    placeholder="#000000"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600">Brand Secondary</label>
                <div className="flex gap-2 items-center">
                  <input 
                    type="color" 
                    value={colorOverrides.brand_secondary || mappingData?.colors?.brand_secondary || '#000000'} 
                    onChange={(e)=>setColorOverrides(c=>({...c, brand_secondary:e.target.value}))}
                    className="w-10 h-8 rounded border border-slate-300 cursor-pointer"
                  />
                  <input 
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100" 
                    value={colorOverrides.brand_secondary || mappingData?.colors?.brand_secondary || ''} 
                    onChange={(e)=>setColorOverrides(c=>({...c, brand_secondary:e.target.value}))}
                    placeholder="#000000"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600">Accent 1</label>
                <div className="flex gap-2 items-center">
                  <input 
                    type="color" 
                    value={colorOverrides.accent_1 || mappingData?.colors?.accent_1 || '#000000'} 
                    onChange={(e)=>setColorOverrides(c=>({...c, accent_1:e.target.value}))}
                    className="w-10 h-8 rounded border border-slate-300 cursor-pointer"
                  />
                  <input 
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100" 
                    value={colorOverrides.accent_1 || mappingData?.colors?.accent_1 || ''} 
                    onChange={(e)=>setColorOverrides(c=>({...c, accent_1:e.target.value}))}
                    placeholder="#000000"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600">Accent 2</label>
                <div className="flex gap-2 items-center">
                  <input 
                    type="color" 
                    value={colorOverrides.accent_2 || mappingData?.colors?.accent_2 || '#000000'} 
                    onChange={(e)=>setColorOverrides(c=>({...c, accent_2:e.target.value}))}
                    className="w-10 h-8 rounded border border-slate-300 cursor-pointer"
                  />
                  <input 
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100" 
                    value={colorOverrides.accent_2 || mappingData?.colors?.accent_2 || ''} 
                    onChange={(e)=>setColorOverrides(c=>({...c, accent_2:e.target.value}))}
                    placeholder="#000000"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={recomposeWithColors}
                disabled={galleryLoading}
                className="px-6 py-2 rounded-2xl bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 hover:from-blue-900 hover:via-blue-800 hover:to-blue-700 text-white shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                Recompose Previews with Colors
              </Button>
            </div>
          </div>
          {gallery.length === 0 ? (
            <div className="text-sm text-slate-500">No previews yet. {galleryLoading ? 'Composing…' : 'Previews will appear automatically when your mapping is ready.'}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {gallery.map((g, idx) => (
                <div
                  key={g.name}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSelect(idx)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelect(idx) } }}
                  className={`border-2 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 transform hover:scale-[1.02] hover:shadow-lg ${g.selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'}`}
                  title={g.templateId}
                >
                  <div className="aspect-square bg-gray-100">
                    {g.url ? (
                      <img
                        src={g.url}
                        alt={g.templateId}
                        className="w-full h-full object-contain transition-transform duration-200 ease-out hover:scale-105"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">No image</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        
        <Button
          onClick={() => {
            if (gallery.some(g => g.selected)) runOverlayOnSelected(); else generateOverlays();
          }}
          disabled={generating}
          className="w-full mt-8 h-14 bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 hover:from-blue-900 hover:via-blue-800 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all text-lg font-semibold rounded-xl"
          size="lg"
        >
          {generating ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Generating your designs...
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-5 w-5" />
              Generate Marketing Images
            </>
          )}
        </Button>
        {/* Cost and top-up helper under the button */}
        <div className="mt-3 flex items-center justify-between text-sm">
          <div className="text-slate-700">
            {lastCost != null && (
              <span>Cost for this run: <span className="font-semibold">{lastCost}</span> credits</span>
            )}
          </div>
          {insufficient && (
            <Button variant="outline" onClick={() => window.location.href = '/credits'}>
              Top up credits
            </Button>
          )}
        </div>
      </Card>
      
      {/* Onboarding reminder */}
      {!mappingData && (
        <Card className="p-4 bg-yellow-50 border-yellow-200 max-w-2xl mx-auto">
          <div className="flex items-center space-x-3">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <div className="flex-1">
              <p className="text-sm text-yellow-800">
                No brand assets uploaded. <a href="/onboarding" className="font-medium underline">Start with onboarding</a> to upload your logo and extract brand colors.
              </p>
            </div>
          </div>
        </Card>
      )}
      
      {/* Results Grid */}
      {renderedImages.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Generated Images</h2>
            <Button asChild variant="outline"><a href="/dashboard">Open Dashboard</a></Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {renderedImages.map((img, idx) => (
              <motion.div
                key={`${img.templateId}-${idx}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setPreviewUrl(img.url)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPreviewUrl(img.url) } }}
                    className="aspect-square bg-gray-100 cursor-pointer transition transform hover:scale-[1.02]"
                    title="Click to preview"
                  >
                    <img
                      src={img.url}
                      alt={img.templateId}
                      className="w-full h-full object-contain transition-transform duration-200 ease-out hover:scale-105"
                      loading="lazy"
                      draggable={false}
                    />
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="text-sm font-medium truncate">{img.templateId}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleDownload(img)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      )}
      
        {/* Empty state */}
        {!generating && renderedImages.length === 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-center py-20"
          >
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mx-auto mb-6">
              <ImageIcon className="h-12 w-12 text-violet-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">Ready to create amazing content?</h3>
            <p className="text-slate-600 max-w-md mx-auto">Enter your product details above and let AI generate professional marketing images with perfect text placement</p>
          </motion.div>
        )}

        {/* Fullscreen preview modal for generated images */}
        {previewUrl && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setPreviewUrl(null)}
          >
            <div
              className="relative max-w-5xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="absolute -top-10 right-0 text-white/90 hover:text-white text-sm"
                onClick={() => setPreviewUrl(null)}
              >
                Close (Esc)
              </button>
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-auto rounded-lg shadow-2xl"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function TextOverlayPage() {
  return (
    <ProtectedRoute>
      <TextOverlayContent />
    </ProtectedRoute>
  )
}
