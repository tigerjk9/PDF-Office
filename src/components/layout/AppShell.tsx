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
  HelpCircle,
  RotateCcw,
  ShieldCheck,
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
import { HelpSheet } from '@/components/help/HelpSheet'
import { AppFooter } from '@/components/layout/AppFooter'
import { PanelResizer } from '@/components/layout/PanelResizer'
import { usePanelWidth } from '@/hooks/usePanelWidth'

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
  const reset = usePdfStore((s) => s.reset)

  const [aiOpen, setAiOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [mobileDocsOpen, setMobileDocsOpen] = useState(false)
  const [mobilePagesOpen, setMobilePagesOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  const canMerge = documents.length >= 2

  // 페이지 패널 폭(데스크탑) — 드래그 리사이즈 + localStorage 영속
  const { width: pagesPanelWidth, setWidth: setPagesPanelWidth } =
    usePanelWidth('pdf-office-pages-panel-w', 248, 180, 420)

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
      <div className="flex h-screen w-full flex-col bg-canvas">
        {/* TopBar — 밀도 높고 자신감 있는 도구 헤더, 좌측 정렬 */}
        <header
          className="flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-background pl-2.5 pr-3"
          role="banner"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            {/* 모바일: 문서 드로어 토글 */}
            {documents.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="flex-shrink-0 md:hidden"
                onClick={() => setMobileDocsOpen(true)}
                aria-label="문서 목록 열기"
              >
                <PanelLeft className="h-[18px] w-[18px]" />
              </Button>
            )}
            <div className="flex items-center gap-2">
              <span
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[7px] bg-primary text-primary-foreground"
                aria-hidden
              >
                <FileText className="h-3.5 w-3.5" />
              </span>
              <h1 className="text-sm font-semibold tracking-[-0.014em] text-foreground">
                PDF&nbsp;Office
              </h1>
            </div>
            {documents.length > 0 && (
              <>
                <span
                  className="hidden h-4 w-px bg-border sm:block"
                  aria-hidden
                />
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  문서{' '}
                  <span className="font-medium text-foreground tabular-nums">
                    {documents.length}
                  </span>
                  개
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {isLoading && (
              <div
                className="mr-1 hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"
                aria-live="polite"
              >
                <span
                  className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-primary border-t-transparent"
                  aria-hidden
                />
                <span className="max-w-[14rem] truncate">
                  {loadingMessage ?? '처리 중…'}
                </span>
              </div>
            )}

            {/* 모바일: 페이지 패널 드로어 토글 */}
            {activeDoc && (
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobilePagesOpen(true)}
                aria-label="페이지 목록 열기"
              >
                <LayoutGrid className="h-[18px] w-[18px]" />
              </Button>
            )}

            {documents.length > 0 && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setResetOpen(true)}
                      aria-label="모든 문서 초기화"
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span className="hidden sm:inline">초기화</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    업로드한 모든 PDF·편집 내역 삭제 후 처음 화면으로
                  </TooltipContent>
                </Tooltip>
                <span
                  className="hidden h-4 w-px bg-border sm:block"
                  aria-hidden
                />
              </>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setHelpOpen(true)}
                  aria-label="사용 방법 안내 열기"
                >
                  <HelpCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">사용 방법</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>서비스 사용 방법 안내</TooltipContent>
            </Tooltip>
            <span
              className="hidden h-4 w-px bg-border sm:block"
              aria-hidden
            />
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
                  <span className="hidden sm:inline">병합</span>
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
                  variant={searchOpen ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSearchOpen((o) => !o)}
                  disabled={!activeDoc}
                  aria-label="문서 검색 패널 토글"
                  aria-pressed={searchOpen}
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
                  aria-pressed={aiOpen}
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
            className="flex animate-fade-in items-center justify-between gap-3 border-b border-destructive-soft-border bg-destructive-soft px-4 py-2 text-sm text-destructive"
          >
            <div className="flex min-w-0 items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
              <span className="flex-shrink-0 font-medium">{error.code}</span>
              <span
                className="h-3 w-px flex-shrink-0 bg-destructive/30"
                aria-hidden
              />
              <span className="truncate text-destructive/90">
                {error.message}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={clearError}
              aria-label="에러 닫기"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* 본문 — 패널은 카드가 아닌 구획·구분선·여백으로 위계 */}
        <div className="flex min-h-0 flex-1">
          {/* 데스크탑 사이드바 (모바일에서 숨김) */}
          <aside
            className="hidden w-[17rem] flex-shrink-0 flex-col border-r border-border bg-background md:flex"
            aria-label="문서 사이드바"
          >
            <div className="flex h-9 flex-shrink-0 items-center px-3 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              문서
            </div>
            <Separator />
            <div className="p-2.5">
              <DropZone variant="compact" />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden border-t border-border">
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
                  <div
                    className="relative hidden flex-shrink-0 flex-col border-r border-border bg-background md:flex"
                    style={{ width: pagesPanelWidth }}
                  >
                    <div className="flex h-9 flex-shrink-0 items-center justify-between px-3">
                      <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        페이지
                      </span>
                      <span className="text-2xs tabular-nums text-muted-foreground">
                        {activeDoc.pageCount}
                      </span>
                    </div>
                    <Separator />
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <PageGrid onRequestDelete={requestDelete} />
                    </div>
                    <PanelResizer
                      width={pagesPanelWidth}
                      min={180}
                      max={420}
                      onWidthChange={setPagesPanelWidth}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <ZoomControl />
                    <div className="min-h-0 flex-1 overflow-hidden bg-canvas">
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
            className="w-[86vw] max-w-sm gap-0 p-0"
            aria-describedby={undefined}
          >
            <SheetHeader className="flex h-12 flex-row items-center gap-2 border-b border-border px-4">
              <FileText
                className="h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <SheetTitle>문서</SheetTitle>
            </SheetHeader>
            <div className="p-2.5">
              <DropZone variant="compact" />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden border-t border-border">
              <FileList />
            </div>
          </SheetContent>
        </Sheet>

        {/* 모바일: 페이지 패널 드로어 */}
        <Sheet open={mobilePagesOpen} onOpenChange={setMobilePagesOpen}>
          <SheetContent
            side="left"
            className="w-[86vw] max-w-sm gap-0 p-0"
            aria-describedby={undefined}
          >
            <SheetHeader className="flex h-12 flex-row items-center gap-2 border-b border-border px-4">
              <LayoutGrid
                className="h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <SheetTitle>페이지</SheetTitle>
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
            className="w-full gap-0 p-0 sm:max-w-xl"
            aria-describedby={undefined}
          >
            <SheetHeader className="flex h-12 flex-row items-center gap-2 border-b border-border px-5">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
              <SheetTitle>PDF → Markdown 변환</SheetTitle>
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
            className="w-full gap-0 p-0 sm:max-w-md"
            aria-describedby={undefined}
          >
            <SheetHeader className="flex h-12 flex-row items-center gap-2 border-b border-border px-5">
              <Search
                className="h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <SheetTitle>문서 검색</SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-hidden">
              <SearchPanel />
            </div>
          </SheetContent>
        </Sheet>

        {/* 사용 방법 안내 시트 (R3-1) */}
        <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} />

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

        {/* 전체 문서 초기화 확인 다이얼로그 */}
        <ConfirmDialog
          open={resetOpen}
          onOpenChange={setResetOpen}
          onConfirm={reset}
          title="모든 문서를 초기화할까요?"
          description="업로드한 모든 PDF와 편집 내역이 삭제되고 처음 화면으로 돌아갑니다. 이 작업은 되돌릴 수 없습니다."
          confirmLabel="초기화"
          cancelLabel="취소"
          destructive
        />
      </div>
    </TooltipProvider>
  )
}

