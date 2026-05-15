'use client'

import { AlertTriangle } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 확인 시 실행할 콜백 */
  onConfirm: () => void
  title: string
  description?: string
  /** 확인 버튼 라벨 (기본: "삭제") */
  confirmLabel?: string
  /** 취소 버튼 라벨 (기본: "취소") */
  cancelLabel?: string
  /** 위험 작업이면 destructive 스타일 (기본: true) */
  destructive?: boolean
}

/**
 * 범용 확인 다이얼로그.
 *
 * shadcn AlertDialog가 프로젝트에 없으므로 기존 Dialog 프리미티브로 구현한다.
 * 새 의존성 없이 페이지 삭제 등 파괴적 작업의 확인 단계로 사용한다.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel = '삭제',
  cancelLabel = '취소',
  destructive = true,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm gap-0 p-0"
        aria-describedby={description ? undefined : 'confirm-no-desc'}
      >
        <DialogHeader className="gap-2.5 p-5">
          <div className="flex items-start gap-3">
            {destructive && (
              <span
                className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-destructive-soft text-destructive"
                aria-hidden
              >
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-1.5">
              <DialogTitle>{title}</DialogTitle>
              {description ? (
                <DialogDescription>{description}</DialogDescription>
              ) : (
                <span id="confirm-no-desc" className="sr-only">
                  {title}
                </span>
              )}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2 border-t border-border bg-muted/40 px-5 py-3.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            size="sm"
            onClick={handleConfirm}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
