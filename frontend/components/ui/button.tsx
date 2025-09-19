import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-slate-900 text-white hover:bg-slate-800',
        outline: 'border border-slate-300 hover:bg-slate-50',
        ghost: 'hover:bg-slate-50',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-9 px-4',
        lg: 'h-10 px-6',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      // Clone child and merge className/props so we don't pass asChild to DOM
      const mergedClass = cn(buttonVariants({ variant, size }), (children.props as any)?.className, className)
      return React.cloneElement(children as React.ReactElement<any>, { ...props, ref, className: mergedClass })
    }
    return (
      <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
