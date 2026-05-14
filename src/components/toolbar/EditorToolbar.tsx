'use client'

import {
  Trash2,
  RotateCw,
  MoveUp,
  MoveDown,
  Download,
  ChevronsUp,
  ChevronsDown,
  GitMerge,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageManager } from '@/hooks/usePageManager'
import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'

export function EditorToolbar() {
  const activeDoc = usePdfStore(selectActiveDoc)
  const documents = usePdfStore((s) => s.documents)
  const {
    selectedPages,
    hasSelection,
    pageCount,
    deleteSelected,
    rotatePage,
    movePage,
    exportActive,
  } = usePageManager()

  if (!activeDoc) return null

  const firstSelected = selectedPages[0] ?? -1
  const lastSelected = selectedPages[selectedPages.length - 1] ?? -1
  const canMoveUp = hasSelection && firstSelected > 0
  const canMoveDown = hasSelection && lastSelected < pageCount - 1

  const handleMoveUp = () => {
    if (selectedPages.length === 1) void movePage(firstSelected, firstSelected - 1)
  }
  const handleMoveDown = () => {
    if (selectedPages.length === 1) void movePage(firstSelected, firstSelected + 1)
  }
  const handleMoveTop = () => {
    if (selectedPages.length === 1) void movePage(firstSelected, 0)
  }
  const handleMoveBottom = () => {
    if (selectedPages.length === 1) void movePage(firstSelected, pageCount - 1)
  }
  const handleRotate = () => {
    if (selectedPages.length === 1) void rotatePage(firstSelected, 90)
  }
  const handleDelete = () => void deleteSelected()
  const handleExport = () => void exportActive()

  const singleSelected = selectedPages.length === 1

  return (
    <div
      className="flex h-11 flex-shrink-0 items-center gap-1 border-b bg-white px-3"
      role="toolbar"
      aria-label="Page editor toolbar"
    >
      {/* 이동 버튼 (단일 선택만) */}
      <ToolbarButton
        icon={<ChevronsUp className="h-4 w-4" />}
        label="Move to top"
        onClick={handleMoveTop}
        disabled={!singleSelected || !canMoveUp}
      />
      <ToolbarButton
        icon={<MoveUp className="h-4 w-4" />}
        label="Move up"
        onClick={handleMoveUp}
        disabled={!singleSelected || !canMoveUp}
      />
      <ToolbarButton
        icon={<MoveDown className="h-4 w-4" />}
        label="Move down"
        onClick={handleMoveDown}
        disabled={!singleSelected || !canMoveDown}
      />
      <ToolbarButton
        icon={<ChevronsDown className="h-4 w-4" />}
        label="Move to bottom"
        onClick={handleMoveBottom}
        disabled={!singleSelected || !canMoveDown}
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* 회전 (단일 선택) */}
      <ToolbarButton
        icon={<RotateCw className="h-4 w-4" />}
        label="Rotate 90°"
        onClick={handleRotate}
        disabled={!singleSelected}
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* 삭제 */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            disabled={!hasSelection}
            aria-label={`Delete ${selectedPages.length} selected page(s)`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Delete {hasSelection ? `${selectedPages.length} page(s)` : 'selected'}
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* 병합 안내 */}
      {documents.length >= 2 && (
        <>
          <ToolbarButton
            icon={<GitMerge className="h-4 w-4" />}
            label="Merge documents (load 2+ files, then use merge)"
            onClick={() => {}}
            disabled={true}
          />
          <Separator orientation="vertical" className="mx-1 h-5" />
        </>
      )}

      {/* 선택 상태 표시 */}
      {hasSelection && (
        <span className="ml-1 text-xs text-muted-foreground">
          {selectedPages.length} page{selectedPages.length !== 1 ? 's' : ''} selected
        </span>
      )}

      <div className="flex-1" />

      {/* 내보내기 */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleExport}
            aria-label="Download PDF"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download PDF</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Download the current document as PDF</TooltipContent>
      </Tooltip>
    </div>
  )
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
