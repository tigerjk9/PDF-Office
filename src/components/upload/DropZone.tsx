'use client'

import { useCallback, useMemo } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { Upload, FilePlus2 } from 'lucide-react'

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
 * 드래그앤드롭 + 클릭 업로드 영역.
 * react-dropzone 기반으로 PDF만 허용한다.
 *
 * 드롭 시 `usePdfStore.loadDocuments(files)`를 호출하여 순차 파싱한다.
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
        // 사용자에겐 store.error 채널로 보여주는 게 일관성 있지만,
        // 여기서는 단순 console 경고 (정책상 store는 엔진/AI 에이전트 영역).
        console.warn(
          'Rejected files:',
          rejections.map((r) => ({
            file: r.file.name,
            reasons: r.errors.map((e) => e.message),
          })),
        )
      }
      if (accepted.length > 0) {
        void loadDocuments(accepted)
      }
    },
    [loadDocuments],
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject, open } = useDropzone({
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
        !isDragActive && !isDragReject && 'border-gray-300 hover:border-primary/60',
        isLoading && 'cursor-not-allowed opacity-60',
        variant === 'full' ? 'min-h-[280px] p-10' : 'p-4',
      ),
    [isDragActive, isDragReject, isLoading, variant],
  )

  if (variant === 'compact') {
    return (
      <div {...getRootProps({ className: rootClass })}>
        <input {...getInputProps()} aria-label="Upload PDF files" />
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
          aria-label="Choose PDF files to upload"
        >
          <FilePlus2 className="h-4 w-4" aria-hidden />
          <span>Add PDF</span>
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          or drop files here
        </p>
      </div>
    )
  }

  return (
    <div {...getRootProps({ className: rootClass, role: 'button', tabIndex: 0 })}>
      <input {...getInputProps()} aria-label="Upload PDF files" />
      <div
        className={cn(
          'mb-4 flex h-16 w-16 items-center justify-center rounded-full transition-colors',
          isDragActive && !isDragReject ? 'bg-primary/15 text-primary' : 'bg-gray-100 text-gray-500',
        )}
      >
        <Upload className="h-8 w-8" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-foreground">
        {isDragActive
          ? isDragReject
            ? 'This file type is not supported'
            : 'Drop the PDFs here'
          : 'Drop PDF files to start editing'}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        or{' '}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            open()
          }}
          className="font-medium text-primary underline-offset-2 hover:underline focus:outline-none"
        >
          click to browse
        </button>{' '}
        — PDF only, up to {formatBytes(maxSizeBytes, 0)} per file
      </p>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Files never leave your browser. All editing happens locally.
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
          <span>Processing files...</span>
        </div>
      )}
    </div>
  )
}
