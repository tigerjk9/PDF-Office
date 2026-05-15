'use client'

import { FileText, X, CheckCircle2 } from 'lucide-react'

import { cn, formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePdfStore } from '@/lib/store/pdf-store'

/**
 * 업로드된 문서 목록.
 * - 클릭 → 해당 문서를 activeDoc으로 전환.
 * - X 버튼 → removeDocument.
 */
export function FileList() {
  const documents = usePdfStore((s) => s.documents)
  const activeDocId = usePdfStore((s) => s.activeDocId)
  const setActiveDoc = usePdfStore((s) => s.setActiveDoc)
  const removeDocument = usePdfStore((s) => s.removeDocument)

  if (documents.length === 0) {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-1.5 px-4 py-8">
        <p className="text-xs font-medium text-foreground">
          문서가 없습니다
        </p>
        <p className="text-2xs leading-relaxed text-muted-foreground">
          PDF를 끌어다 놓거나 위의 &quot;PDF 추가&quot;로 시작하세요.
        </p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <ul className="p-1.5" role="listbox" aria-label="불러온 문서 목록">
        {documents.map((doc) => {
          const isActive = doc.id === activeDocId
          return (
            <li key={doc.id}>
              <div
                role="option"
                aria-selected={isActive}
                tabIndex={0}
                onClick={() => setActiveDoc(doc.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setActiveDoc(doc.id)
                  }
                }}
                className={cn(
                  'group relative flex w-full cursor-pointer items-center gap-2.5 rounded-md py-2 pl-3 pr-1.5 text-left transition-colors duration-fast',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'bg-primary-soft'
                    : 'hover:bg-muted',
                )}
              >
                {/* 활성 표시: 카드 테두리 대신 좌측 액센트 레일 */}
                {isActive && (
                  <span
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary"
                    aria-hidden
                  />
                )}
                <FileText
                  className={cn(
                    'h-4 w-4 flex-shrink-0',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span
                      className={cn(
                        'truncate text-xs',
                        isActive
                          ? 'font-semibold text-foreground'
                          : 'font-medium text-foreground',
                      )}
                    >
                      {doc.name}
                    </span>
                    {isActive && (
                      <CheckCircle2
                        className="h-3 w-3 flex-shrink-0 text-primary"
                        aria-label="현재 문서"
                      />
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-2xs tabular-nums text-muted-foreground">
                    <span>{doc.pageCount}페이지</span>
                    <span aria-hidden>·</span>
                    <span>{formatBytes(doc.sizeBytes)}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0 text-muted-foreground/70 transition-colors duration-fast hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeDocument(doc.id)
                  }}
                  aria-label={`${doc.name} 제거`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </ScrollArea>
  )
}
