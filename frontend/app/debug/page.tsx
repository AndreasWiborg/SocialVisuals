"use client"
import { useState } from 'react'
import { useAuth } from '@/lib/auth/context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'

export default function DebugPage() {
  const { userCredits, refreshCredits, session } = useAuth()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [debugData, setDebugData] = useState(null)

  const checkCredits = async () => {
    console.log('[Debug] checkCredits clicked')
    setLoading(true)
    try {
      // Use session from context to avoid hanging on getSession
      console.log('[Debug] using context session, has token?', !!session?.access_token)
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      
      console.log('[Debug] calling /api/debug/credits GET ...', headers)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const response = await fetch('/api/debug/credits', { headers, signal: controller.signal, cache: 'no-store' })
      clearTimeout(timeout)
      console.log('[Debug] /api/debug/credits GET status', response.status)
      const data = await response.json()
      setDebugData(data)
      console.log('Debug data:', data)
    } catch (error) {
      console.error('Debug failed:', error)
      toast.add('Debug check failed')
    } finally {
      setLoading(false)
    }
  }

  const fixCredits = async () => {
    console.log('[Debug] fixCredits clicked')
    setLoading(true)
    try {
      // Use session from context to avoid hanging on getSession
      console.log('[Debug] using context session, has token?', !!session?.access_token)
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      
      console.log('[Debug] calling /api/debug/credits POST ...', headers)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const response = await fetch('/api/debug/credits', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          credits: 950,
          plan_type: 'premium'
        }),
        signal: controller.signal,
        cache: 'no-store'
      })
      clearTimeout(timeout)
      console.log('[Debug] /api/debug/credits POST status', response.status)
      const data = await response.json()
      if (data.success) {
        toast.add('Credits updated successfully!')
        await refreshCredits()
      } else {
        toast.add('Failed to update credits')
      }
    } catch (error) {
      console.error('Fix failed:', error)
      toast.add('Fix credits failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Debug Panel</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Current Credits</h2>
            <div className="space-y-2">
              <p><strong>Credits:</strong> {userCredits?.credits_remaining || 'Loading...'}</p>
              <p><strong>Plan:</strong> {userCredits?.plan_type || 'Loading...'}</p>
            </div>
            <Button onClick={refreshCredits} className="mt-4 w-full">
              Refresh Credits
            </Button>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Debug Actions</h2>
            <div className="space-y-4">
              <Button 
                onClick={checkCredits} 
                disabled={loading}
                variant="outline"
                className="w-full"
              >
                Check Database
              </Button>
              
              <Button 
                onClick={fixCredits} 
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                Fix Credits (Set to 950)
              </Button>
            </div>
          </Card>
        </div>

        {debugData && (
          <Card className="p-6 mt-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Debug Data</h2>
            <pre className="bg-gray-100 p-4 rounded-lg overflow-auto text-sm">
              {JSON.stringify(debugData, null, 2)}
            </pre>
          </Card>
        )}
      </div>
    </div>
  )
}
