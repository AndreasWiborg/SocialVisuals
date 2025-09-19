"use client"
import * as React from 'react'
import { apiGet, apiPost, API_BASE } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { Loader2 } from 'lucide-react'

export default function TextOverlayDebugPage() {
  const toast = useToast()
  const [loading, setLoading] = React.useState(false)
  const [response, setResponse] = React.useState<any>(null)
  const [error, setError] = React.useState<string>('')
  
  // Test API health
  const testHealth = async () => {
    try {
      const res = await apiGet('/health')
      setResponse(res)
      if ((res as any)?.generationMode && (res as any).generationMode !== 'twoStage') {
        toast.add(`Quality reduced: using ${(res as any).generationMode}`)
      }
      toast.add('API is healthy')
    } catch (e: any) {
      setError(e.message)
      toast.add(`Health check failed: ${e.message}`)
    }
  }
  
  // Test template listing
  const testTemplates = async () => {
    try {
      const res = await apiGet<any[]>('/templates/list')
      setResponse(res)
      toast.add(`Found ${res.length} templates`)
    } catch (e: any) {
      setError(e.message)
      toast.add(`Template listing failed: ${e.message}`)
    }
  }
  
  // Test URL fetch
  const testUrlFetch = async () => {
    try {
      const res = await apiPost('/ctx/fromUrl', { url: 'https://example.com' })
      setResponse(res)
      toast.add('URL fetch successful')
    } catch (e: any) {
      setError(e.message)
      toast.add(`URL fetch failed: ${e.message}`)
    }
  }
  
  // Test simple generation
  const testGeneration = async () => {
    setLoading(true)
    try {
      // Use the simplest possible payload
      const res = await apiPost('/pipeline/generateOnComposed', {
        templateId: 'classic-canva-template-4',
        bgPath: 'bg-dark.png', // Use existing file without path
        ctx: {
          product: { name: 'Test Product', benefit: 'Saves time' },
          audience: 'Everyone',
          tone: 'friendly',
          locale: 'en-US'
        },
        twoStage: true,
        brandColors: ['#0057FF', '#F5F5F5']
      })
      setResponse(res)
      toast.add('Generation successful!')
    } catch (e: any) {
      setError(e.message)
      toast.add(`Generation failed: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Text Overlay Debug</h1>
      
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <h2 className="font-semibold mb-4">API Tests</h2>
          <div className="space-y-2">
            <Button onClick={testHealth} className="w-full">Test Health</Button>
            <Button onClick={testTemplates} className="w-full">Test Templates</Button>
            <Button onClick={testUrlFetch} className="w-full">Test URL Fetch</Button>
            <Button onClick={testGeneration} disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Generation'
              )}
            </Button>
          </div>
        </Card>
        
        <Card className="p-4">
          <h2 className="font-semibold mb-4">API Info</h2>
          <div className="space-y-2 text-sm">
            <div>API Base: <code className="bg-gray-100 px-1">{API_BASE}</code></div>
            <div>Expected Port: 3000</div>
            <div>Frontend Port: 3001</div>
          </div>
        </Card>
      </div>
      
      {error && (
        <Card className="p-4 border-red-200 bg-red-50">
          <h3 className="font-semibold text-red-800 mb-2">Error</h3>
          <pre className="text-xs text-red-700 overflow-auto">{error}</pre>
        </Card>
      )}
      
      {response && (
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Response</h3>
          <pre className="text-xs overflow-auto max-h-96">
            {JSON.stringify(response, null, 2)}
          </pre>
          
          {response.url && (
            <div className="mt-4">
              <h4 className="font-semibold mb-2">Generated Image</h4>
              <img 
                src={response.url} 
                alt="Generated" 
                className="max-w-full border rounded"
                onError={(e) => {
                  console.error('Image load failed:', e)
                  toast.add('Failed to load image')
                }}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
