"use client"
import * as React from 'react'
import { Button } from '@/components/ui/button'

export default function SocialTextPage() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Social Media Text Content</h1>
        <Button asChild variant="outline"><a href="/dashboard">Back to Dashboard</a></Button>
      </div>
      <p className="text-gray-600">Plan and generate platform‑ready copy. Backend endpoints will be wired next.</p>
      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm text-gray-500">Coming soon: briefs, per‑platform variations, and scheduling.</div>
      </div>
    </div>
  )
}

