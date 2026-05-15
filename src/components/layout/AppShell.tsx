'use client'

import { useState } from 'react'
import {
  FileText,
  Sparkles,
  AlertCircle,
  X,
  GitMerge,
  PanelLeft,
  LayoutGrid,
  Search,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'
import { usePageDeletion } from '@/hooks/usePageDeletion'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useEncryptedUpload } from '@/hooks/useEncryptedUpload'
import { DropZone } from '@/components/upload/DropZone'
import { FileList } from '@/components/upload/FileList'
import { PasswordDialog } from '@/components/upload/PasswordDialog'
import { PdfViewer } from '@/components/viewer/PdfViewer'
import { ZoomControl } from '@/components/viewer/ZoomControl'
import { SearchPanel } from '@/components/viewer/SearchPanel'
import { PageGrid } from '@/components/pages/PageGrid'
import { EditorToolbar } from '@/components/toolbar/EditorToolbar'
import { ConvertPanel } from '@/components/ai/ConvertPanel'
import { MergeDialog } from '@/components/merge/MergeDialog'

/**
 * 전체 앱 셸.
 *
 * 데스크탑(md 이상): TopBar + 좌측 문서 사이드바 + 페이지 패널 + 메인 뷰어 (3분할).
 * 모바일(md 미만): 사이드바·페이지 패널은 Sheet 드로어로 접고 뷰어를 우선 노출.
 *
 * 전역 단축키(P1-14)와 삭제 확인 + 실행취소 토스트(P1-8)를 이 레벨에서 관장한다.
 */
