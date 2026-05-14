'use client'

import { FileText, X, CheckCircle2 } from 'lucide-react'

import { cn, formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
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
      <div className="flex h-full items-center justify-center px-6 py-8 text-center text-xs text-muted-foreground">
        No documents yet. Drop a PDF or click "Add PDF" above.
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <ul className="space-y-1 p-2" role="listbox" aria-label="Loaded documents">
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
                  'group flex w-full cursor-pointer items-start gap-2 rounded-md border px-2 py-2 text-left text-xs transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-transparent hover:bg-accent',
                )}
              >
                <div
                  className={cn(
                    'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-gray-100 text-gray-500',
                  )}
                >
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-xs font-medium text-foreground">
                      {doc.name}
                    </span>
                    {isActive && (
                      <CheckCircle2
                        className="h-3 w-3 flex-shrink-0 text-primary"
                        aria-label="active"
                      />
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="h-4 px-1 py-0 text-[10px]">
                      {doc.pageCount}p
                    </Badge>
                    <span>{formatBytes(doc.sizeBytes)}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeDocument(doc.id)
                  }}
                  aria-label={`Remove ${doc.name}`}
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
