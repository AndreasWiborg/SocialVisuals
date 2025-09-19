import * as React from 'react'
import { cn } from '../../lib/utils'

export function Dialog({ open, onClose, children, className }: { open?: boolean; onClose?: () => void; children: React.ReactNode; className?: string }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className={cn('w-full max-w-md rounded-lg bg-white p-4 shadow-lg', className)} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-lg font-semibold">{children}</div>
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 flex justify-end gap-2">{children}</div>
}
