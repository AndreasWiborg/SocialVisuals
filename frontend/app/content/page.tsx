"use client"
import * as React from 'react'
import { apiGet, API_BASE } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { motion } from 'framer-motion'
import { Search, Calendar, Filter, Loader2 } from 'lucide-react'

type ContentItem = {
  runId: string
  file: string
  url: string
  templateId: string
  angle?: string
  brandId?: string | null
  ctxSummary?: any
  createdAt?: string | null
}

export default function ContentPage() {
  const toast = useToast()
  const [brandId, setBrandId] = React.useState('')
  const [createdAfter, setCreatedAfter] = React.useState('')
  const [createdBefore, setCreatedBefore] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [items, setItems] = React.useState<ContentItem[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (brandId) qs.set('brandId', brandId)
      if (createdAfter) qs.set('createdAfter', new Date(createdAfter).toISOString())
      if (createdBefore) qs.set('createdBefore', new Date(createdBefore).toISOString())
      const res = await apiGet<{ ok: boolean; total: number; items: ContentItem[] }>(`/content/search?${qs.toString()}`)
      setItems(res.items || [])
    } catch (e: any) {
      toast.add(`Failed to load content: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-sky-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">All Content</h1>
          <a href="/dashboard"><Button variant="outline">Back to Dashboard</Button></a>
        </div>

        <div className="rounded-xl border bg-white/70 p-4 shadow-sm backdrop-blur">
          <div className="grid gap-3 md:grid-cols-4">
            <input value={brandId} onChange={(e) => setBrandId(e.target.value)} placeholder="Brand ID" className="rounded-md border px-3 py-2 text-sm" />
            <input type="date" value={createdAfter} onChange={(e) => setCreatedAfter(e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
            <input type="date" value={createdBefore} onChange={(e) => setCreatedBefore(e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
            <Button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Search'}</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {loading && Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="aspect-square animate-pulse bg-gray-100" />
          ))}
          {!loading && items.map((it, idx) => (
            <Card key={`${it.runId}-${idx}`} className="overflow-hidden">
              <div className="aspect-square bg-white flex items-center justify-center">
                <img src={`${API_BASE}${it.url}`} alt={it.templateId} className="w-full h-full object-contain" loading="lazy" />
              </div>
              <div className="p-3 text-sm">
                <div className="font-medium truncate">{it.templateId}</div>
                <div className="text-gray-500 truncate">{it.brandId || '—'} • {it.createdAt ? new Date(it.createdAt).toLocaleString() : ''}</div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

