"use client"
import * as React from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { apiGet, apiPost, API_BASE } from '@/lib/api'
import { useAuth } from '@/lib/auth/context'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { Dialog, DialogHeader } from '@/components/ui/dialog'
import { Download, Share2, Wand2, BadgePercent, Folder, Settings, Image as ImageIcon, Users, X, CreditCard } from 'lucide-react'

type RunSummary = { id: string, dir: string, count: number, createdAt: string | null }
type RunItem = { file: string; url: string; templateId?: string; angle?: string; meta?: any; ctxSummary?: any }

function DashboardContent() {
  const toast = useToast()
  const { userCredits } = useAuth()
  const [loading, setLoading] = React.useState(true)
  const [items, setItems] = React.useState<Array<RunItem & { runId: string }>>([])
  const [selected, setSelected] = React.useState<null | (RunItem & { runId: string })>(null)
  const [socialLoading, setSocialLoading] = React.useState(false)
  const [socialPack, setSocialPack] = React.useState<null | { twitter: { caption: string; hashtags?: string[] }, instagram: { caption: string; hashtags?: string[] }, linkedin: { caption: string }, altText: string }>(null)
  const socialCacheRef = React.useRef<Map<string, any>>(new Map())

  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const runs = await apiGet<RunSummary[]>('/runs/list')
        const top = runs.slice(0, 6)
        const details = await Promise.all(top.map(async (r) => {
          try {
            const d = await apiGet<{ id: string; items: RunItem[] }>(`/runs/${r.id}`)
            return (d.items || []).map(it => ({ ...it, runId: r.id }))
          } catch { return [] as Array<RunItem & { runId: string }>} 
        }))
        const flat = details.flat()
        if (mounted) setItems(flat.slice(0, 24))
      } catch (e: any) {
        toast.add(`Failed to load recent creations: ${e.message}`)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const copyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.add('Link copied to clipboard') } catch { toast.add('Failed to copy link') }
  }

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.add('Copied') } catch { toast.add('Failed to copy') }
  }

  const decodeImagePathFromUrl = (url: string) => {
    const idx = url.indexOf('?p=')
    if (idx === -1) return ''
    return decodeURIComponent(url.slice(idx + 3))
  }

  const generateCaptions = async () => {
    if (!selected) return
    const imagePath = decodeImagePathFromUrl(selected.url)
    if (!imagePath) { toast.add('Could not resolve image path'); return }
    // Cache hit
    const cached = socialCacheRef.current.get(imagePath)
    if (cached) { setSocialPack(cached); return }
    setSocialLoading(true)
    setSocialPack(null)
    try {
      // Try to ground with roles and context from the run metadata or prior UI flows
      let roles: Record<string, any> = (selected as any)?.meta?.winner?.texts
        || (selected as any)?.rolesUsed
        || (selected as any)?.meta?.rolesUsed
        || (selected as any)?.meta?.bundle?.roles
        || {}
      let ctx: any = (selected as any)?.ctxSummary || (selected as any)?.meta?.ctxSummary
      if (!ctx && typeof window !== 'undefined') {
        try { const saved = localStorage.getItem('adcreator_ctx'); if (saved) ctx = JSON.parse(saved) } catch {}
      }
      if (!ctx) ctx = { product: { name: 'Acme' }, audience: 'General', tone: 'clear', brandVoice: 'simple', locale: 'en-US' }

      const body = {
        imagePath,
        bundle: {
          id: 'b1',
          roles,
          angle: selected?.angle || 'PROMISE',
          theme_id: 'default'
        },
        ctx
      }
      const res = await apiPost<{ ok: boolean; pack?: any; errors?: any[] }>(`/social/generate`, body)
      if (!res.ok || !res.pack) {
        toast.add('Failed to generate captions')
        setSocialLoading(false)
        return
      }
      socialCacheRef.current.set(imagePath, res.pack)
      setSocialPack(res.pack)
    } catch (e: any) {
      toast.add(`Caption generation failed: ${e.message}`)
    } finally {
      setSocialLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 via-slate-50 to-blue-100">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden md:flex w-72 flex-col bg-white/60 backdrop-blur-2xl border-r border-slate-200/50">
          <div className="px-6 py-8">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 bg-clip-text text-transparent">Ad Creator Studio</h1>
            <p className="text-xs text-slate-500 mt-1">Create stunning ads in seconds</p>
          </div>
          <nav className="px-3 space-y-1 flex-1">
            <Link className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-blue-50/50 text-slate-700 hover:text-blue-700 transition-all group" href="/content">
              <div className="p-2 rounded-lg bg-blue-100/50 group-hover:bg-blue-100 transition-colors">
                <Folder className="h-4 w-4 text-blue-700" />
              </div>
              <span className="font-medium">All Content</span>
            </Link>
            <Link className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-blue-50/50 text-slate-700 hover:text-blue-700 transition-all group" href="#">
              <div className="p-2 rounded-lg bg-blue-100/50 group-hover:bg-blue-100 transition-colors">
                <ImageIcon className="h-4 w-4 text-blue-700" />
              </div>
              <span className="font-medium">Branding</span>
            </Link>
            <Link className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-blue-50/50 text-slate-700 hover:text-blue-700 transition-all group" href="/social-text">
              <div className="p-2 rounded-lg bg-blue-100/50 group-hover:bg-blue-100 transition-colors">
                <Wand2 className="h-4 w-4 text-blue-700" />
              </div>
              <span className="font-medium">Social Media Text</span>
            </Link>
            <Link className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition-all group" href="/settings">
              <div className="p-2 rounded-lg bg-slate-100/50 group-hover:bg-slate-100 transition-colors">
                <Settings className="h-4 w-4 text-slate-600" />
              </div>
              <span className="font-medium">Settings</span>
            </Link>
          </nav>
          <div className="p-6">
            <div className="rounded-xl bg-gradient-to-br from-blue-800 via-blue-700 to-blue-600 p-4 text-white shadow-lg">
              <p className="text-xs font-medium mb-1">✨ Pro Features</p>
              <p className="text-[10px] opacity-90">New tools added weekly</p>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1">
          {/* Header */}
          <div className="relative">
            {/* Decorative background */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -top-40 -right-40 w-96 h-96 bg-violet-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" />
              <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{ animationDelay: '2s' }} />
            </div>
            <div className="relative px-6 md:px-10 py-12">
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl md:text-5xl font-extrabold text-slate-900"
              >
                Welcome back to your
                <span className="block bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 bg-clip-text text-transparent mt-2">Creative Studio</span>
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mt-4 text-slate-600 max-w-2xl text-lg"
              >
                Transform your ideas into stunning visuals. Your latest creations are ready.
              </motion.p>
            </div>
          </div>

          {/* Recent Creations */}
          <div className="px-6 md:px-10 pb-10">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Recent Creations</h2>
                <p className="text-sm text-slate-500 mt-1">Your latest generated marketing materials</p>
              </div>
              <Link href="/text-overlay">
                <Button className="bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 hover:from-blue-900 hover:via-blue-800 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all">
                  <Wand2 className="mr-2 h-4 w-4" />
                  Create New
                </Button>
              </Link>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Card key={i} className="aspect-square animate-pulse bg-gray-100" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <Card className="col-span-full p-16 text-center border-dashed border-2 border-blue-200 bg-gradient-to-br from-blue-50/50 via-slate-50/50 to-blue-50/50 rounded-2xl">
                <div className="max-w-sm mx-auto">
                  <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-4">
                    <ImageIcon className="h-8 w-8 text-blue-700" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No creations yet</h3>
                  <p className="text-slate-600 mb-4">Start creating stunning marketing materials with AI</p>
                  <Link href="/text-overlay">
                    <Button className="bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 hover:from-blue-900 hover:via-blue-800 hover:to-blue-700 text-white">Get Started</Button>
                  </Link>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {items.map((it, idx) => (
                  <motion.div
                    key={`${it.runId}-${idx}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                  >
                    <Card className="overflow-hidden group cursor-pointer card-hover bg-gradient-to-br from-white/90 via-blue-50/30 to-white/90 backdrop-blur-sm border-blue-200/50 rounded-2xl" onClick={() => setSelected(it)}>
                      <div className="relative aspect-square bg-gradient-to-br from-blue-50 via-slate-50 to-blue-100 flex items-center justify-center p-4">
                        <motion.img
                          src={`${API_BASE}${it.url}`}
                          alt={it.templateId || it.file}
                          loading="lazy"
                          className="w-full h-full object-contain rounded-lg"
                          whileHover={{ scale: 1.05 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
                      </div>
                      <div className="p-4">
                        <div className="text-sm font-semibold text-slate-900 truncate">{it.templateId || it.file.split('/').pop()}</div>
                        <div className="text-xs text-slate-500 truncate mt-1">Generated • {it.runId.slice(0,8)}</div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Detail Dialog */}
      <AnimatePresence>
        {selected && (
          <Dialog open={!!selected} onClose={() => { setSelected(null); setSocialPack(null); setSocialLoading(false) }} className="w-[95vw] max-w-6xl max-h-[90vh] overflow-auto rounded-3xl">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="relative"
            >
              <button onClick={() => { setSelected(null); setSocialPack(null); setSocialLoading(false) }} className="absolute right-4 top-4 z-10 w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                <X className="h-5 w-5 text-slate-600" />
              </button>
              <div className="px-8 pt-8 pb-4">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-2xl text-slate-900">{selected.templateId || selected.file.split('/').pop()}</h3>
                    <p className="text-sm text-slate-500 mt-1">View, download, and generate social media captions</p>
                  </div>
                </div>
              </DialogHeader>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 px-8 pb-8">
                {/* Left: Large Image and captions */}
                <div className="lg:col-span-3 space-y-6">
                  <div className="bg-gradient-to-br from-blue-50 via-slate-50 to-blue-100 rounded-2xl p-6 flex items-center justify-center max-h-[60vh] overflow-auto">
                    <img src={`${API_BASE}${selected.url}`} alt="Preview" className="max-h-[50vh] w-auto object-contain rounded-lg shadow-xl" />
                  </div>
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/50">
                    <h4 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
                      <Users className="h-5 w-5 mr-2 text-blue-700" />
                      Social Media Captions
                    </h4>
                    {socialLoading && (
                      <div className="space-y-2">
                        <div className="h-5 bg-gray-100 animate-pulse rounded" />
                        <div className="h-5 w-5/6 bg-gray-100 animate-pulse rounded" />
                        <div className="h-5 w-4/6 bg-gray-100 animate-pulse rounded" />
                      </div>
                    )}
                    {!socialLoading && !socialPack && (
                      <div className="text-center py-8">
                        <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-4">
                          <Wand2 className="h-8 w-8 text-blue-700" />
                        </div>
                        <p className="text-slate-600 mb-4">Click "Generate Captions" to create platform-ready copy</p>
                      </div>
                    )}
                    {!socialLoading && socialPack && (
                      <div className="space-y-4">
                        <div>
                          <div className="font-medium">Twitter</div>
                          <div className="text-sm text-gray-900 whitespace-pre-wrap mt-1">{socialPack.twitter.caption}</div>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {(socialPack.twitter.hashtags || []).map((h: string, i: number) => (
                              <span key={i} className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">{h}</span>
                            ))}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Button variant="outline" onClick={() => copyText(socialPack.twitter.caption)}>Copy Caption</Button>
                            <Button variant="outline" onClick={() => copyText((socialPack.twitter.hashtags || []).join(' '))}>Copy Hashtags</Button>
                          </div>
                        </div>
                        <div>
                          <div className="font-medium">Instagram</div>
                          <div className="text-sm text-gray-900 whitespace-pre-wrap mt-1">{socialPack.instagram.caption}</div>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {(socialPack.instagram.hashtags || []).map((h: string, i: number) => (
                              <span key={i} className="text-xs px-2 py-1 rounded-full bg-pink-50 text-pink-700">{h}</span>
                            ))}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Button variant="outline" onClick={() => copyText(socialPack.instagram.caption)}>Copy Caption</Button>
                            <Button variant="outline" onClick={() => copyText((socialPack.instagram.hashtags || []).join(' '))}>Copy Hashtags</Button>
                          </div>
                        </div>
                        <div>
                          <div className="font-medium">LinkedIn</div>
                          <div className="text-sm text-gray-900 whitespace-pre-wrap mt-1">{socialPack.linkedin.caption}</div>
                          <div className="flex gap-2 mt-2">
                            <Button variant="outline" onClick={() => copyText(socialPack.linkedin.caption)}>Copy Caption</Button>
                          </div>
                        </div>
                        <div>
                          <div className="font-medium">Alt Text</div>
                          <div className="text-sm text-gray-900 whitespace-pre-wrap mt-1">{socialPack.altText}</div>
                          <div className="flex gap-2 mt-2">
                            <Button variant="outline" onClick={() => copyText(socialPack.altText)}>Copy Alt Text</Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {/* Right: Actions */}
                <div className="lg:col-span-1 space-y-3">
                  <a href={`${API_BASE}${selected.url}`} download>
                    <Button className="w-full h-12 bg-gradient-to-r from-blue-800 via-blue-700 to-blue-600 hover:from-blue-900 hover:via-blue-800 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all">
                      <Download className="h-4 w-4 mr-2" /> Download PNG
                    </Button>
                  </a>
                  <Button variant="outline" className="w-full h-12 border-slate-200 hover:bg-slate-50" onClick={() => copyLink(`${API_BASE}${selected.url}`)}>
                    <Share2 className="h-4 w-4 mr-2" /> Copy Link
                  </Button>
                  <Button variant="outline" className="w-full h-12 border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700" onClick={generateCaptions}>
                    <Wand2 className="h-4 w-4 mr-2" /> Generate Captions
                  </Button>
                  <Button variant="outline" className="w-full h-12 border-amber-200 bg-amber-50 hover:bg-amber-100 justify-between" onClick={() => toast.add('A/B Test is a premium feature')}>
                    <span className="flex items-center text-amber-700"><BadgePercent className="h-4 w-4 mr-2" /> A/B Test</span>
                    <span className="text-[10px] rounded-full bg-amber-200 text-amber-800 px-2 py-0.5 font-medium">PRO</span>
                  </Button>
                </div>
              </div>
            </motion.div>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  )
}
