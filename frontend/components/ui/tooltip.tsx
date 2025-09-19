import * as React from 'react'

export function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && (
        <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 rounded bg-black px-2 py-1 text-xs text-white">
          {content}
        </span>
      )}
    </span>
  )
}

