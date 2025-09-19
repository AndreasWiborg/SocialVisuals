"use client"
import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dialog, DialogHeader } from '@/components/ui/dialog'

const FALLBACKS = [
  'https://placehold.co/800x1000/111/EEE.png?text=Portrait+1',
  'https://placehold.co/800x1000/222/EEE.png?text=Portrait+2',
  'https://placehold.co/800x1000/333/EEE.png?text=Portrait+3',
]

function useAutoAdvance(length: number, delay = 3000) {
  const [idx, setIdx] = React.useState(0)
  React.useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % length), delay)
    return () => clearInterval(t)
  }, [length, delay])
  return [idx, setIdx] as const
}

export function Carousel() {
  const images = React.useMemo(() => {
    // Try local /demo assets (if user placed PNGs), else fall back to remote placeholders
    const locals = ['demo/demo-1.png', 'demo/demo-2.png', 'demo/demo-3.png', 'demo/demo-4.png', 'demo/demo-5.png']
    return locals.map((p) => `/${p}`)
  }, [])

  const [active, setActive] = useAutoAdvance(3, 2800)
  const [open, setOpen] = React.useState(false)
  const [preview, setPreview] = React.useState<string | null>(null)

  const pool = images.slice(0, 3)

  return (
    <section className="py-10">
      <div className="mb-4 text-center text-sm uppercase tracking-wider text-slate-500">Live demo</div>
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
        {pool.map((src, i) => (
          <motion.div
            key={i}
            className="group relative overflow-hidden rounded-xl border bg-white/60 shadow-sm backdrop-blur"
            whileHover={{ scale: 1.01 }}
            transition={{ type: 'spring', stiffness: 180, damping: 20 }}
            onClick={() => {
              setPreview(src)
              setOpen(true)
            }}
          >
            {/* Use native img for performance; Next/Image optional */}
            <img
              src={src}
              alt="demo"
              onError={(e) => {
                ;(e.target as HTMLImageElement).src = FALLBACKS[i % FALLBACKS.length]
              }}
              className="h-[360px] w-full object-cover transition-all duration-300 group-hover:brightness-105"
            />
          </motion.div>
        ))}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogHeader>Preview</DialogHeader>
        {preview && (
          <img src={preview} alt="preview" className="max-h-[70vh] w-full rounded-md object-contain" />
        )}
      </Dialog>
    </section>
  )
}

