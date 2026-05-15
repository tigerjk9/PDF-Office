import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium tabular-nums leading-none transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary-soft text-primary [&]:border-primary-soft-border',
        secondary:
          'border-border bg-muted text-muted-foreground',
        destructive:
          'border-destructive-soft-border bg-destructive-soft text-destructive',
        outline: 'border-border text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
