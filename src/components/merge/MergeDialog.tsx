'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  GitMerge,
  ArrowUp,
  ArrowDown,
  X,
  Plus,
  FileText,
  Loader2,
} from 'lucide-react'
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
import { cn, formatBytes } from '@/lib/utils'
import { usePdfStore } from '@/lib/store/pdf-store'
import { useMerge } from '@/hooks/useMerge'

interface MergeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * 문서 병합 다이얼로그.
 *
 * - 업로드된 문서 중 병합 대상을 추가/제거한다.
 * - 병합 리스트의 순서를 위/아래 버튼으로 조정한다 (= 결과 페이지 순서).
 * - "병합 실행" 시 useMerge.runMerge 로 새 병합 문서를 만들고 activeDoc 으로 전환.
 *
 * 백엔드 병합 로직(useMerge / store.applyOperation)은 그대로 소비만 한다.
 */
export function MergeDialog({ open, onOpenChange }: MergeDialogProps) {
  const documents = usePdfStore((s) => s.documents)
  const {
    mergeList,
    addToMerge,
    removeFromMerge,
    reorderMerge,
    setMergeList,
    runMerge,
    isLoading,
  } = useMerge()

  const [outputName, setOutputName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 다이얼로그가 열릴 때, 비어 있으면 전체 문서를 기본 병합 대상으로 미리 채운다.
  useEffect(() => {
    if (open && mergeList.length === 0 && documents.length >= 2) {
      setMergeList(documents.map((d) => d.id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 닫힐 때 출력 파일명 입력 초기화
  useEffect(() => {
    if (!open) setOutputName('')
  }, [open])

  const docById = useMemo(() => {
    const map = new Map(documents.map((d) => [d.id, d]))
    return map
  }, [documents])

  // 병합 리스트에 포함된 문서 (순서 보존)
  const selectedDocs = useMemo(
    () => mergeList.map((id) => docById.get(id)).filter((d) => d != null),
    [mergeList, docById],
  )

  // 아직 병합 리스트에 없는 문서
  const availableDocs = useMemo(
    () => documents.filter((d) => !mergeList.includes(d.id)),
    [documents, mergeList],
  )

  const totalPages = useMemo(
    () => selectedDocs.reduce((sum, d) => sum + d.pageCount, 0),
    [selectedDocs],
  )

  const canRun = mergeList.length >= 2 && !submitting && !isLoading

  const handleRun = async () => {
    if (!canRun) return
    setSubmitting(true)
    try {
      const trimmed = outputName.trim()
      const result = await runMerge(trimmed.length > 0 ? trimmed : undefined)
      if (result && result.success) {
        toast.success('병합이 완료되었습니다', {
          description: `${selectedDocs.length}개 문서 · 총 ${totalPages}페이지로 병합되어 새 문서로 전환되었습니다.`,
        })
        onOpenChange(false)
      } else {
        const message =
          result?.error?.message ?? '알 수 없는 오류로 병합에 실패했습니다.'
        toast.error('병합 실패', { description: message })
      }
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : '병합 중 예기치 못한 오류가 발생했습니다.'
      toast.error('병합 실패', { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <GitMerge className="h-4 w-4" aria-hidden />
            문서 병합
          </DialogTitle>
          <DialogDescription>
            병합할 문서를 선택하고 순서를 조정하세요. 위에서 아래 순서대로 페이지가 이어집니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-2">
          {/* 병합 대상 (순서 = 결과 순서) */}
          <div className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                병합 순서
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {selectedDocs.length}개 · {totalPages}p
              </Badge>
            </div>
            <Separator />
            <ScrollArea className="min-h-0 flex-1">
              {selectedDocs.length === 0 ? (
                <div className="px-5 py-10 text-center text-xs text-muted-foreground">
                  오른쪽 목록에서 병합할 문서를 추가하세요.
                </div>
              ) : (
                <ol className="space-y-1.5 p-3">
                  {selectedDocs.map((doc, idx) => (
                    <li
                      key={doc.id}
                      className="flex items-center gap-2 rounded-md border bg-white px-2 py-2 text-xs"
                    >
                      <span
                        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-primary text-[10px] font-semibold text-primary-foreground"
                        aria-hidden
                      >
                        {idx + 1}
                      </span>
                      <FileText
                        className="h-4 w-4 flex-shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-foreground">
                          {doc.name}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {doc.pageCount}p · {formatBytes(doc.sizeBytes)}
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={idx === 0}
                          onClick={() => reorderMerge(idx, idx - 1)}
                          aria-label={`${doc.name} 위로 이동`}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={idx === selectedDocs.length - 1}
                          onClick={() => reorderMerge(idx, idx + 1)}
                          aria-label={`${doc.name} 아래로 이동`}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => removeFromMerge(doc.id)}
                          aria-label={`${doc.name} 병합 목록에서 제거`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </ScrollArea>
          </div>

          {/* 추가 가능한 문서 */}
          <div className="flex min-h-0 flex-col">
            <div className="px-5 py-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                추가 가능한 문서
              </span>
            </div>
            <Separator />
            <ScrollArea className="min-h-0 flex-1">
              {availableDocs.length === 0 ? (
                <div className="px-5 py-10 text-center text-xs text-muted-foreground">
                  모든 문서가 병합 목록에 포함되었습니다.
                </div>
              ) : (
                <ul className="space-y-1.5 p-3">
                  {availableDocs.map((doc) => (
                    <li key={doc.id}>
                      <button
                        type="button"
                        onClick={() => addToMerge(doc.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left text-xs transition-colors',
                          'hover:border-border hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                        aria-label={`${doc.name} 병합 목록에 추가`}
                      >
                        <FileText
                          className="h-4 w-4 flex-shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">
                            {doc.name}
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {doc.pageCount}p · {formatBytes(doc.sizeBytes)}
                          </div>
                        </div>
                        <Plus className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
        </div>

        <Separator />

        <DialogFooter className="flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full flex-col gap-1 sm:max-w-xs">
            <label
              htmlFor="merge-output-name"
              className="text-[11px] font-medium text-muted-foreground"
            >
              출력 파일명 (선택)
            </label>
            <input
              id="merge-output-name"
              type="text"
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              placeholder="merged.pdf"
              className="h-9 rounded-md border border-input bg-background px-3 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting || isLoading}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleRun}
              disabled={!canRun}
              aria-label="병합 실행"
            >
              {submitting || isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  병합 중...
                </>
              ) : (
                <>
                  <GitMerge className="h-4 w-4" />
                  병합 실행
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
        {mergeList.length < 2 && (
          <p
            className="px-6 pb-4 text-[11px] text-muted-foreground"
            role="note"
          >
            병합하려면 2개 이상의 문서를 목록에 추가하세요.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
