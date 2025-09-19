"use client"
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default function LoginDemoPage() {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)

  const signIn = async () => {
    setBusy(true)
    try {
      const demo = { id: 'demo-user', name: 'Demo User' }
      localStorage.setItem('demo_user', JSON.stringify(demo))
      router.push('/dashboard')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-24 text-center">
      <h1 className="text-3xl font-bold">Sign in (Demo)</h1>
      <p className="text-slate-600 mt-2">Create a demo session to explore your dashboard.</p>
      <div className="mt-6">
        <Button onClick={signIn} disabled={busy} size="lg" className="w-full">Continue</Button>
      </div>
      <p className="text-xs text-slate-500 mt-3">No account required — this stores a demo flag in your browser only.</p>
    </div>
  )
}

