"use client"
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { 
  CreditCard,
  Zap,
  ShoppingCart,
  TrendingUp,
  AlertCircle,
  Check,
  ArrowRight,
  Sparkles
} from 'lucide-react'

function CreditsContent() {
  const { userCredits, refreshCredits } = useAuth()
  const toast = useToast()
  const [loading, setLoading] = useState<string | null>(null)

  const creditPacks = [
    {
      id: 'small',
      name: '10 Credits',
      price: '$4.90',
      credits: 10,
      value: '$0.49 per credit',
      description: 'Perfect for quick projects',
      icon: Sparkles,
      gradient: 'from-green-400 to-green-600',
      popular: false
    },
    {
      id: 'medium',
      name: '50 Credits',
      price: '$14.90',
      credits: 50,
      value: '$0.30 per credit',
      description: 'Great value for regular use',
      icon: Zap,
      gradient: 'from-blue-400 to-blue-600',
      popular: true,
      savings: '39% savings'
    },
    {
      id: 'large',
      name: '200 Credits',
      price: '$44.50',
      credits: 200,
      value: '$0.22 per credit',
      description: 'Best value for power users',
      icon: TrendingUp,
      gradient: 'from-purple-400 to-purple-600',
      popular: false,
      savings: '55% savings'
    }
  ]

  const handlePurchase = async (packId: string) => {
    // Check if user has active subscription
    if (!userCredits || userCredits.plan_type === 'free') {
      toast.add('Credit top-ups are only available for Plus and Premium subscribers. Please upgrade your subscription first.')
      return
    }

    setLoading(packId)
    
    try {
      // TODO: Integrate with Stripe
      toast.add('Stripe integration coming soon!')
      setTimeout(() => setLoading(null), 1000)
    } catch (error) {
      toast.add('Purchase failed. Please try again.')
      setLoading(null)
    }
  }

  const canPurchaseCredits = userCredits && userCredits.plan_type !== 'free'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 via-slate-50 to-blue-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Top Up Your{' '}
            <span className="bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
              Credits
            </span>
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Never run out of creative power. Purchase additional credits anytime.
          </p>
        </motion.div>

        {/* Current Credits Display */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-12"
        >
          <Card className="max-w-md mx-auto p-8 bg-gradient-to-br from-white via-green-50/30 to-white border border-green-200 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center">
              <CreditCard className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Current Balance</h2>
            <div className="text-4xl font-bold text-green-600 mb-2">
              {userCredits?.credits_remaining || 0}
            </div>
            <p className="text-gray-600 capitalize">
              {userCredits?.plan_type || 'Free'} Plan
            </p>
          </Card>
        </motion.div>

        {/* Subscription Required Notice */}
        {!canPurchaseCredits && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <Card className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200">
              <div className="flex items-start gap-4">
                <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-900 mb-2">
                    Subscription Required
                  </h3>
                  <p className="text-amber-800 mb-4">
                    Credit top-ups are only available for Plus and Premium subscribers. 
                    Upgrade your subscription to purchase additional credits.
                  </p>
                  <Button 
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => window.location.href = '/subscription'}
                  >
                    Upgrade Subscription
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Credit Packs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {creditPacks.map((pack, index) => (
            <motion.div
              key={pack.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.1 }}
              className="relative"
            >
              {pack.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
                  <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg">
                    BEST VALUE
                  </div>
                </div>
              )}

              <Card className={`h-full p-8 ${
                pack.popular 
                  ? 'bg-gradient-to-br from-blue-50 via-white to-purple-50 border-2 border-blue-300 shadow-2xl scale-105' 
                  : 'bg-gradient-to-br from-white via-gray-50/30 to-white border border-gray-200 shadow-lg hover:shadow-xl'
              } transition-all rounded-2xl relative overflow-hidden ${
                !canPurchaseCredits ? 'opacity-50' : ''
              }`}>
                
                {pack.savings && (
                  <div className="absolute top-4 right-4 bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full">
                    {pack.savings}
                  </div>
                )}

                <div className="text-center mb-8">
                  <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${pack.gradient} flex items-center justify-center`}>
                    <pack.icon className="h-8 w-8 text-white" />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{pack.name}</h3>
                  <div className="mb-3">
                    <span className="text-4xl font-bold text-gray-900">{pack.price}</span>
                  </div>
                  <p className="text-gray-600 mb-2">{pack.description}</p>
                  <p className="text-sm text-gray-500">{pack.value}</p>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600">{pack.credits}</div>
                      <div className="text-sm text-green-700">Credits added to your account</div>
                    </div>
                  </div>

                  <ul className="space-y-2">
                    <li className="flex items-center gap-3">
                      <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <span className="text-gray-700">Instant delivery</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <span className="text-gray-700">Never expires</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <span className="text-gray-700">Works with all features</span>
                    </li>
                  </ul>
                </div>

                <Button
                  onClick={() => handlePurchase(pack.id)}
                  disabled={loading === pack.id || !canPurchaseCredits}
                  className={`w-full py-3 text-lg font-semibold rounded-xl transition-all ${
                    !canPurchaseCredits
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : pack.popular
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                      : `bg-gradient-to-r ${pack.gradient} hover:opacity-90 text-white`
                  }`}
                >
                  {loading === pack.id ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </div>
                  ) : !canPurchaseCredits ? (
                    'Subscription Required'
                  ) : (
                    <>
                      <ShoppingCart className="mr-2 h-5 w-5" />
                      Purchase Credits
                    </>
                  )}
                </Button>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Contact Support */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-center"
        >
          <Card className="max-w-2xl mx-auto p-8 bg-gradient-to-br from-white via-blue-50/30 to-white border border-blue-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Need More Credits?
            </h2>
            <p className="text-gray-600 mb-6">
              For bulk purchases or enterprise solutions, contact our support team for custom pricing.
            </p>
            <Button 
              variant="outline"
              className="border-blue-200 text-blue-700 hover:bg-blue-50"
              onClick={() => window.location.href = 'mailto:support@kawisoftware.com'}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Contact Support
            </Button>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

export default function CreditsPage() {
  return (
    <ProtectedRoute>
      <CreditsContent />
    </ProtectedRoute>
  )
}