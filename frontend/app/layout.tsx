import type { Metadata } from 'next'
import { Inter_Tight } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/components/ui/toast'
import { AuthProvider } from '@/lib/auth/context'
import { Header } from '@/components/ui/header'

const fontSans = Inter_Tight({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'AdCreator+',
  description: 'AdCreator+ UI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontSans.variable}>
      <body className="min-h-screen font-sans">
        <AuthProvider>
          <ToastProvider>
            <Header />
            <main className="container py-10">{children}</main>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
