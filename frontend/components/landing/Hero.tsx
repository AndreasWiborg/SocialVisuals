"use client"
import { motion, useAnimationControls } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'

function MicroCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="min-w-[250px] rounded-2xl bg-white/90 backdrop-blur-lg p-4 shadow-lg border border-white/20">
      <div className="text-sm font-bold text-slate-900 mb-2">{title}</div>
      <div className="h-[40px] rounded-lg bg-gradient-to-r from-violet-100 to-indigo-100 animate-pulse" />
      <div className="mt-3 text-xs text-slate-600">{subtitle}</div>
    </div>
  )
}

export function Hero() {
  const controls = useAnimationControls()
  useEffect(() => {
    async function loop() {
      while (true) {
        await controls.start({ x: ['0%', '-50%'], transition: { duration: 18, ease: 'linear' } })
        await controls.set({ x: 0 })
      }
    }
    loop()
  }, [controls])

  return (
    <section className="relative overflow-hidden py-20 px-6">
      {/* Enhanced gradient background with new colors */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-[#3F72AF]/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#112D4E]/20 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute -bottom-8 left-20 w-[600px] h-[600px] bg-[#DBE2EF]/50 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#F9F7F7] via-transparent to-transparent" />
      </div>
      
      <div className="relative max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-[40px] sm:text-[56px] md:text-[64px] font-extrabold tracking-tight leading-[1.05]">
            <span className="text-[#0f172a]">Create Stunning Ads</span>
            <br />
            <span className="bg-gradient-to-r from-[#3F72AF] to-[#112D4E] bg-clip-text text-transparent">
              in 60 Seconds
            </span>
          </h1>
          <p className="mt-5 max-w-3xl mx-auto text-[18px] sm:text-[20px] text-slate-600 leading-relaxed">
            Turn your website into professional marketing materials with AI. 
            Just paste your URL and watch the magic happen.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              asChild
              className="h-14 px-10 text-lg font-bold bg-gradient-to-r from-[#3F72AF] to-[#112D4E] hover:from-[#3F72AF]/90 hover:to-[#112D4E]/90 text-white shadow-2xl hover:shadow-3xl transform hover:-translate-y-0.5 transition-all rounded-2xl relative overflow-hidden group"
            >
              <a href="/onboarding">
                <span className="relative z-10">Start Creating Free</span>
                <span className="ml-2 relative z-10">→</span>
                <div className="absolute inset-0 bg-gradient-to-r from-[#DBE2EF] to-[#3F72AF] opacity-0 group-hover:opacity-20 transition-opacity" />
              </a>
            </Button>
            <Button 
              asChild
              variant="outline" 
              className="h-14 px-8 text-lg font-semibold border-2 border-[#3F72AF]/30 hover:border-[#3F72AF] bg-white/90 backdrop-blur-sm rounded-2xl text-[#112D4E] hover:text-[#3F72AF] transition-all"
            >
              <a href="#demo">
                Watch Demo
                <span className="ml-2">▶</span>
              </a>
            </Button>
          </div>

          {/* Trust badges */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            {["No credit card required","10 free generations","Cancel anytime"].map((label) => (
              <div key={label} className="px-3 py-1.5 rounded-full text-[12px] sm:text-[13px] font-medium bg-white/80 backdrop-blur border border-slate-200 text-slate-700 shadow-sm">
                {label}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-16 overflow-hidden rounded-3xl bg-gradient-to-br from-[#112D4E] to-[#3F72AF] p-1 shadow-2xl"
        >
          <div className="rounded-[20px] bg-gradient-to-br from-[#0f172a]/95 to-[#1e293b]/95 p-8 backdrop-blur-xl">
            <div className="relative flex w-full overflow-hidden rounded-2xl bg-gradient-to-r from-white/5 to-white/0 p-6 border border-white/10">
              <motion.div className="flex gap-6" animate={controls}>
                {[0, 1].map((row) => (
                  <div key={row} className="flex gap-6">
                    <MicroCard title="Upload Assets" subtitle="Logo & product images" />
                    <MicroCard title="Enter URL" subtitle="Auto‑extract content" />
                    <MicroCard title="AI Generation" subtitle="Multiple variations" />
                    <MicroCard title="Download" subtitle="High‑res exports" />
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
