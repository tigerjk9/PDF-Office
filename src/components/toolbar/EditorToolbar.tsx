'use client'

import { useState } from 'react'
import {
  Trash2,
  RotateCwSquare,
  MoveUp,
  MoveDown,
  Download,
  ChevronsUp,
  ChevronsDown,
  GitMerge,
  Undo2,
  Redo2,
  Scissors,
  FilePlus,
  FilePlus2,
  Stamp,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageManager } from '@/hooks/usePageManager'
import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'
import { MergeDialog } from '@/components/merge/MergeDialog'
import { InsertPagesDialog } from '@/components/pages/InsertPagesDialog'
import { InsertBlankDialog } from '@/components/pages/InsertBlankDialog'
import { WatermarkDialog } from '@/components/pages/WatermarkDialog'
import type { PageIndex } from '@/lib/types'

interface EditorToolbarProps {
  /** 선택 페이지 삭제 요청 → 상위에서 확인 다이얼로그 경유 (P1-8) */
  onRequestDelete?: (indices: PageIndex[]) => void
}

export function EditorToolbar({ onRequestDelete }: EditorToolbarProps) {
  const activeDoc = usePdfStore(selectActiveDoc)
  const documents = usePdfStore((s) => s.documents)
  const applyOperation = usePdfStore((s) => s.applyOperation)
  const undo = usePdfStore((s) => s.undo)
  const redo = usePdfStore((s) => s.redo)
  const canUndo = usePdfStore((s) => s.canUndo)
  const canRedo = usePdfStore((s) => s.canRedo)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [insertFromOpen, setInsertFromOpen] = useState(false)
  const [insertBlankOpen, setInsertBlankOpen] = useState(false)
  const [watermarkOpen, setWatermarkOpen] = useState(false)
  const {
    selectedPages,
    hasSelection,
    pageCount,
    rotatePage,
    rotateSelected,
    movePage,
    exportActive,
  } = usePageManager()

  if (!activeDoc) return null

  const firstSelected = selectedPages[0] ?? -1
  const lastSelected = selectedPages[selectedPages.length - 1] ?? -1
  const singleSelected = selectedPages.length === 1
  const multiSelected = selectedPages.length > 1
  const canMoveUp = hasSelection && firstSelected > 0
  const canMoveDown = hasSelection && lastSelected < pageCount - 1

  const handleMoveUp = () => {
    if (singleSelected) void movePage(firstSelected, firstSelected - 1)
  }
  const handleMoveDown = () => {
    if (singleSelected) void movePage(firstSelected, firstSelected + 1)
  }
  const handleMoveTop = () => {
    if (singleSelected) void movePage(firstSelected, 0)
  }
  const handleMoveBottom = () => {
    if (singleSelected) void movePage(firstSelected, pageCount - 1)
  }
  // 회전: 단일/다중 모두 지원 (P1-6)
  const handleRotate = () => {
    if (multiSelected) {
      void rotateSelected(90)
    } else if (singleSelected) {
      void rotatePage(firstSelected, 90)
    }
  }
  const handleDelete = () => {
    if (hasSelection) onRequestDelete?.([...selectedPages])
  }
  const handleExport = () => void exportActive()

  // P2-5: 선택 페이지를 새 문서로 추출
  const handleExtract = () => {
    if (!hasSelection) return
    void applyOperation({
      type: 'extract',
      docId: activeDoc.id,
      pageIndices: [...selectedPages],
      outputName: `${activeDoc.name.replace(/\.pdf$/i, '')}-추출.pdf`,
    }).then((result) => {
      if (result.success) {
        toast.success(`${selectedPages.length}개 페이지를 추출했습니다`, {
          description: '선택한 페이지로 새 문서를 만들었습니다.',
        })
      } else {
        toast.error('페이지 추출에 실패했습니다', {
          description:
            result.error?.message ?? '알 수 없는 오류가 발생했습니다.',
        })
      }
    })
  }

  return (
    <>
      <div
        className="flex h-10 flex-shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-background px-2"
        role="toolbar"
        aria-label="페이지 편집 툴바"
      >
        {/* 실행취소 / 다시실행 (P1-8) */}
        <ToolbarButton
          icon={<Undo2 className="h-4 w-4" />}
          label="실행취소 (Ctrl+Z)"
          onClick={undo}
          disabled={!canUndo}
        />
        <ToolbarButton
          icon={<Redo2 className="h-4 w-4" />}
          label="다시실행 (Ctrl+Y)"
          onClick={redo}
          disabled={!canRedo}
        />

        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* 페이지 순서 변경 (단일 선택만) — '이동(navigate)'와의 어휘 충돌 제거 */}
        <span
          className="ml-1 mr-0.5 hidden text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:inline"
          aria-hidden
        >
          순서
        </span>
        <ToolbarButton
          icon={<ChevronsUp className="h-4 w-4" />}
          label="이 페이지를 맨 앞으로 (문서 내 순서 변경)"
          onClick={handleMoveTop}
          disabled={!singleSelected || !canMoveUp}
        />
        <ToolbarButton
          icon={<MoveUp className="h-4 w-4" />}
          label="이 페이지를 한 칸 앞으로 (문서 내 순서 변경)"
          onClick={handleMoveUp}
          disabled={!singleSelected || !canMoveUp}
        />
        <ToolbarButton
          icon={<MoveDown className="h-4 w-4" />}
          label="이 페이지를 한 칸 뒤로 (문서 내 순서 변경)"
          onClick={handleMoveDown}
          disabled={!singleSelected || !canMoveDown}
        />
        <ToolbarButton
          icon={<ChevronsDown className="h-4 w-4" />}
          label="이 페이지를 맨 뒤로 (문서 내 순서 변경)"
          onClick={handleMoveBottom}
          disabled={!singleSelected || !canMoveDown}
        />

        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* 회전 (단일 + 다중 선택 — P1-6) */}
        <ToolbarButton
          icon={<RotateCwSquare className="h-4 w-4" />}
          label={
            multiSelected
              ? `선택한 ${selectedPages.length}개 페이지 90° 회전`
              : '90° 회전'
          }
          onClick={handleRotate}
          disabled={!hasSelection}
        />

        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* 삭제 (확인 다이얼로그 경유 — P1-8) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
              onClick={handleDelete}
              disabled={!hasSelection}
              aria-label={`선택한 ${selectedPages.length}개 페이지 삭제`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {hasSelection ? `${selectedPages.length}개 페이지 삭제` : '선택 페이지 삭제'}
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* P2-5: 선택 페이지 추출 / 빈 페이지 삽입 / 다른 문서 페이지 삽입 */}
        <ToolbarButton
          icon={<Scissors className="h-4 w-4" />}
          label={
            hasSelection
              ? `선택한 ${selectedPages.length}개 페이지 추출 (새 문서)`
              : '선택 페이지 추출 (페이지를 먼저 선택하세요)'
          }
          onClick={handleExtract}
          disabled={!hasSelection}
        />
        <ToolbarButton
          icon={<FilePlus className="h-4 w-4" />}
          label="빈 페이지 삽입"
          onClick={() => setInsertBlankOpen(true)}
          disabled={false}
        />
        {documents.length >= 2 && (
          <ToolbarButton
            icon={<FilePlus2 className="h-4 w-4" />}
            label="다른 문서의 페이지 삽입"
            onClick={() => setInsertFromOpen(true)}
            disabled={false}
          />
        )}

        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* P2-8: 워터마크 */}
        <ToolbarButton
          icon={<Stamp className="h-4 w-4" />}
          label="워터마크 추가 (모든 페이지)"
          onClick={() => setWatermarkOpen(true)}
          disabled={false}
        />

        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* 병합 진입점 */}
        {documents.length >= 2 && (
          <>
            <ToolbarButton
              icon={<GitMerge className="h-4 w-4" />}
              label="문서 병합 (2개 이상의 PDF를 하나로)"
              onClick={() => setMergeOpen(true)}
              disabled={false}
            />
            <Separator orientation="vertical" className="mx-1 h-4" />
          </>
        )}

        {/* 선택 상태 표시 */}
        {hasSelection && (
          <span className="ml-1.5 flex items-center gap-1.5 whitespace-nowrap rounded-md bg-primary-soft px-2 py-1 text-2xs font-medium text-primary">
            <span className="tabular-nums">{selectedPages.length}</span>
            개 선택됨
          </span>
        )}

        <div className="flex-1" />

        {/* 내보내기 — 주된 결과물이므로 outline(주된 툴) 위계 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="ml-1 whitespace-nowrap"
              onClick={handleExport}
              aria-label="PDF 다운로드"
            >
              <Download className="h-3.5 w-3.5" />
              <span>PDF 다운로드</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>현재 문서를 PDF로 다운로드</TooltipContent>
        </Tooltip>
      </div>
      <MergeDialog open={mergeOpen} onOpenChange={setMergeOpen} />
      <InsertPagesDialog
        open={insertFromOpen}
        onOpenChange={setInsertFromOpen}
      />
      <InsertBlankDialog
        open={insertBlankOpen}
        onOpenChange={setInsertBlankOpen}
      />
      <WatermarkDialog
        open={watermarkOpen}
        onOpenChange={setWatermarkOpen}
      />
    </>
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
          className="h-8 w-8 flex-shrink-0"
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
