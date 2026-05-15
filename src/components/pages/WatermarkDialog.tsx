'use client'

import { useEffect, useState } from 'react'
import { Stamp, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'

interface WatermarkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * 워터마크 적용 다이얼로그 (P2-8).
 *
 * 텍스트 / 투명도(0~1) / 회전 각도를 입력받아
 * `applyOperation({ type:'watermark', docId, text, opacity, rotationDeg })`
 * 호출. 모든 페이지에 적용된다(엔진 동결 계약). lib/store 미수정.
 */
export function WatermarkDialog({ open, onOpenChange }: WatermarkDialogProps) {
  const activeDoc = usePdfStore(selectActiveDoc)
  const applyOperation = usePdfStore((s) => s.applyOperation)

  const [text, setText] = useState('CONFIDENTIAL')
  const [opacity, setOpacity] = useState(0.15)
  const [rotation, setRotation] = useState('45')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setText('CONFIDENTIAL')
    setOpacity(0.15)
    setRotation('45')
    setSubmitting(false)
  }, [open])

  if (!activeDoc) return null

  const trimmed = text.trim()
  const canRun = trimmed.length > 0 && !submitting

  const handleRun = async () => {
    if (!canRun) return
    setSubmitting(true)
    const rotParsed = parseInt(rotation, 10)
    const rotationDeg = Number.isNaN(rotParsed)
      ? 45
      : Math.max(-180, Math.min(180, rotParsed))
    try {
      const result = await applyOperation({
        type: 'watermark',
        docId: activeDoc.id,
        text: trimmed,
        opacity,
        rotationDeg,
      })
      if (result.success) {
        toast.success('워터마크를 적용했습니다', {
          description: `모든 페이지(${activeDoc.pageCount}p)에 "${trimmed}" 워터마크를 추가했습니다.`,
        })
        onOpenChange(false)
      } else {
        toast.error('워터마크 적용에 실패했습니다', {
          description:
            result.error?.message ?? '알 수 없는 오류가 발생했습니다.',
        })
      }
    } catch (cause) {
      toast.error('워터마크 적용에 실패했습니다', {
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
            <Stamp className="h-4 w-4 text-muted-foreground" aria-hidden />
            워터마크 추가
          </DialogTitle>
          <DialogDescription>
            현재 문서의 모든 페이지에 텍스트 워터마크를 적용합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 pb-1">
          {/* 텍스트 */}
          <div className="space-y-1.5">
            <label
              htmlFor="watermark-text"
              className="text-2xs font-medium text-muted-foreground"
            >
              워터마크 텍스트
            </label>
            <input
              id="watermark-text"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="예: 대외비, DRAFT"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs transition-colors placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="워터마크 텍스트"
            />
          </div>

          {/* 투명도 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-2xs font-medium text-muted-foreground">
                투명도
              </label>
              <span className="text-2xs tabular-nums text-muted-foreground">
                {Math.round(opacity * 100)}%
              </span>
            </div>
            <Slider
              value={[opacity]}
              min={0.05}
              max={1}
              step={0.05}
              onValueChange={([v]) => setOpacity(v)}
              aria-label="워터마크 투명도"
            />
          </div>

          {/* 회전 */}
          <div className="space-y-1.5">
            <label
              htmlFor="watermark-rotation"
              className="text-2xs font-medium text-muted-foreground"
            >
              회전 각도 (-180 ~ 180°)
            </label>
            <input
              id="watermark-rotation"
              type="text"
              inputMode="numeric"
              value={rotation}
              onChange={(e) =>
                setRotation(e.target.value.replace(/[^0-9-]/g, ''))
              }
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs tabular-nums transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="워터마크 회전 각도"
            />
          </div>
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
          <Button size="sm" onClick={handleRun} disabled={!canRun}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                적용 중...
              </>
            ) : (
              <>
                <Stamp className="h-4 w-4" />
                적용
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
