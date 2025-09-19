"use client"
import * as React from 'react'

type ToastItem = { id: number; message: string }

const ToastCtx = React.createContext<{ add: (msg: string) => void } | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])
  const add = (message: string) => {
    const id = Date.now()
    setItems((s) => [...s, { id, message }])
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 2500)
  }
  return (
    <ToastCtx.Provider value={{ add }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="rounded bg-slate-900 px-3 py-2 text-sm text-white shadow-lg">
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = React.useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
