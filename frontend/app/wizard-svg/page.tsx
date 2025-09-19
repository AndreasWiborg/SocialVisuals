"use client"
import * as React from 'react'
import { apiGet, apiPost, API_BASE } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/components/ui/toast'

type SvgFile = { name: string; path: string }
type TemplateSummary = { templateId: string; pixelSize: { w: number; h: number }; roles: Array<{ role: string; count: number }> }

function useFetch<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = React.useState<T | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    let active = true
    setLoading(true)
    fn()
      .then((d) => {
        if (active) setData(d)
      })
      .catch((e) => active && setError(String(e?.message || e)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, deps)
  return { data, loading, error, setData }
}

export default function WizardSVGPage() {
  const toast = useToast()
  // Step control
  const [step, setStep] = React.useState(1)

  // Step 1: SVG Templates
  const [svgDir, setSvgDir] = React.useState('../AdCreator2/backend/templates/svgs')
  const [selectedSvgs, setSelectedSvgs] = React.useState<SvgFile[]>([])
  const { data: svgData, loading: svgLoading, setData: setSvgData } = useFetch(async () => {
    const res = await apiGet<{ dir: string; files: SvgFile[] }>(`/svg/list?dir=${encodeURIComponent(svgDir)}`)
    return res
  }, [svgDir])

  const toggleSvg = (f: SvgFile) => {
    setSelectedSvgs((s) => (s.find((x) => x.path === f.path) ? s.filter((x) => x.path !== f.path) : [...s, f]))
  }

  // Step 2: Brief & Branding
  const [tab, setTab] = React.useState<'url' | 'manual'>('url')
  const [url, setUrl] = React.useState('https://example.com')
  const [ctx, setCtx] = React.useState<any>({ 
    product: { name: '' }, 
    audience: '', 
    tone: 'clear', 
    brandVoice: 'simple', 
    locale: 'en-US', 
    mustInclude: [], 
    mustAvoid: [] 
  })
  const [brandColors, setBrandColors] = React.useState<Record<string, string>>({
    'COLOR_BRANDCOLOR': '#FF6B6B',
    'COLOR_PRIMARY': '#4ECDC4',
    'COLOR_SECONDARY': '#45B7D1',
    'COLOR_ACCENT': '#96CEB4'
  })
  const [logo, setLogo] = React.useState<string>('')
  const [productImage, setProductImage] = React.useState<string>('')

  const fetchCtx = async () => {
    const res = await apiPost<{ parsed: any; ctx: any }>(`/ctx/fromUrl`, { url })
    setCtx(res.ctx)
  }

  // Persist ctx so Dashboard caption generation is grounded
  React.useEffect(() => {
    try { localStorage.setItem('adcreator_ctx', JSON.stringify(ctx)) } catch {}
  }, [ctx])

  // Step 3: Templates & Generate
  const { data: tplList, loading: tplLoading } = useFetch(async () => await apiGet<TemplateSummary[]>(`/templates/list`), [])
  const [selectedTpls, setSelectedTpls] = React.useState<string[]>([])
  React.useEffect(() => {
    if (tplList && selectedTpls.length === 0) setSelectedTpls(tplList.map((t) => t.templateId))
  }, [tplList])

  const [running, setRunning] = React.useState(false)
  const [thumbs, setThumbs] = React.useState<string[]>([])
  const [runId, setRunId] = React.useState<string | null>(null)
  const [useLocal, setUseLocal] = React.useState(false)

  const runBatch = async () => {
    if (!selectedSvgs.length || !selectedTpls.length) return
    setRunning(true)
    setThumbs([])
    
    // Build jobs
    const jobs = [] as Array<{ svgPath: string; templateId: string; ctx: any }>
    for (const svg of selectedSvgs) {
      for (const t of selectedTpls) {
        jobs.push({ svgPath: svg.path, templateId: t, ctx })
      }
    }
    
    const runIdLocal = `svg-composed-${Date.now()}`
    const outDir = `./runs/${runIdLocal}`
    toast.add(`Starting ${jobs.length} jobs…`)
    
    let completed = 0
    const limit = 4
    let idx = 0
    
    async function worker() {
      while (idx < jobs.length) {
        const i = idx++
        const j = jobs[i]
        try {
          const res = await apiPost<any>(`/pipeline/generateFromSVG`, { 
            ...j, 
            brandColors,
            logo: logo || undefined,
            productImage: productImage || undefined,
            outDir,
            useLocal,
            textColors: Object.values(brandColors).slice(0, 3) // Use first 3 brand colors for text
          })
          const url = res?.url ? `${API_BASE}${res.url}` : undefined
          if (url) setThumbs((s) => (s.includes(url) ? s : [...s, url]))
        } catch (e: any) {
          console.error(`Job ${i} failed:`, e)
        } finally {
          completed++
        }
      }
    }
    
    await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }).map(() => worker()))
    setRunId(runIdLocal)
    toast.add(`Completed: ${completed} images`)
    setRunning(false)
  }

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold">Generate ads from SVG templates</h1>

      {/* Step 1: SVG Templates */}
      <section className="rounded-xl border bg-white/70 p-4 shadow-sm backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-medium">1. SVG Templates</div>
          <div className="text-sm text-slate-500">Select one or more</div>
        </div>
        <div className="mb-3 flex gap-2">
          <input value={svgDir} onChange={(e) => setSvgDir(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
          <Button onClick={() => setSvgData(null as any)}>Refresh</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {svgLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
          {!svgLoading && svgData?.files?.map((f) => {
            const active = !!selectedSvgs.find((x) => x.path === f.path)
            return (
              <motion.div 
                key={f.path} 
                whileHover={{ scale: 1.02 }} 
                className={`relative cursor-pointer overflow-hidden rounded-lg border bg-slate-100 p-4 ${active ? 'ring-2 ring-sky-400' : ''}`} 
                onClick={() => toggleSvg(f)}
              >
                <div className="text-xs truncate">{f.name}</div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Step 2: Brief & Branding */}
      <section className="rounded-xl border bg-white/70 p-4 shadow-sm backdrop-blur">
        <div className="mb-3 text-lg font-medium">2. Brief & Branding</div>
        
        {/* Brief Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'url' | 'manual')}>
          <TabsList>
            <TabsTrigger value="url">URL</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
          </TabsList>
          <TabsContent value="url">
            <div className="space-y-2">
              <div className="flex gap-2">
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="w-full rounded-md border px-3 py-2 text-sm" />
                <Button onClick={fetchCtx}>Fetch</Button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input value={ctx.product?.name || ''} onChange={(e) => setCtx({ ...ctx, product: { ...(ctx.product || {}), name: e.target.value } })} placeholder="Product name" className="rounded-md border px-3 py-2 text-sm" />
                <input value={ctx.audience || ''} onChange={(e) => setCtx({ ...ctx, audience: e.target.value })} placeholder="Audience" className="rounded-md border px-3 py-2 text-sm" />
                <input value={ctx.locale || 'en-US'} onChange={(e) => setCtx({ ...ctx, locale: e.target.value })} placeholder="Locale (en-US)" className="rounded-md border px-3 py-2 text-sm" />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="manual">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input placeholder="Product name" className="rounded-md border px-3 py-2 text-sm" onChange={(e) => setCtx({ ...ctx, product: { ...(ctx.product || {}), name: e.target.value } })} />
              <input placeholder="Benefit" className="rounded-md border px-3 py-2 text-sm" onChange={(e) => setCtx({ ...ctx, product: { ...(ctx.product || {}), benefit: e.target.value } })} />
              <input placeholder="Audience" className="rounded-md border px-3 py-2 text-sm" onChange={(e) => setCtx({ ...ctx, audience: e.target.value })} />
              <input placeholder="Tone (clear)" className="rounded-md border px-3 py-2 text-sm" onChange={(e) => setCtx({ ...ctx, tone: e.target.value })} />
              <input placeholder="Voice (simple)" className="rounded-md border px-3 py-2 text-sm" onChange={(e) => setCtx({ ...ctx, brandVoice: e.target.value })} />
              <input placeholder="Locale (en-US)" className="rounded-md border px-3 py-2 text-sm" onChange={(e) => setCtx({ ...ctx, locale: e.target.value })} />
            </div>
          </TabsContent>
        </Tabs>

        {/* Brand Colors */}
        <div className="mt-4">
          <div className="mb-2 text-sm font-medium">Brand Colors</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(brandColors).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <input
                  type="color"
                  value={value}
                  onChange={(e) => setBrandColors({ ...brandColors, [key]: e.target.value })}
                  className="h-8 w-8 rounded border"
                />
                <span className="text-xs truncate">{key.replace('COLOR_', '')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Logo & Product Image */}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input 
            placeholder="Logo path (optional)" 
            className="rounded-md border px-3 py-2 text-sm" 
            value={logo}
            onChange={(e) => setLogo(e.target.value)}
          />
          <input 
            placeholder="Product image path (optional)" 
            className="rounded-md border px-3 py-2 text-sm" 
            value={productImage}
            onChange={(e) => setProductImage(e.target.value)}
          />
        </div>
      </section>

      {/* Step 3: Templates & Generate */}
      <section className="rounded-xl border bg-white/70 p-4 shadow-sm backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-medium">3. Text Templates & Generate</div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={useLocal} 
                onChange={(e) => setUseLocal(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Use local generation</span>
            </label>
            <Button onClick={runBatch} disabled={running || !selectedSvgs.length}>Generate</Button>
          </div>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {tplLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          {!tplLoading && tplList?.map((t) => (
            <label key={t.templateId} className="flex cursor-pointer items-center gap-2 rounded-md border bg-white/60 p-2 text-sm">
              <input type="checkbox" checked={selectedTpls.includes(t.templateId)} onChange={(e) => setSelectedTpls((s) => (e.target.checked ? [...s, t.templateId] : s.filter((x) => x !== t.templateId)))} />
              <span className="truncate" title={t.templateId}>{t.templateId}</span>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
          <AnimatePresence>
            {running && Array.from({ length: Math.min(selectedSvgs.length * selectedTpls.length, 12) }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </AnimatePresence>
          {!running && thumbs.map((src) => (
            <motion.div key={src} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-hidden rounded-lg border bg-white/60 shadow-sm">
              <img src={src} alt="thumb" className="h-32 w-full object-cover" />
            </motion.div>
          ))}
        </div>

        {runId && (
          <div className="mt-4 text-sm">
            Run complete: <a className="text-sky-600 hover:underline" href={`/runs/${runId}`} target="_blank" rel="noreferrer">/runs/{runId}</a>
          </div>
        )}
      </section>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))}>Back</Button>
        <Button onClick={() => setStep((s) => Math.min(3, s + 1))}>Next</Button>
      </div>
    </div>
  )
}
