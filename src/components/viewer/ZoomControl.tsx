'use client'

import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, MoveHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'
import { cn } from '@/lib/utils'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4.0
const ZOOM_STEP = 0.1

/**
 * 뷰어 상단 컨트롤바.
 * - 페이지 ◀ N / total ▶
 * - 줌 - / slider / + / fit-width / fit-page
 */
export function ZoomControl() {
  const activeDoc = usePdfStore(selectActiveDoc)
  const currentPageIndex = usePdfStore((s) => s.viewer.currentPageIndex)
  const zoom = usePdfStore((s) => s.viewer.zoom)
  const fitMode = usePdfStore((s) => s.viewer.fitMode)
  const setCurrentPage = usePdfStore((s) => s.setCurrentPage)
  const setZoom = usePdfStore((s) => s.setZoom)
  const setFitMode = usePdfStore((s) => s.setFitMode)

  if (!activeDoc) return null

  const pageCount = activeDoc.pageCount
  const goPrev = () => setCurrentPage(Math.max(0, currentPageIndex - 1))
  const goNext = () => setCurrentPage(Math.min(pageCount - 1, currentPageIndex + 1))
  const decZoom = () => setZoom(Math.max(MIN_ZOOM, +(zoom - ZOOM_STEP).toFixed(2)))
  const incZoom = () => setZoom(Math.min(MAX_ZOOM, +(zoom + ZOOM_STEP).toFixed(2)))

  const zoomPct = Math.round(zoom * 100)

  return (
    <div
      className="flex h-11 flex-shrink-0 items-center gap-2 border-b bg-white px-3"
      role="toolbar"
      aria-label="Viewer controls"
    >
      {/* 페이지 네비게이션 */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={goPrev}
              disabled={currentPageIndex === 0}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Previous page</TooltipContent>
        </Tooltip>
        <span
          className="select-none px-2 text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {currentPageIndex + 1} / {pageCount}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={goNext}
              disabled={currentPageIndex >= pageCount - 1}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Next page</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* 줌 컨트롤 */}
      <div className="flex flex-1 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={decZoom}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>

        <div className="flex w-40 items-center">
          <Slider
            value={[zoom]}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            onValueChange={([v]) => setZoom(v)}
            aria-label="Zoom level"
          />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={incZoom}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>

        <span className="w-12 select-none text-center text-xs tabular-nums text-muted-foreground">
          {zoomPct}%
        </span>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* Fit modes */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={fitMode === 'fit-width' ? 'secondary' : 'ghost'}
              size="icon"
              className={cn('h-7 w-7')}
              onClick={() => setFitMode(fitMode === 'fit-width' ? null : 'fit-width')}
              aria-label="Fit to width"
              aria-pressed={fitMode === 'fit-width'}
            >
              <MoveHorizontal className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fit width</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={fitMode === 'fit-page' ? 'secondary' : 'ghost'}
              size="icon"
              className={cn('h-7 w-7')}
              onClick={() => setFitMode(fitMode === 'fit-page' ? null : 'fit-page')}
              aria-label="Fit page"
              aria-pressed={fitMode === 'fit-page'}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fit page</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
