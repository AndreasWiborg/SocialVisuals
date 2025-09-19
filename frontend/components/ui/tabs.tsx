import * as React from 'react'
import { cn } from '../../lib/utils'

type DivProps = React.HTMLAttributes<HTMLDivElement>

type TabsContextValue = {
  value?: string
  setValue?: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue>({})

export function Tabs({
  children,
  className,
  defaultValue,
  value,
  onValueChange,
  ...rest
}: DivProps & { defaultValue?: string; value?: string; onValueChange?: (value: string) => void }) {
  const isControlled = typeof value !== 'undefined'
  const [internalValue, setInternalValue] = React.useState<string | undefined>(defaultValue)
  const currentValue = isControlled ? value : internalValue

  const setValue = React.useCallback(
    (v: string) => {
      if (!isControlled) setInternalValue(v)
      if (onValueChange) onValueChange(v)
    },
    [isControlled, onValueChange]
  )

  return (
    <TabsContext.Provider value={{ value: currentValue, setValue }}>
      <div className={cn('flex flex-col gap-2', className)} {...rest}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ children, className, ...rest }: DivProps) {
  return <div className={cn('flex gap-2', className)} {...rest}>{children}</div>
}

export function TabsTrigger({ value, onClick, children, className, ...rest }: { value: string; onClick?: React.MouseEventHandler<HTMLButtonElement>; children: React.ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(TabsContext)
  const isActive = ctx.value === value

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    ctx.setValue?.(value)
    if (onClick) onClick(e)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn('rounded-md px-3 py-1 text-sm', isActive ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

export function TabsContent({ children, className, value, ...rest }: DivProps & { value: string }) {
  const ctx = React.useContext(TabsContext)
  if (ctx.value !== value) return null
  return <div className={cn('rounded-md border p-3', className)} {...rest}>{children}</div>
}