/**
 * 빈 상태 — 전체 중앙정렬(AI 슬롭) 대신 좌측 정렬·비대칭 구성.
 * 인터페이스를 가르치는 빈 상태: 무엇을 할 수 있는지 단계로 안내한다.
 */
function EmptyState() {
  const steps = [
    {
      n: '01',
      t: '업로드',
      d: 'PDF를 끌어다 놓거나 선택하면 즉시 브라우저에서 열립니다.',
    },
    {
      n: '02',
      t: '편집',
      d: '페이지 삭제·회전·재정렬, 추출·삽입·워터마크·검색.',
    },
    {
      n: '03',
      t: '병합 · 변환',
      d: '여러 PDF를 하나로 병합하거나 AI로 Markdown 변환.',
    },
  ]
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="reveal-group mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-10 sm:px-10">
        <header
          className="reveal relative flex flex-col gap-5 pl-5"
          style={{ ['--i' as string]: 0 }}
        >
          {/* 좌측 액센트 레일 — FileList 활성 표시와 동일 모티프(브랜드 일관성) */}
          <span
            className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-primary"
            aria-hidden
          />
          <p className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.16em] text-primary">
            <span
              className="inline-block h-1 w-1 flex-shrink-0 rounded-full bg-primary"
              aria-hidden
            />
            브라우저에서 완결되는 PDF 작업
          </p>
          <h2 className="max-w-[20ch] break-keep text-[clamp(2rem,4.6vw,3.25rem)] font-bold leading-[1.08] tracking-[-0.03em] text-foreground">
            PDF를 열고, 다듬고,{' '}
            <span className="text-primary">변환</span>하세요.
          </h2>
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background py-1.5 pl-2.5 pr-3.5 text-xs leading-none text-muted-foreground">
            <ShieldCheck
              className="h-3.5 w-3.5 flex-shrink-0 text-primary"
              aria-hidden
            />
            <span>
              모든 처리는 브라우저 안에서만 —{' '}
              <span className="font-semibold text-foreground">
                파일은 서버로 전송되지 않습니다
              </span>
            </span>
          </p>
        </header>

        <div
          className="reveal"
          style={{ ['--i' as string]: 1 }}
        >
          <DropZone variant="full" />
        </div>

        <ul className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s.n}
              className="reveal flex flex-col gap-2 bg-background p-5"
              style={{ ['--i' as string]: 2 + i }}
            >
              <span className="text-2xs font-semibold tabular-nums tracking-[0.1em] text-primary">
                {s.n}
              </span>
              <span className="text-lg font-semibold tracking-[-0.01em] text-foreground">
                {s.t}
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground">
                {s.d}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {/* 푸터 (R3-3) — 빈 상태 화면 하단, 3분할 작업 레이아웃 비간섭 */}
      <AppFooter />
    </div>
  )
}
