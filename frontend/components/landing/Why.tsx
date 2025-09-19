import { CheckCircle2, Zap, Sparkles, Shield, Gauge } from 'lucide-react'

const reasons = [
  { icon: Zap, title: 'Faster to first draft', text: 'From URL → ready images in minutes, not days.' },
  { icon: Gauge, title: 'Fits by design', text: 'Copy respects space. No truncation, no overflow.' },
  { icon: Shield, title: 'On-brand out of the box', text: 'Brand colors and assets are applied consistently.' },
  { icon: Sparkles, title: 'Variety with control', text: 'Multiple angles, smart ranking, clear winners.' },
]

export function Why() {
  return (
    <section className="py-16">
      <div className="text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">Why marketers love us</h2>
        <p className="mt-3 text-slate-600 text-[15px]">Real outputs. Bigger fonts. Fewer rounds.</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {reasons.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border bg-white/80 p-6 shadow-sm backdrop-blur">
            <Icon className="h-6 w-6 text-slate-800" />
            <div className="mt-3 text-[15px] font-semibold tracking-tight text-slate-900">{title}</div>
            <p className="mt-2 text-[13px] leading-6 text-slate-600">{text}</p>
            <div className="mt-4 flex items-center gap-2 text-[12px] text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> No design file required
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

