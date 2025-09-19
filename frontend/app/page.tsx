'use client'
import * as React from 'react'
import { motion } from 'framer-motion'
import { Hero } from '@/components/landing/Hero'
import { Carousel } from '@/components/landing/Carousel'
import { Explainer } from '@/components/landing/Explainer'
import { Why } from '@/components/landing/Why'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowRight, Check, Sparkles, Image as ImageIcon, Link2, Zap, Upload, Wand2, Download } from 'lucide-react'

export default function Page() {
  const [generatedImages, setGeneratedImages] = React.useState<string[]>([])
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [demoIndex, setDemoIndex] = React.useState<any | null>(null)
  const [brandId, setBrandId] = React.useState<string>('')
  const [productId, setProductId] = React.useState<string>('')

  React.useEffect(() => {
    fetch('/demo/demo-index.json').then(r => r.ok ? r.json() : null).then((j) => {
      if (j && j.brands && j.brands.length) {
        setDemoIndex(j)
        setBrandId(j.brands[0].id)
        setProductId(j.brands[0].products?.[0]?.id || '')
      }
    }).catch(() => {})
  }, [])

  const handleGenerate = async () => {
    setIsGenerating(true)
    if (demoIndex && brandId) {
      const b = demoIndex.brands.find((x: any) => x.id === brandId)
      const p = b?.products?.find((x: any) => x.id === productId) || b?.products?.[0]
      const vars = p?.variants || []
      setTimeout(() => {
        setGeneratedImages(vars.length ? vars : ['/api/placeholder/400/400','/api/placeholder/400/400','/api/placeholder/400/400'])
        setIsGenerating(false)
      }, 600)
    } else {
      setTimeout(() => {
        setGeneratedImages(['/api/placeholder/400/400','/api/placeholder/400/400','/api/placeholder/400/400'])
        setIsGenerating(false)
      }, 1000)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F9F7F7] via-[#DBE2EF]/30 to-[#F9F7F7]">
      {/* Enhanced Hero with better styling */}
      <Hero />
      
      {/* Generate Section - Ingredients Style */}
      <section className="py-20 px-6 relative">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-slate-900 mb-4">
              Mix Your <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Ingredients</span>
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Add your brand elements and watch AI create stunning variations
            </p>
          </motion.div>

          {/* Demo brand/product selectors */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
            <Card className="p-6 bg-gradient-to-br from-violet-50 to-white border-violet-200/50 shadow-xl rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-violet-200 flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-violet-600" />
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Select Brand</h3>
              {demoIndex ? (
                <select value={brandId} onChange={(e)=>{ setBrandId(e.target.value); const b = demoIndex.brands.find((x:any)=>x.id===e.target.value); setProductId(b?.products?.[0]?.id||'')}} className="w-full px-4 py-3 rounded-xl border border-violet-200 bg-white/50 focus:border-violet-400 focus:ring-4 focus:ring-violet-100">
                  {demoIndex.brands.map((b:any)=>(<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
              ) : (
                <input type="text" placeholder="Brand name" className="w-full px-4 py-3 rounded-xl border border-violet-200 bg-white/50" />
              )}
            </Card>
            <Card className="p-6 bg-gradient-to-br from-indigo-50 to-white border-indigo-200/50 shadow-xl rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center mb-4">
                <Link2 className="h-6 w-6 text-indigo-600" />
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Website</h3>
              <input disabled value={(demoIndex?.brands.find((x:any)=>x.id===brandId)?.url)||''} placeholder="https://example.com" className="w-full px-4 py-3 rounded-xl border border-indigo-200 bg-white/50" />
            </Card>
            <Card className="p-6 bg-gradient-to-br from-purple-50 to-white border-purple-200/50 shadow-xl rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center mb-4">
                <ImageIcon className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-3">Choose Product Image</h3>
              <div className="grid grid-cols-2 gap-3">
                {(demoIndex?.brands.find((x:any)=>x.id===brandId)?.products||[]).map((p:any)=> (
                  <button key={p.id} onClick={()=>setProductId(p.id)} className={`rounded-xl border-2 overflow-hidden ${productId===p.id? 'border-purple-500':'border-purple-200'}`}>
                    <img src={p.image} alt={p.name} className="h-24 w-full object-cover" />
                    <div className="p-1 text-xs text-slate-700 truncate">{p.name}</div>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Central Generate Button */}
          <div className="flex justify-center mb-20 relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-96 h-96 bg-gradient-to-r from-violet-200 to-indigo-200 rounded-full blur-3xl opacity-20 animate-pulse"></div>
            </div>
            <Button 
              onClick={handleGenerate}
              disabled={isGenerating}
              className="relative px-12 py-8 text-xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 transition-all rounded-2xl"
            >
              {isGenerating ? (
                <>
                  <div className="h-6 w-6 border-3 border-white border-t-transparent rounded-full animate-spin mr-3" />
                  Mixing ingredients...
                </>
              ) : (
                <>
                  <Wand2 className="mr-3 h-6 w-6" />
                  Generate Magic
                </>
              )}
            </Button>
          </div>

          {/* Generated Results */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="relative"
          >
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-slate-900">Fresh from the oven</h3>
              <p className="text-slate-600 mt-2">Click any design to download</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[1, 2, 3].map((idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  whileHover={{ y: -10 }}
                  className="group cursor-pointer"
                >
                  <Card className="overflow-hidden shadow-xl hover:shadow-2xl transition-all rounded-2xl">
                    <div className="aspect-square bg-gradient-to-br from-slate-100 to-slate-200 p-6">
                      {generatedImages.length > 0 ? (
                        <img src={generatedImages[idx-1]} alt={`Generated ${idx}`} className="w-full h-full object-cover rounded-xl" />
                      ) : (
                        <div className="w-full h-full rounded-xl bg-white/50 flex flex-col items-center justify-center">
                          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mb-4">
                            <ImageIcon className="h-10 w-10 text-violet-600" />
                          </div>
                          <p className="text-sm text-slate-500">Your design #{idx}</p>
                        </div>
                      )}
                    </div>
                    <div className="p-4 bg-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold text-slate-900">Design Variant {idx}</h4>
                          <p className="text-xs text-slate-500 mt-1">1080x1080 • PNG</p>
                        </div>
                        <Button size="sm" variant="outline" className="rounded-lg">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <Why />

      {/* How It Works - Redesigned */}
      <section className="py-24 px-6 relative overflow-hidden">
        {/* Dynamic gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#DBE2EF] via-[#F9F7F7] to-[#DBE2EF]">
          <div className="absolute top-20 left-20 w-96 h-96 bg-[#3F72AF]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-[#112D4E]/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>
        
        <div className="max-w-7xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-5xl font-extrabold mb-4">
              <span className="bg-gradient-to-r from-[#3F72AF] to-[#112D4E] bg-clip-text text-transparent">
                How Our Magic Works
              </span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left side - Full explanation */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/50">
                <h3 className="text-3xl font-bold text-[#112D4E] mb-6">
                  Why Marketers Love Us
                </h3>
                
                <div className="space-y-6 text-lg text-[#3F72AF]">
                  <p>
                    <span className="font-bold text-[#112D4E]">Save 90% of your time</span> - What usually takes days now takes minutes. Our AI understands your brand instantly and creates dozens of on-brand variations.
                  </p>
                  
                  <p>
                    <span className="font-bold text-[#112D4E]">Cut costs by 75%</span> - No more expensive agencies or freelancers. Get unlimited professional designs for the price of a coffee subscription.
                  </p>
                  
                  <p>
                    <span className="font-bold text-[#112D4E]">Never run out of content</span> - Generate months worth of social media posts, ad creatives, and marketing materials in one click.
                  </p>
                  
                  <p>
                    <span className="font-bold text-[#112D4E]">AI that actually gets you</span> - Our models analyze your website, understand your industry, and create copy that speaks directly to your customers.
                  </p>
                </div>

                <div className="mt-8 flex flex-wrap gap-4">
                  <div className="px-4 py-2 bg-gradient-to-r from-[#3F72AF] to-[#112D4E] text-white rounded-xl text-sm font-medium">
                    10x Faster
                  </div>
                  <div className="px-4 py-2 bg-gradient-to-r from-[#3F72AF] to-[#112D4E] text-white rounded-xl text-sm font-medium">
                    75% Cheaper
                  </div>
                  <div className="px-4 py-2 bg-gradient-to-r from-[#3F72AF] to-[#112D4E] text-white rounded-xl text-sm font-medium">
                    100% On-Brand
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Right side - Vertical steps */}
            <div className="space-y-6">
              {[
                {
                  step: '1',
                  title: 'Upload Your Brand Images',
                  description: 'We understand your style, colors, audience and create a unique brand profile that ensures every design is perfectly on-brand.',
                  icon: Upload,
                  gradient: 'from-violet-500 to-purple-600'
                },
                {
                  step: '2',
                  title: 'Provide Your URL',
                  description: 'We research your service, industry and customers to provide the best text copies that\'s personalized for your business.',
                  icon: Link2,
                  gradient: 'from-blue-500 to-indigo-600'
                },
                {
                  step: '3',
                  title: 'Click Generate & Relax',
                  description: 'Sit back while we create a month\'s worth of ad creatives, social media posts, keyword analysis and more!',
                  icon: Sparkles,
                  gradient: 'from-purple-500 to-pink-600'
                }
              ].map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: 50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.2 }}
                  className="relative"
                >
                  <div className="flex gap-6">
                    {/* Step number with gradient */}
                    <div className="flex-shrink-0">
                      <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${item.gradient} p-0.5`}>
                        <div className="w-full h-full bg-white rounded-2xl flex items-center justify-center">
                          <span className={`text-3xl font-bold bg-gradient-to-br ${item.gradient} bg-clip-text text-transparent`}>
                            {item.step}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <Card className="p-6 bg-white/80 backdrop-blur-xl border-white/50 shadow-xl hover:shadow-2xl transition-all rounded-2xl">
                        <div className="flex items-start gap-4">
                          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center flex-shrink-0`}>
                            <item.icon className="h-6 w-6 text-white" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-[#112D4E] mb-2">{item.title}</h3>
                            <p className="text-[#3F72AF] leading-relaxed">{item.description}</p>
                          </div>
                        </div>
                      </Card>
                    </div>
                  </div>

                  {/* Connecting line */}
                  {idx < 2 && (
                    <div className="absolute left-10 top-20 bottom-0 w-0.5 bg-gradient-to-b from-[#3F72AF]/30 to-transparent"></div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 px-6 relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-tr from-[#F9F7F7] via-[#DBE2EF]/40 to-[#F9F7F7]">
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#3F72AF]/10 rounded-full blur-3xl"></div>
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#112D4E]/5 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-6xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold text-slate-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Choose the plan that fits your needs. Upgrade or downgrade anytime.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                name: 'Free',
                price: '$0',
                description: 'Perfect for trying out',
                features: [
                  '10 ad generations per month',
                  'Basic templates',
                  'Standard support',
                  'PNG downloads'
                ],
                cta: 'Start Free',
                popular: false
              },
              {
                name: 'Plus',
                price: '$29',
                description: 'For growing businesses',
                features: [
                  '100 ad generations per month',
                  'Premium templates',
                  'Priority support',
                  'PNG & SVG downloads',
                  'Custom branding',
                  'A/B testing'
                ],
                cta: 'Start Plus',
                popular: true
              },
              {
                name: 'Pro',
                price: '$99',
                description: 'For marketing teams',
                features: [
                  'Unlimited generations',
                  'All templates + custom',
                  'Dedicated support',
                  'All export formats',
                  'Team collaboration',
                  'API access',
                  'Custom integrations'
                ],
                cta: 'Start Pro',
                popular: false
              }
            ].map((plan, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="relative"
              >
                {plan.popular && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-10">
                    <div className="px-6 py-2 bg-gradient-to-r from-[#3F72AF] to-[#112D4E] text-white text-sm font-bold rounded-full shadow-xl">
                      MOST POPULAR
                    </div>
                  </div>
                )}
                <Card className={`p-8 h-full ${
                  plan.popular 
                    ? 'bg-gradient-to-br from-[#3F72AF]/10 via-white to-[#DBE2EF]/20 border-[#3F72AF]/30 shadow-2xl scale-105' 
                    : 'bg-white/90 hover:bg-gradient-to-br hover:from-white hover:to-[#F9F7F7]'
                } backdrop-blur-sm border-2 transition-all rounded-3xl relative overflow-hidden group`}>
                  {plan.popular && (
                    <div className="absolute inset-0 bg-gradient-to-br from-[#3F72AF]/5 to-transparent pointer-events-none" />
                  )}
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold text-slate-900">{plan.name}</h3>
                    <div className="mt-4">
                      <span className="text-4xl font-bold text-slate-900">{plan.price}</span>
                      <span className="text-slate-600">/month</span>
                    </div>
                    <p className="text-sm text-slate-600 mt-2">{plan.description}</p>
                  </div>

                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, fidx) => (
                      <li key={fidx} className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <span className="text-slate-700">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button 
                    asChild 
                    className={`w-full py-6 text-base font-bold rounded-2xl transition-all transform hover:-translate-y-0.5 ${
                      plan.popular 
                        ? 'bg-gradient-to-r from-[#3F72AF] to-[#112D4E] hover:from-[#3F72AF]/90 hover:to-[#112D4E]/90 text-white shadow-xl hover:shadow-2xl' 
                        : 'bg-gradient-to-r from-[#DBE2EF] to-[#3F72AF]/20 hover:from-[#3F72AF]/20 hover:to-[#112D4E]/20 text-[#112D4E] border border-[#3F72AF]/20'
                    }`}
                  >
                    <a href="/auth/signup">
                      {plan.cta}
                      <span className="ml-2">→</span>
                    </a>
                  </Button>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Original sections - moved after pricing */}
      <Explainer />
      
      {/* Spinning Demo - Now at the bottom */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6 text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">See It In Action</h2>
          <p className="text-lg text-slate-600">Watch how quickly we transform your content into ads</p>
        </div>
        <Carousel />
      </section>

      {/* Footer */}
      <footer className="py-20 px-6 bg-gradient-to-b from-[#112D4E] to-[#112D4E]/95 text-white mt-20 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#3F72AF]/20 rounded-full blur-3xl"></div>
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#DBE2EF]/10 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-6xl mx-auto relative">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="font-bold text-white text-2xl mb-4 bg-gradient-to-r from-[#DBE2EF] to-[#3F72AF] bg-clip-text text-transparent">AdCreator+</h3>
              <p className="text-sm text-[#DBE2EF]/80">AI-powered ad creation for modern marketers.</p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-[#DBE2EF]/80">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Templates</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-[#DBE2EF]/80">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Support</h4>
              <ul className="space-y-2 text-sm text-[#DBE2EF]/80">
                <li><a href="#" className="hover:text-white transition-colors">Docs</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[#3F72AF]/20 pt-8 text-center text-sm text-[#DBE2EF]/60">
            <p>© {new Date().getFullYear()} AdCreator+. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
