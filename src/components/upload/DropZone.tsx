'use client'

import { useCallback, useMemo } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { Upload, FilePlus2 } from 'lucide-react'
import { toast } from 'sonner'

import { cn, formatBytes } from '@/lib/utils'
import { usePdfStore } from '@/lib/store/pdf-store'

interface DropZoneProps {
  /** "full" = 빈 화면용 대형 영역. "compact" = 사이드바용 소형. */
  variant?: 'full' | 'compact'
  /** 단일 파일당 최대 크기 (기본 100MB) */
  maxSizeBytes?: number
  /** 동시 업로드 최대 개수 (기본 20) */
  maxFiles?: number
}

/**
 * 거부 사유별 한국어 안내 토스트 (P1-10).
 *
 * react-dropzone의 에러 코드:
 *  - file-invalid-type : 허용되지 않은 형식 (PDF 아님)
 *  - file-too-large    : 최대 크기 초과
 *  - too-many-files    : 동시 업로드 개수 초과
 */
function notifyRejections(
  rejections: FileRejection[],
  maxSizeBytes: number,
): void {
  for (const rej of rejections) {
    const codes = rej.errors.map((e) => e.code)
    if (codes.includes('file-invalid-type')) {
      toast.error('PDF 파일만 업로드할 수 있습니다', {
        description: `"${rej.file.name}"은(는) PDF 형식이 아닙니다.`,
      })
    } else if (codes.includes('file-too-large')) {
      toast.error('파일이 너무 큽니다', {
        description: `"${rej.file.name}" (${formatBytes(
          rej.file.size,
        )}) — 최대 ${formatBytes(maxSizeBytes, 0)}까지 업로드할 수 있습니다.`,
      })
    } else if (codes.includes('too-many-files')) {
      toast.error('한 번에 업로드할 수 있는 파일 수를 초과했습니다', {
        description: `"${rej.file.name}"이(가) 제외되었습니다.`,
      })
    } else {
      toast.error('파일을 업로드할 수 없습니다', {
        description: `"${rej.file.name}" — ${
          rej.errors[0]?.message ?? '알 수 없는 오류'
        }`,
      })
    }
  }
}

/**
 * 드래그앤드롭 + 클릭 업로드 영역.
 * react-dropzone 기반으로 PDF만 허용한다.
 *
 * 드롭 시 `usePdfStore.loadDocuments(files)`를 호출하여 순차 파싱한다.
 * 거부된 파일은 sonner 토스트로 한국어 안내한다 (P1-10).
 */
export function DropZone({
  variant = 'full',
  maxSizeBytes = 100 * 1024 * 1024,
  maxFiles = 20,
}: DropZoneProps) {
  const loadDocuments = usePdfStore((s) => s.loadDocuments)
  const isLoading = usePdfStore((s) => s.isLoading)

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (rejections.length > 0) {
        notifyRejections(rejections, maxSizeBytes)
      }
      if (accepted.length > 0) {
        void loadDocuments(accepted)
      }
    },
    [loadDocuments, maxSizeBytes],
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject, open } =
    useDropzone({
      onDrop,
      accept: { 'application/pdf': ['.pdf'] },
      multiple: true,
      maxSize: maxSizeBytes,
      maxFiles,
      disabled: isLoading,
      noClick: variant === 'compact', // compact는 별도 버튼으로 트리거
      noKeyboard: false,
    })

  const rootClass = useMemo(
    () =>
      cn(
        'group relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed bg-white transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isDragActive && !isDragReject && 'border-primary bg-primary/5',
        isDragReject && 'border-destructive bg-destructive/5',
        !isDragActive &&
          !isDragReject &&
          'border-gray-300 hover:border-primary/60',
        isLoading && 'cursor-not-allowed opacity-60',
        variant === 'full' ? 'min-h-[280px] p-10' : 'p-4',
      ),
    [isDragActive, isDragReject, isLoading, variant],
  )

  if (variant === 'compact') {
    return (
      <div {...getRootProps({ className: rootClass })}>
        <input {...getInputProps()} aria-label="PDF 파일 업로드" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            open()
          }}
          disabled={isLoading}
          className={cn(
            'inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50',
          )}
          aria-label="업로드할 PDF 파일 선택"
        >
          <FilePlus2 className="h-4 w-4" aria-hidden />
          <span>PDF 추가</span>
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          또는 파일을 여기에 끌어다 놓으세요
        </p>
      </div>
    )
  }

  return (
    <div {...getRootProps({ className: rootClass, role: 'button', tabIndex: 0 })}>
      <input {...getInputProps()} aria-label="PDF 파일 업로드" />
      <div
        className={cn(
          'mb-4 flex h-16 w-16 items-center justify-center rounded-full transition-colors',
          isDragActive && !isDragReject
            ? 'bg-primary/15 text-primary'
            : 'bg-gray-100 text-gray-500',
        )}
      >
        <Upload className="h-8 w-8" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-foreground">
        {isDragActive
          ? isDragReject
            ? '지원하지 않는 파일 형식입니다'
            : 'PDF 파일을 여기에 놓으세요'
          : 'PDF 파일을 끌어다 놓아 편집을 시작하세요'}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        또는{' '}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            open()
          }}
          className="font-medium text-primary underline-offset-2 hover:underline focus:outline-none"
        >
          클릭하여 파일 선택
        </button>{' '}
        — PDF 전용, 파일당 최대 {formatBytes(maxSizeBytes, 0)}
      </p>
      <p className="mt-3 text-[11px] text-muted-foreground">
        파일은 브라우저를 벗어나지 않으며 모든 편집은 로컬에서 처리됩니다.
      </p>
      {isLoading && (
        <div
          className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <div
            className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden
          />
          <span>파일을 처리하는 중...</span>
        </div>
      )}
    </div>
  )
}
