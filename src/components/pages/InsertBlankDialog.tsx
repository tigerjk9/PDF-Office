'use client'

import { useEffect, useState } from 'react'
import { FilePlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'

interface InsertBlankDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 기본 삽입 위치(0-based). 보통 현재 페이지 다음(현재+1). */
  defaultAtIndex?: number
}

/**
 * "빈 페이지 삽입" 다이얼로그 (P2-5).
 *
 * atIndex(0-based, 해당 위치 앞에 삽입)를 1-based로 입력받아
 * `applyOperation({ type:'insertBlank', docId, atIndex })` 호출.
 * 엔진 동결 계약 소비만 하며 lib/store는 수정하지 않는다.
 */
export function InsertBlankDialog({
  open,
  onOpenChange,
  defaultAtIndex,
}: InsertBlankDialogProps) {
  const activeDoc = usePdfStore(selectActiveDoc)
  const applyOperation = usePdfStore((s) => s.applyOperation)

  const [atInput, setAtInput] = useState('1')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !activeDoc) return
    const fallback = activeDoc.pageCount // 맨 뒤
    const at =
      defaultAtIndex != null
        ? Math.max(0, Math.min(activeDoc.pageCount, defaultAtIndex))
        : fallback
    setAtInput(String(at + 1))
    setSubmitting(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!activeDoc) return null

  const pageCount = activeDoc.pageCount

  const handleRun = async () => {
    if (submitting) return
    setSubmitting(true)
    const parsed = parseInt(atInput, 10)
    const at = Number.isNaN(parsed)
      ? pageCount
      : Math.max(0, Math.min(pageCount, parsed - 1))
    try {
      const result = await applyOperation({
        type: 'insertBlank',
        docId: activeDoc.id,
        atIndex: at,
      })
      if (result.success) {
        toast.success('빈 페이지를 삽입했습니다', {
          description: `${at + 1}번 위치에 빈 페이지를 추가했습니다.`,
        })
        onOpenChange(false)
      } else {
        toast.error('빈 페이지 삽입에 실패했습니다', {
          description:
            result.error?.message ?? '알 수 없는 오류가 발생했습니다.',
        })
      }
    } catch (cause) {
      toast.error('빈 페이지 삽입에 실패했습니다', {
        description:
          cause instanceof Error
            ? cause.message
            : '예기치 못한 오류가 발생했습니다.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 p-0">
        <DialogHeader className="gap-1.5 p-5">
          <DialogTitle className="flex items-center gap-2">
            <FilePlus className="h-4 w-4 text-muted-foreground" aria-hidden />
            빈 페이지 삽입
          </DialogTitle>
          <DialogDescription>
            빈 페이지를 추가할 위치를 입력하세요. 현재 문서는 총 {pageCount}
            페이지입니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 px-5 pb-1">
          <label
            htmlFor="blank-at-position"
            className="text-2xs font-medium text-muted-foreground"
          >
            삽입 위치 (1 ~ {pageCount + 1})
          </label>
          <input
            id="blank-at-position"
            type="text"
            inputMode="numeric"
            value={atInput}
            onChange={(e) =>
              setAtInput(e.target.value.replace(/[^0-9]/g, ''))
            }
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs tabular-nums transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="빈 페이지 삽입 위치"
          />
        </div>
        <DialogFooter className="gap-2 border-t border-border bg-muted/40 px-5 py-3.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            취소
          </Button>
          <Button size="sm" onClick={handleRun} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                삽입 중...
              </>
            ) : (
              <>
                <FilePlus className="h-4 w-4" />
                삽입
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
