"use client"
import * as React from 'react'
import { apiGet, apiPost, API_BASE } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/components/ui/toast'

type BgFile = { name: string; path: string; url?: string }
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

export default function WizardPage() {
  const toast = useToast()
  // Step control
  const [step, setStep] = React.useState(1)

  // Step 1: Backgrounds
  const [dir, setDir] = React.useState('../AdCreator2/backend/output/base-images-test')
  const [selectedBgs, setSelectedBgs] = React.useState<BgFile[]>([])
  const { data: bgData, loading: bgLoading, setData: setBgData } = useFetch(async () => {
    const res = await apiGet<{ dir: string; files: BgFile[] }>(`/bg/list?dir=${encodeURIComponent(dir)}`)
    return res
  }, [dir])

  const toggleBg = (f: BgFile) => {
    setSelectedBgs((s) => (s.find((x) => x.path === f.path) ? s.filter((x) => x.path !== f.path) : [...s, f]))
  }

  // Step 2: Brief
  const [tab, setTab] = React.useState<'url' | 'manual'>('url')
  const [url, setUrl] = React.useState('https://example.com')
  const [ctx, setCtx] = React.useState<any>({ product: { name: '' }, audience: '', tone: 'clear', brandVoice: 'simple', locale: 'en-US', mustInclude: [], mustAvoid: [] })
  const fetchCtx = async () => {
    const res = await apiPost<{ parsed: any; ctx: any }>(`/ctx/fromUrl`, { url })
    setCtx(res.ctx)
  }

  // Persist ctx so other pages (e.g., Dashboard) can generate grounded captions
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

  const runBatch = async () => {
    if (!selectedBgs.length || !selectedTpls.length) return
    setRunning(true)
    setThumbs([])
    // Build jobs
    const jobs = [] as Array<{ templateId: string; bgPath: string; ctx: any }>
    for (const bg of selectedBgs) for (const t of selectedTpls) jobs.push({ templateId: t, bgPath: bg.path, ctx })
    const runIdLocal = `composed-${Date.now()}`
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
          const res = await apiPost<any>(`/pipeline/generateOnComposed`, { ...j, outDir, twoStage: true })
          if ((res as any)?.generationMode && (res as any).generationMode !== 'twoStage') {
            toast.add(`Quality reduced: using ${(res as any).generationMode}`)
          }
          const url = res?.url ? `${API_BASE}${res.url}` : (res?.outPath ? `${API_BASE}/file?p=${encodeURIComponent(res.outPath)}` : undefined)
          if (url) setThumbs((s) => (s.includes(url) ? s : [...s, url]))
        } catch (e: any) {
          // ignore individual failures for now; could add per-job toast
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
      <h1 className="text-2xl font-semibold">Generate social-ready images</h1>

      {/* Step 1 */}
      <section className="rounded-xl border bg-white/70 p-4 shadow-sm backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-medium">1. Backgrounds</div>
          <div className="text-sm text-slate-500">Select one or more</div>
        </div>
        <div className="mb-3 flex gap-2">
          <input value={dir} onChange={(e) => setDir(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
          <Button onClick={() => setBgData(null as any)}>Refresh</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {bgLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
          {!bgLoading && bgData?.files?.slice(0, 24).map((f) => {
            const active = !!selectedBgs.find((x) => x.path === f.path)
            return (
              <motion.div key={f.path} whileHover={{ scale: 1.02 }} className={`relative cursor-pointer overflow-hidden rounded-lg border ${active ? 'ring-2 ring-sky-400' : ''}`} onClick={() => toggleBg(f)}>
                <img src={`${API_BASE}${f.url || `/file?p=${encodeURIComponent(f.path)}`}`} alt={f.name} className="h-32 w-full object-cover" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/40 to-transparent p-1 text-[10px] text-white opacity-0 transition-opacity hover:opacity-100">{f.name}</div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Step 2 */}
      <section className="rounded-xl border bg-white/70 p-4 shadow-sm backdrop-blur">
        <div className="mb-3 text-lg font-medium">2. Brief</div>
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
              <input placeholder="mustInclude (comma)" className="rounded-md border px-3 py-2 text-sm sm:col-span-3" onChange={(e) => setCtx({ ...ctx, mustInclude: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              <input placeholder="mustAvoid (comma)" className="rounded-md border px-3 py-2 text-sm sm:col-span-3" onChange={(e) => setCtx({ ...ctx, mustAvoid: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
            </div>
          </TabsContent>
        </Tabs>
      </section>

      {/* Step 3 */}
      <section className="rounded-xl border bg-white/70 p-4 shadow-sm backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-medium">3. Templates & Generate</div>
          <Button onClick={runBatch} disabled={running || !selectedBgs.length}>Generate</Button>
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
            {running && Array.from({ length: Math.min(selectedBgs.length * selectedTpls.length, 12) }).map((_, i) => (
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
