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
        'group relative bg-background transition-colors duration-base ease-out-quart',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        variant === 'full'
          ? 'flex flex-col gap-4 rounded-lg border border-dashed p-7 sm:p-9'
          : 'flex flex-col gap-2 rounded-md border border-dashed p-3',
        isDragActive && !isDragReject && 'border-primary bg-primary-soft',
        isDragReject && 'border-destructive bg-destructive-soft',
        !isDragActive &&
          !isDragReject &&
          'border-border-strong hover:border-primary/55 hover:bg-muted',
        isLoading && 'cursor-not-allowed opacity-60',
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
            'inline-flex h-8 w-full select-none items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors duration-fast ease-out-quart hover:bg-primary-hover active:translate-y-px active:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50',
          )}
          aria-label="업로드할 PDF 파일 선택"
        >
          <FilePlus2 className="h-4 w-4" aria-hidden />
          <span>PDF 추가</span>
        </button>
        <p className="text-center text-2xs text-muted-foreground">
          또는 여기에 끌어다 놓기
        </p>
      </div>
    )
  }

  return (
    <div
      {...getRootProps({ className: rootClass, role: 'button', tabIndex: 0 })}
    >
      <input {...getInputProps()} aria-label="PDF 파일 업로드" />
      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            'mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border transition-colors duration-base',
            isDragActive && !isDragReject
              ? 'border-primary/40 bg-primary/10 text-primary'
              : isDragReject
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-border bg-muted text-muted-foreground',
          )}
          aria-hidden
        >
          <Upload className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-[-0.012em] text-foreground">
            {isDragActive
              ? isDragReject
                ? '지원하지 않는 파일 형식입니다'
                : 'PDF 파일을 여기에 놓으세요'
              : 'PDF 파일을 끌어다 놓으세요'}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            또는{' '}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                open()
              }}
              className="rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              클릭하여 선택
            </button>
            <span className="text-muted-foreground">
              {' '}
              · PDF 전용 · 파일당 최대 {formatBytes(maxSizeBytes, 0)}
            </span>
          </p>
        </div>
      </div>
      {isLoading && (
        <div
          className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <span
            className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-primary border-t-transparent"
            aria-hidden
          />
          <span>파일을 처리하는 중…</span>
        </div>
      )}
    </div>
  )
}
