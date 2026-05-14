'use client'

import { useState } from 'react'
import { FileText, Sparkles, AlertCircle, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'
import { DropZone } from '@/components/upload/DropZone'
import { FileList } from '@/components/upload/FileList'
import { PdfViewer } from '@/components/viewer/PdfViewer'
import { ZoomControl } from '@/components/viewer/ZoomControl'
import { PageGrid } from '@/components/pages/PageGrid'
import { EditorToolbar } from '@/components/toolbar/EditorToolbar'
import { ConvertPanel } from '@/components/ai/ConvertPanel'

/**
 * 전체 앱 셸. 세 영역으로 구성:
 *  - TopBar: 로고/제목, AI 변환 토글, 에러 표시
 *  - Sidebar (좌): DropZone + FileList
 *  - Main (우): EditorToolbar + (PdfViewer + PageGrid)
 *
 * 자식 컴포넌트들은 각자 usePdfStore 훅으로 상태를 직접 구독한다.
 */
export function AppShell() {
  const activeDoc = usePdfStore(selectActiveDoc)
  const documents = usePdfStore((s) => s.documents)
  const isLoading = usePdfStore((s) => s.isLoading)
  const loadingMessage = usePdfStore((s) => s.loadingMessage)
  const error = usePdfStore((s) => s.error)
  const clearError = usePdfStore((s) => s.clearError)

  const [aiOpen, setAiOpen] = useState(false)

  return (
    <TooltipProvider>
      <div className="flex h-screen w-full flex-col bg-gray-50">
        {/* TopBar */}
        <header
          className="flex h-14 flex-shrink-0 items-center justify-between border-b bg-white px-4 shadow-sm"
          role="banner"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileText className="h-5 w-5" aria-hidden />
            </div>
            <div className="flex flex-col">
              <h1 className="text-base font-semibold leading-tight">PDF Office</h1>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Browser-first editor
              </span>
            </div>
            {documents.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {documents.length} doc{documents.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div
                  className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
                  aria-label="loading"
                />
                <span>{loadingMessage ?? 'Working...'}</span>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={aiOpen ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAiOpen((o) => !o)}
                  disabled={!activeDoc}
                  aria-label="Toggle AI conversion panel"
                >
                  <Sparkles className="h-4 w-4" />
                  <span className="hidden sm:inline">Convert to MD</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Convert PDF to Markdown via AI</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="font-medium">{error.code}:</span>
              <span>{error.message}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={clearError}
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <aside
            className="flex w-72 flex-shrink-0 flex-col border-r bg-white"
            aria-label="Documents sidebar"
          >
            <div className="p-3">
              <DropZone variant="compact" />
            </div>
            <Separator />
            <div className="min-h-0 flex-1 overflow-hidden">
              <FileList />
            </div>
          </aside>

          {/* Main */}
          <section className="flex min-w-0 flex-1 flex-col" aria-label="Workspace">
            {activeDoc ? (
              <>
                <EditorToolbar />
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  <div className="flex w-64 flex-shrink-0 flex-col border-r bg-white">
                    <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Pages
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <PageGrid />
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <ZoomControl />
                    <div className="min-h-0 flex-1 overflow-hidden bg-gray-100">
                      <PdfViewer />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState />
            )}
          </section>
        </div>

        {/* AI Sheet */}
        <Sheet open={aiOpen} onOpenChange={setAiOpen}>
          <SheetContent
            side="right"
            className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
          >
            <SheetHeader className="border-b px-6 py-4">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" />
                AI: PDF → Markdown
              </SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-hidden">
              <ConvertPanel />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-xl">
        <DropZone variant="full" />
      </div>
    </div>
  )
}
