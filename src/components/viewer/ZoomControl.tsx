'use client'

import { useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MoveHorizontal,
  ScrollText,
  FileText,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4.0
const ZOOM_STEP = 0.1

/**
 * 뷰어 상단 컨트롤바.
 * - 페이지 ◀ [입력 N] / total ▶  (직접 입력 후 Enter로 이동 — P1-14)
 * - 줌 - / slider / + / 너비맞춤 / 페이지맞춤
 */
export function ZoomControl() {
  const activeDoc = usePdfStore(selectActiveDoc)
  const currentPageIndex = usePdfStore((s) => s.viewer.currentPageIndex)
  const zoom = usePdfStore((s) => s.viewer.zoom)
  const fitMode = usePdfStore((s) => s.viewer.fitMode)
  const setCurrentPage = usePdfStore((s) => s.setCurrentPage)
  const setZoom = usePdfStore((s) => s.setZoom)
  const setFitMode = usePdfStore((s) => s.setFitMode)
  const viewMode = usePdfStore((s) => s.viewer.viewMode)
  const setViewMode = usePdfStore((s) => s.setViewMode)

  // 페이지 입력 임시값 (포커스 중 자유 입력, blur/Enter 시 커밋)
  const [pageInput, setPageInput] = useState(String(currentPageIndex + 1))

  // 외부에서 페이지가 바뀌면(키보드/썸네일) 입력값 동기화
  useEffect(() => {
    setPageInput(String(currentPageIndex + 1))
  }, [currentPageIndex])

  if (!activeDoc) return null

  const pageCount = activeDoc.pageCount
  const goPrev = () => setCurrentPage(Math.max(0, currentPageIndex - 1))
  const goNext = () =>
    setCurrentPage(Math.min(pageCount - 1, currentPageIndex + 1))
  const decZoom = () =>
    setZoom(Math.max(MIN_ZOOM, +(zoom - ZOOM_STEP).toFixed(2)))
  const incZoom = () =>
    setZoom(Math.min(MAX_ZOOM, +(zoom + ZOOM_STEP).toFixed(2)))

  const zoomPct = Math.round(zoom * 100)

  const commitPageInput = () => {
    const parsed = parseInt(pageInput, 10)
    if (Number.isNaN(parsed)) {
      // 잘못된 입력 → 현재 페이지로 복구
      setPageInput(String(currentPageIndex + 1))
      return
    }
    // 1-based 입력 → 0-based, 범위 클램프
    const clamped = Math.max(0, Math.min(pageCount - 1, parsed - 1))
    setCurrentPage(clamped)
    setPageInput(String(clamped + 1))
  }

  return (
    <div
      className="flex h-10 flex-shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-background px-2.5"
      role="toolbar"
      aria-label="뷰어 컨트롤"
    >
      {/* 페이지 네비게이션 */}
      <div className="flex flex-shrink-0 items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={goPrev}
              disabled={currentPageIndex === 0}
              aria-label="이전 페이지"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>이전 페이지</TooltipContent>
        </Tooltip>

        {/* 페이지 직접 입력 (P1-14) */}
        <div className="flex select-none items-center gap-1 px-1 text-xs text-muted-foreground">
          <input
            type="text"
            inputMode="numeric"
            value={pageInput}
            onChange={(e) =>
              setPageInput(e.target.value.replace(/[^0-9]/g, ''))
            }
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commitPageInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitPageInput()
                e.currentTarget.blur()
              }
              if (e.key === 'Escape') {
                setPageInput(String(currentPageIndex + 1))
                e.currentTarget.blur()
              }
            }}
            aria-label={`현재 페이지 (전체 ${pageCount}페이지)`}
            className="h-7 w-9 rounded-md border border-input bg-background text-center text-xs tabular-nums text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="tabular-nums text-muted-foreground">
            / {pageCount}
          </span>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={goNext}
              disabled={currentPageIndex >= pageCount - 1}
              aria-label="다음 페이지"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>다음 페이지</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-4 flex-shrink-0" />

      {/* 줌 컨트롤 */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={decZoom}
              disabled={zoom <= MIN_ZOOM}
              aria-label="축소"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>축소</TooltipContent>
        </Tooltip>

        <div className="flex w-24 flex-shrink-0 items-center sm:w-36">
          <Slider
            value={[zoom]}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            onValueChange={([v]) => setZoom(v)}
            aria-label="확대/축소 비율"
          />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={incZoom}
              disabled={zoom >= MAX_ZOOM}
              aria-label="확대"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>확대</TooltipContent>
        </Tooltip>

        <span className="w-11 flex-shrink-0 select-none text-right text-xs tabular-nums text-muted-foreground">
          {zoomPct}%
        </span>
      </div>

      <Separator orientation="vertical" className="h-4 flex-shrink-0" />

      {/* 보기 모드 (Phase 2에서 2페이지 추가) */}
      <div
        className="flex flex-shrink-0 items-center gap-0.5"
        role="group"
        aria-label="보기 모드"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={viewMode === 'continuous' ? 'default' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode('continuous')}
              aria-label="연속 스크롤 보기"
              aria-pressed={viewMode === 'continuous'}
            >
              <ScrollText className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>연속 스크롤 보기</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={viewMode === 'single' ? 'default' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode('single')}
              aria-label="한 페이지씩 보기"
              aria-pressed={viewMode === 'single'}
            >
              <FileText className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>한 페이지씩 보기</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-4 flex-shrink-0" />

      {/* 맞춤 모드 */}
      <div className="flex flex-shrink-0 items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={fitMode === 'fit-width' ? 'default' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() =>
                setFitMode(fitMode === 'fit-width' ? null : 'fit-width')
              }
              aria-label="너비 맞춤"
              aria-pressed={fitMode === 'fit-width'}
            >
              <MoveHorizontal className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>너비 맞춤</TooltipContent>
        </Tooltip>
        {viewMode === 'single' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={fitMode === 'fit-page' ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() =>
                  setFitMode(fitMode === 'fit-page' ? null : 'fit-page')
                }
                aria-label="페이지 맞춤"
                aria-pressed={fitMode === 'fit-page'}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>페이지 맞춤</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
