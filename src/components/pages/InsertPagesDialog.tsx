'use client'

import { useEffect, useMemo, useState } from 'react'
import { FilePlus2, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'
import type { DocId, PageIndex } from '@/lib/types'

interface InsertPagesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * "다른 문서 페이지 삽입" 다이얼로그 (P2-5).
 *
 * - 소스 문서 선택 → 해당 문서의 페이지를 다중 선택.
 * - 삽입 위치(atIndex)를 활성 문서 기준 1-based로 입력.
 * - 실행 시 `applyOperation({ type:'insertFrom', ... })` (엔진 동결 계약 소비).
 *
 * 엔진 로직(applyOperation/insert.ts)은 수정 없이 소비만 한다.
 */
export function InsertPagesDialog({
  open,
  onOpenChange,
}: InsertPagesDialogProps) {
  const activeDoc = usePdfStore(selectActiveDoc)
  const documents = usePdfStore((s) => s.documents)
  const applyOperation = usePdfStore((s) => s.applyOperation)

  const [sourceDocId, setSourceDocId] = useState<DocId | null>(null)
  const [picked, setPicked] = useState<PageIndex[]>([])
  // 삽입 위치(1-based 표시): 1 = 맨 앞, pageCount+1 = 맨 뒤
  const [atInput, setAtInput] = useState('1')
  const [submitting, setSubmitting] = useState(false)

  // 활성 문서 외 다른 문서들 (삽입 소스 후보)
  const sourceCandidates = useMemo(
    () => documents.filter((d) => d.id !== activeDoc?.id),
    [documents, activeDoc],
  )

  const sourceDoc = useMemo(
    () => documents.find((d) => d.id === sourceDocId) ?? null,
    [documents, sourceDocId],
  )

  // 다이얼로그 오픈 시 초기화. 소스 후보가 1개면 자동 선택.
  useEffect(() => {
    if (!open) return
    const firstSource = sourceCandidates[0]?.id ?? null
    setSourceDocId(firstSource)
    setPicked([])
    setAtInput(String((activeDoc?.pageCount ?? 0) + 1))
    setSubmitting(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!activeDoc) return null

  const togglePick = (idx: PageIndex) => {
    setPicked((prev) =>
      prev.includes(idx)
        ? prev.filter((i) => i !== idx)
        : [...prev, idx].sort((a, b) => a - b),
    )
  }

  const targetCount = activeDoc.pageCount
  const canRun =
    !!sourceDoc && picked.length > 0 && !submitting

  const handleRun = async () => {
    if (!canRun || !sourceDoc) return
    setSubmitting(true)
    // 1-based 입력 → 0-based atIndex, [0, pageCount] 범위 클램프(맨 뒤=pageCount)
    const parsed = parseInt(atInput, 10)
    const at = Number.isNaN(parsed)
      ? targetCount
      : Math.max(0, Math.min(targetCount, parsed - 1))
    try {
      const result = await applyOperation({
        type: 'insertFrom',
        docId: activeDoc.id,
        sourceDocId: sourceDoc.id,
        sourcePageIndices: [...picked],
        atIndex: at,
      })
      if (result.success) {
        toast.success('페이지를 삽입했습니다', {
          description: `"${sourceDoc.name}"의 ${picked.length}개 페이지를 ${
            at + 1
          }번 위치에 삽입했습니다.`,
        })
        onOpenChange(false)
      } else {
        toast.error('페이지 삽입에 실패했습니다', {
          description:
            result.error?.message ?? '알 수 없는 오류가 발생했습니다.',
        })
      }
    } catch (cause) {
      toast.error('페이지 삽입에 실패했습니다', {
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
      <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="gap-1.5 border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2
              className="h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            다른 문서 페이지 삽입
          </DialogTitle>
          <DialogDescription>
            다른 문서에서 가져올 페이지를 선택하고 현재 문서의 삽입 위치를
            지정하세요.
          </DialogDescription>
        </DialogHeader>

        {sourceCandidates.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            삽입할 다른 문서가 없습니다. 먼저 PDF를 1개 이상 추가하세요.
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-2">
            {/* 소스 문서 선택 */}
            <div className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
              <div className="flex h-10 items-center px-4 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                소스 문서
              </div>
              <Separator />
              <ScrollArea className="min-h-0 flex-1">
                <ul className="space-y-1 p-2.5">
                  {sourceCandidates.map((doc) => (
                    <li key={doc.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSourceDocId(doc.id)
                          setPicked([])
                        }}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors duration-fast',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          doc.id === sourceDocId
                            ? 'bg-primary-soft'
                            : 'hover:bg-muted',
                        )}
                        aria-pressed={doc.id === sourceDocId}
                      >
                        <FileText
                          className={cn(
                            'h-4 w-4 flex-shrink-0',
                            doc.id === sourceDocId
                              ? 'text-primary'
                              : 'text-muted-foreground',
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">
                            {doc.name}
                          </div>
                          <div className="mt-0.5 text-2xs tabular-nums text-muted-foreground">
                            {doc.pageCount}p
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>

            {/* 소스 문서의 페이지 선택 */}
            <div className="flex min-h-0 flex-col">
              <div className="flex h-10 items-center justify-between px-4">
                <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  삽입할 페이지
                </span>
                <Badge variant="default">{picked.length}개 선택</Badge>
              </div>
              <Separator />
              <ScrollArea className="min-h-0 flex-1">
                {sourceDoc ? (
                  <div className="grid grid-cols-4 gap-2 p-2.5">
                    {sourceDoc.pages.map((p) => {
                      const sel = picked.includes(p.index)
                      const ratio =
                        p.width > 0 && p.height > 0
                          ? `${p.width} / ${p.height}`
                          : '3 / 4'
                      return (
                        <button
                          key={p.index}
                          type="button"
                          onClick={() => togglePick(p.index)}
                          style={{ aspectRatio: ratio }}
                          className={cn(
                            'relative flex items-center justify-center overflow-hidden rounded-md border bg-background text-2xs transition-[border-color,box-shadow] duration-fast',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            sel
                              ? 'border-primary ring-2 ring-primary ring-offset-1 ring-offset-background'
                              : 'border-border hover:border-border-strong',
                          )}
                          aria-pressed={sel}
                          aria-label={`${p.index + 1}페이지 ${
                            sel ? '선택 해제' : '선택'
                          }`}
                        >
                          {p.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.thumbnail}
                              alt={`${p.index + 1}페이지`}
                              className="media-fade h-full w-full object-contain"
                              draggable={false}
                            />
                          ) : (
                            <span
                              className="skeleton-shimmer h-full w-full"
                              aria-hidden
                            />
                          )}
                          <span
                            className={cn(
                              'absolute bottom-0.5 left-0.5 rounded-[3px] px-1 py-px text-[9px] font-medium tabular-nums',
                              sel
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-foreground/65 text-background',
                            )}
                          >
                            {p.index + 1}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                    왼쪽에서 소스 문서를 선택하세요.
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        )}

        <Separator />

        <DialogFooter className="flex-col gap-3 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex w-full flex-col gap-1 sm:max-w-[200px]">
            <label
              htmlFor="insert-at-position"
              className="text-2xs font-medium text-muted-foreground"
            >
              삽입 위치 (1 ~ {targetCount + 1})
            </label>
            <input
              id="insert-at-position"
              type="text"
              inputMode="numeric"
              value={atInput}
              onChange={(e) =>
                setAtInput(e.target.value.replace(/[^0-9]/g, ''))
              }
              placeholder={String(targetCount + 1)}
              className="h-8 rounded-md border border-input bg-background px-3 text-xs tabular-nums transition-colors placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="삽입 위치 (현재 문서 기준 페이지 번호)"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleRun}
              disabled={!canRun}
              aria-label="선택한 페이지 삽입"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  삽입 중...
                </>
              ) : (
                <>
                  <FilePlus2 className="h-4 w-4" />
                  삽입
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
        {sourceCandidates.length > 0 && picked.length === 0 && (
          <p
            className="border-t border-border bg-muted/40 px-5 py-2.5 text-2xs text-muted-foreground"
            role="note"
          >
            삽입할 페이지를 1개 이상 선택하세요.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
