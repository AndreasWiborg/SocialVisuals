"use client"
import { useAuth } from '@/lib/auth/context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAuth?: boolean
}

export function ProtectedRoute({ children, requireAuth = true }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (requireAuth && !loading && !user) {
      router.push('/auth/login')
    }
  }, [user, loading, router, requireAuth])

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Don't render anything if user is required but not authenticated
  if (requireAuth && !user) {
    return null
  }

  return <>{children}</>
}