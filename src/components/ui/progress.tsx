'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0 ~ 100 */
  value?: number
  /** 진행률을 알 수 없을 때(indeterminate) true */
  indeterminate?: boolean
}

/**
 * 단순 진행률 바. Radix 의존성 없이 div 두 개로 구현한다.
 * value(0~100)를 막대 폭으로 매핑하며 indeterminate면 펄스 애니메이션.
 */
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, indeterminate = false, ...props }, ref) => {
    const clamped = Math.max(0, Math.min(100, value))
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
        className={cn(
          'relative h-2 w-full overflow-hidden rounded-full bg-primary/15',
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            'h-full rounded-full bg-primary transition-all duration-300 ease-out',
            indeterminate && 'w-1/3 animate-pulse',
          )}
          style={indeterminate ? undefined : { width: `${clamped}%` }}
        />
      </div>
    )
  },
)
Progress.displayName = 'Progress'

export { Progress }
