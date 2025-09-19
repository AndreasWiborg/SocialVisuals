"use client"
import * as React from 'react'
import { apiGet, apiPost } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

type Settings = { brandId?: string | null; allowedBgDirs?: string; preferredFont?: string | null; randomFont?: boolean }

type FontsResp = { ok: boolean; curated: string[]; installed: string[] }

export default function SettingsPage() {
  const toast = useToast()
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [settings, setSettings] = React.useState<Settings>({ brandId: '', allowedBgDirs: '', preferredFont: null, randomFont: true })
  const [fonts, setFonts] = React.useState<string[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const res = await apiGet<{ ok: boolean; settings: Settings }>(`/settings`)
      setSettings(res.settings || {})
    } catch (e: any) {
      toast.add(`Failed to load settings: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { load(); (async () => { try { const f = await apiGet<FontsResp>('/fonts/list'); setFonts([ 'Random', ...f.curated, ...f.installed.filter(x=>!f.curated.includes(x)) ]);} catch {} })() }, [])

  const save = async () => {
    setSaving(true)
    try {
      await apiPost(`/settings`, settings)
      toast.add('Settings saved')
    } catch (e: any) {
      toast.add(`Failed to save: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Button asChild variant="outline"><a href="/dashboard">Back to Dashboard</a></Button>
      </div>
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <label className="block text-sm">
          <span className="text-gray-700">Default Brand ID</span>
          <input
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={settings.brandId || ''}
            onChange={(e) => setSettings({ ...settings, brandId: e.target.value })}
            disabled={loading}
            placeholder="brand-123"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">Allowed Background Dirs (comma-separated)</span>
          <input
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={settings.allowedBgDirs || ''}
            onChange={(e) => setSettings({ ...settings, allowedBgDirs: e.target.value })}
            disabled={loading}
          />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
          <label className="block text-sm">
            <span className="text-gray-700">Default Font</span>
            <select
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={settings.preferredFont ?? 'Random'}
              onChange={(e) => setSettings({ ...settings, preferredFont: e.target.value === 'Random' ? null : e.target.value })}
              disabled={loading}
            >
              {fonts.map(f => (<option key={f} value={f}>{f}</option>))}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-sm mt-6 sm:mt-0">
            <input
              type="checkbox"
              checked={!!settings.randomFont}
              onChange={(e) => setSettings({ ...settings, randomFont: e.target.checked })}
              disabled={loading}
            />
            <span className="text-gray-700">Use random font when none selected</span>
          </label>
        </div>
        <div className="pt-2">
          <Button onClick={save} disabled={saving || loading}>{saving ? 'Saving…' : 'Save Settings'}</Button>
        </div>
      </div>
    </div>
  )
}