export function AppShell() {
  const activeDoc = usePdfStore(selectActiveDoc)
  const documents = usePdfStore((s) => s.documents)
  const isLoading = usePdfStore((s) => s.isLoading)
  const loadingMessage = usePdfStore((s) => s.loadingMessage)
  const error = usePdfStore((s) => s.error)
  const clearError = usePdfStore((s) => s.clearError)

  const [aiOpen, setAiOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mobileDocsOpen, setMobileDocsOpen] = useState(false)
  const [mobilePagesOpen, setMobilePagesOpen] = useState(false)

  const canMerge = documents.length >= 2

  // 암호 PDF 비밀번호 재시도 흐름 (P2-8)
  const {
    passwordOpen,
    setPasswordOpen,
    encryptedFileName,
    retryFailed,
    unlocking,
    submitPassword,
  } = useEncryptedUpload()

  // 암호 PDF 에러는 비밀번호 다이얼로그로 흐름을 인계하므로
  // 전역 에러 배너에는 노출하지 않는다(중복 안내 방지).
  const showErrorBanner = !!error && error.code !== 'ENCRYPTED_PDF'

  // 삭제 확인 + 실행취소 토스트 (P1-8)
  const {
    confirmOpen,
    setConfirmOpen,
    pendingIndices,
    requestDelete,
    confirmDelete,
    description: deleteDescription,
  } = usePageDeletion()

  // 전역 키보드 단축키 (P1-14) — 문서 있을 때만 활성
  useKeyboardShortcuts({
    enabled: !!activeDoc,
    onRequestDelete: requestDelete,
  })

  return (
    <TooltipProvider>
      <div className="flex h-screen w-full flex-col bg-gray-50">
        {/* TopBar */}
        <header
          className="flex h-14 flex-shrink-0 items-center justify-between border-b bg-white px-3 shadow-sm sm:px-4"
          role="banner"
        >
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {/* 모바일: 문서 드로어 토글 */}
            {documents.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0 md:hidden"
                onClick={() => setMobileDocsOpen(true)}
                aria-label="문서 목록 열기"
              >
                <PanelLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileText className="h-5 w-5" aria-hidden />
            </div>
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate text-base font-semibold leading-tight">
                PDF Office
              </h1>
              <span className="hidden text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
                브라우저 기반 PDF 편집기
              </span>
            </div>
            {documents.length > 0 && (
              <Badge variant="secondary" className="ml-1 flex-shrink-0">
                문서 {documents.length}개
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {isLoading && (
              <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                <div
                  className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
                  aria-label="처리 중"
                />
                <span>{loadingMessage ?? '처리 중...'}</span>
              </div>
            )}

            {/* 모바일: 페이지 패널 드로어 토글 */}
            {activeDoc && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 md:hidden"
                onClick={() => setMobilePagesOpen(true)}
                aria-label="페이지 목록 열기"
              >
                <LayoutGrid className="h-5 w-5" />
              </Button>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMergeOpen(true)}
                  disabled={!canMerge}
                  aria-label="문서 병합 열기"
                >
                  <GitMerge className="h-4 w-4" />
                  <span className="hidden sm:inline">문서 병합</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {canMerge
                  ? '여러 PDF를 하나로 병합'
                  : '문서를 2개 이상 업로드하면 병합할 수 있습니다'}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={searchOpen ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSearchOpen((o) => !o)}
                  disabled={!activeDoc}
                  aria-label="문서 검색 패널 토글"
                >
                  <Search className="h-4 w-4" />
                  <span className="hidden sm:inline">검색</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>문서에서 텍스트 검색</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={aiOpen ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAiOpen((o) => !o)}
                  disabled={!activeDoc}
                  aria-label="AI 변환 패널 토글"
                >
                  <Sparkles className="h-4 w-4" />
                  <span className="hidden sm:inline">Markdown 변환</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>AI로 PDF를 Markdown으로 변환</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* 에러 배너 (암호 PDF 제외 — 비밀번호 다이얼로그가 처리) */}
        {showErrorBanner && error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          >
            <div className="flex min-w-0 items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="flex-shrink-0 font-medium">{error.code}:</span>
              <span className="truncate">{error.message}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0 text-destructive hover:text-destructive"
              onClick={clearError}
              aria-label="에러 닫기"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* 본문 */}
        <div className="flex min-h-0 flex-1">
          {/* 데스크탑 사이드바 (모바일에서 숨김) */}
          <aside
            className="hidden w-72 flex-shrink-0 flex-col border-r bg-white md:flex"
            aria-label="문서 사이드바"
          >
            <div className="p-3">
              <DropZone variant="compact" />
            </div>
            <Separator />
            <div className="min-h-0 flex-1 overflow-hidden">
              <FileList />
            </div>
          </aside>

          {/* 메인 */}
          <section
            className="flex min-w-0 flex-1 flex-col"
            aria-label="작업 영역"
          >
            {activeDoc ? (
              <>
                <EditorToolbar onRequestDelete={requestDelete} />
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  {/* 데스크탑 페이지 패널 (모바일에서 숨김) */}
                  <div className="hidden w-64 flex-shrink-0 flex-col border-r bg-white md:flex">
                    <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      페이지
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <PageGrid onRequestDelete={requestDelete} />
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

        {/* 모바일: 문서 목록 드로어 */}
        <Sheet open={mobileDocsOpen} onOpenChange={setMobileDocsOpen}>
          <SheetContent
            side="left"
            className="flex w-[85vw] max-w-sm flex-col gap-0 p-0"
          >
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                문서
              </SheetTitle>
            </SheetHeader>
            <div className="p-3">
              <DropZone variant="compact" />
            </div>
            <Separator />
            <div className="min-h-0 flex-1 overflow-hidden">
              <FileList />
            </div>
          </SheetContent>
        </Sheet>

        {/* 모바일: 페이지 패널 드로어 */}
        <Sheet open={mobilePagesOpen} onOpenChange={setMobilePagesOpen}>
          <SheetContent
            side="left"
            className="flex w-[85vw] max-w-sm flex-col gap-0 p-0"
          >
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle className="flex items-center gap-2 text-base">
                <LayoutGrid className="h-4 w-4" />
                페이지
              </SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-hidden">
              <PageGrid onRequestDelete={requestDelete} />
            </div>
          </SheetContent>
        </Sheet>

        {/* AI 시트 */}
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

        {/* 검색 시트 (P2-8) */}
        <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
          <SheetContent
            side="right"
            className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
          >
            <SheetHeader className="border-b px-6 py-4">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4" />
                문서 검색
              </SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-hidden">
              <SearchPanel />
            </div>
          </SheetContent>
        </Sheet>

        {/* 병합 다이얼로그 */}
        <MergeDialog open={mergeOpen} onOpenChange={setMergeOpen} />

        {/* 암호 PDF 비밀번호 다이얼로그 (P2-8) */}
        <PasswordDialog
          open={passwordOpen}
          onOpenChange={setPasswordOpen}
          fileName={encryptedFileName}
          retryFailed={retryFailed}
          unlocking={unlocking}
          onSubmit={submitPassword}
        />

        {/* 삭제 확인 다이얼로그 (P1-8) */}
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onConfirm={confirmDelete}
          title={`${pendingIndices.length}개 페이지를 삭제할까요?`}
          description={deleteDescription}
          confirmLabel="삭제"
          cancelLabel="취소"
          destructive
        />
      </div>
    </TooltipProvider>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center p-6 sm:p-8">
      <div className="w-full max-w-xl">
        <DropZone variant="full" />
      </div>
    </div>
  )
}
