"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { 
  Check, 
  Zap, 
  Crown, 
  Sparkles,
  CreditCard,
  ArrowRight,
  Star
} from 'lucide-react'

function SubscriptionContent() {
  const { userCredits, refreshCredits } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState<string | null>(null)

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      credits: 5,
      description: 'Perfect for trying out',
      icon: Sparkles,
      gradient: 'from-gray-400 to-gray-600',
      bgGradient: 'from-gray-50 to-white',
      borderColor: 'border-gray-200',
      features: [
        '5 credits included',
        'Basic templates',
        'PNG downloads',
        'Community support'
      ],
      limitations: [
        'Limited template access',
        'Basic export options'
      ],
      current: userCredits?.plan_type === 'free'
    },
    {
      id: 'plus',
      name: 'Plus',
      price: '$19.90',
      credits: 50,
      description: 'For growing businesses',
      icon: Zap,
      gradient: 'from-blue-500 to-blue-700',
      bgGradient: 'from-blue-50 to-indigo-50',
      borderColor: 'border-blue-200',
      features: [
        '50 credits monthly',
        'Premium templates',
        'Priority support',
        'PNG & SVG downloads',
        'Brand color extraction',
        'Social media formats'
      ],
      popular: true,
      current: userCredits?.plan_type === 'plus'
    },
    {
      id: 'premium',
      name: 'Premium',
      price: '$69.90',
      credits: 300,
      description: 'Value for money power users',
      icon: Crown,
      gradient: 'from-purple-500 to-purple-700',
      bgGradient: 'from-purple-50 to-pink-50',
      borderColor: 'border-purple-200',
      features: [
        '300 credits monthly',
        'All premium templates',
        'Priority support',
        'All export formats',
        'Advanced customization',
        'Bulk generation',
        'API access',
        'Commercial usage'
      ],
      current: userCredits?.plan_type === 'premium'
    }
  ]

  const handleUpgrade = async (planId: string) => {
    if (planId === 'free') {
      toast.add('You are already on the free plan')
      return
    }

    setLoading(planId)
    
    try {
      // TODO: Integrate with Stripe
      toast.add('Stripe integration coming soon!')
      setTimeout(() => setLoading(null), 1000)
    } catch (error) {
      toast.add('Payment failed. Please try again.')
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 via-slate-50 to-blue-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Choose Your{' '}
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Creative Plan
            </span>
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Unlock the full potential of AI-powered marketing content creation
          </p>
          
          {userCredits && (
            <div className="mt-6 inline-flex items-center gap-2 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-full border border-blue-200">
              <CreditCard className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">
                Current: <span className="font-bold text-blue-600 capitalize">{userCredits.plan_type}</span> plan
                • <span className="font-bold text-green-600">{userCredits.credits_remaining}</span> credits
              </span>
            </div>
          )}
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="relative"
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
                  <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                    <Star className="h-4 w-4" />
                    MOST POPULAR
                  </div>
                </div>
              )}
              
              <Card className={`h-full p-8 ${
                plan.popular 
                  ? 'bg-gradient-to-br from-blue-50 via-white to-purple-50 border-2 border-blue-300 shadow-2xl scale-105' 
                  : `bg-gradient-to-br ${plan.bgGradient} border ${plan.borderColor} shadow-lg hover:shadow-xl`
              } transition-all rounded-2xl relative overflow-hidden`}>
                
                {plan.current && (
                  <div className="absolute top-4 right-4 bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full">
                    CURRENT
                  </div>
                )}

                <div className="text-center mb-8">
                  <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center`}>
                    <plan.icon className="h-8 w-8 text-white" />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <div className="mb-3">
                    <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                    {plan.id !== 'free' && <span className="text-gray-600">/month</span>}
                  </div>
                  <p className="text-gray-600">{plan.description}</p>
                  
                  <div className="mt-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                    <span className="text-2xl font-bold text-green-600">{plan.credits}</span>
                    <span className="text-sm text-green-700 ml-1">
                      {plan.id === 'free' ? 'credits total' : 'credits/month'}
                    </span>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">Included:</h4>
                    <ul className="space-y-2">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-3">
                          <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                          <span className="text-gray-700">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-auto">
                  <Button
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={loading === plan.id || plan.current}
                    className={`w-full py-3 text-lg font-semibold rounded-xl transition-all ${
                      plan.current
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : plan.popular
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                        : `bg-gradient-to-r ${plan.gradient} hover:opacity-90 text-white`
                    }`}
                  >
                    {loading === plan.id ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </div>
                    ) : plan.current ? (
                      'Current Plan'
                    ) : plan.id === 'free' ? (
                      'Current Plan'
                    ) : (
                      <>
                        Upgrade to {plan.name}
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* FAQ Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="max-w-3xl mx-auto"
        >
          <Card className="p-8 bg-gradient-to-br from-white via-blue-50/30 to-white border border-blue-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
              Frequently Asked Questions
            </h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">How do credits work?</h3>
                <p className="text-gray-600">
                  Each AI generation uses 1 credit. Credits reset monthly with Plus and Premium plans, 
                  or you can purchase additional credits as needed.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Can I change my plan anytime?</h3>
                <p className="text-gray-600">
                  Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately, 
                  and you'll be charged/credited the prorated difference.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Do credits expire?</h3>
                <p className="text-gray-600">
                  No! Your credits never expire. However, you need an active subscription to use them. 
                  If you cancel and later resubscribe, your unused credits will still be valid.
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

export default function SubscriptionPage() {
  return (
    <ProtectedRoute>
      <SubscriptionContent />
    </ProtectedRoute>
  )
}