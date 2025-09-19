"use client"
import { useAuth } from '@/lib/auth/context'
import { Button } from '@/components/ui/button'
import { Loader2, User, CreditCard, LogOut } from 'lucide-react'
import Link from 'next/link'

export function Header() {
  const { user, userCredits, loading, signOut } = useAuth()

  if (loading) {
    return (
      <header className="sticky top-0 z-50 border-b bg-white/70 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <div className="font-semibold tracking-tight">
            <Link href="/">AdCreator+</Link>
          </div>
          <div className="flex items-center">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-white/70 backdrop-blur">
      <div className="container flex h-14 items-center justify-between">
        <div className="font-semibold tracking-tight">
          <Link href="/">AdCreator+</Link>
        </div>
        
        {user ? (
          <div className="flex items-center gap-4">
            <nav className="text-sm text-slate-500 flex gap-6">
              <Link href="/onboarding" className="hover:text-slate-900">Start</Link>
              <Link href="/text-overlay" className="hover:text-slate-900">Text Overlay</Link>
              <Link href="/dashboard" className="hover:text-slate-900">Dashboard</Link>
              <Link href="/subscription" className="hover:text-slate-900">Plans</Link>
              <Link href="/credits" className="hover:text-slate-900">Credits</Link>
            </nav>
            
            {userCredits ? (
              <Link 
                href="/credits" 
                className="flex items-center gap-2 bg-gradient-to-r from-sky-50 to-indigo-50 px-3 py-2 rounded-lg border border-sky-200 hover:from-sky-100 hover:to-indigo-100 hover:border-sky-300 transition-all duration-200 cursor-pointer"
                title="Top up credits"
              >
                <CreditCard className="h-4 w-4 text-sky-600" />
                <span className="text-sm font-medium text-sky-900">
                  {userCredits.credits_remaining} credits
                </span>
              </Link>
            ) : (
              <div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg border border-gray-200">
                <CreditCard className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-500">Loading credits...</span>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="h-4 w-4" />
                <span>{user.email}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={signOut}
                className="ml-2"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <nav className="text-sm text-slate-500 flex gap-6">
            <Link href="/auth/login" className="hover:text-slate-900">Sign In</Link>
            <Link href="/auth/signup" className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
              Sign Up
            </Link>
          </nav>
        )}
      </div>
    </header>
  )
}