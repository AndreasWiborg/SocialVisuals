import { Brain, Type, Images } from 'lucide-react'

const items = [
  {
    icon: Brain,
    title: 'Understand brand',
    text: 'We analyze your site and assets to learn tone and value.'
  },
  {
    icon: Type,
    title: 'Write on-brand copy',
    text: 'Generate concise, on-voice text that actually fits.'
  },
  {
    icon: Images,
    title: 'Render across templates',
    text: 'Ship a gallery of ready images in minutes.'
  }
]

export function Explainer() {
  return (
    <section className="py-14">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Mix your ingredients</h2>
        <p className="mt-2 text-slate-600">Assets in, on‑brand copy out — ready to ship.</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-3">
        {items.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border bg-white/80 p-6 shadow-sm backdrop-blur">
            <Icon className="h-7 w-7 text-slate-800" />
            <div className="mt-3 text-[15px] font-semibold tracking-tight text-slate-900">{title}</div>
            <p className="mt-1.5 text-[13px] leading-6 text-slate-600">{text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
