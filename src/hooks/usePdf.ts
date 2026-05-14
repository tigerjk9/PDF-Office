/**
 * usePdf — PDF 로드/렌더링 훅
 *
 * 책임:
 *   - 단일/다중 파일 업로드 트리거
 *   - activeDoc 셀렉터
 *   - 뷰어 페이지 렌더 헬퍼 (canvas ref + renderPageToCanvas 호출)
 *   - 텍스트 추출 헬퍼 (AI 변환용)
 *
 * UI 컴포넌트에서 사용:
 *   const { activeDoc, loadFiles, renderPage } = usePdf()
 */

'use client'

import { useCallback } from 'react'
import {
  usePdfStore,
  selectActiveDoc,
  selectActivePages,
} from '@/lib/store/pdf-store'
import { renderPageToCanvas } from '@/lib/pdf/renderer'
import { extractPageText, extractAllPagesText } from '@/lib/pdf/text-extractor'
import type { PdfDocument, PdfPage, PdfError, PageIndex } from '@/lib/types'

export interface UsePdfReturn {
  /** 현재 활성 문서 (없으면 null) */
  activeDoc: PdfDocument | null
  /** 활성 문서의 모든 페이지 */
  pages: PdfPage[]
  /** 전체 문서 리스트 */
  documents: PdfDocument[]
  /** 로딩 상태 */
  isLoading: boolean
  loadingMessage: string | null
  error: PdfError | null

  // ----- 액션 -----
  /** 단일 파일 로드 */
  loadFile: (file: File) => Promise<void>
  /** 다중 파일 로드 */
  loadFiles: (files: File[]) => Promise<void>
  /** 문서 제거 */
  removeDocument: (docId: string) => void
  /** 활성 문서 변경 */
  setActiveDoc: (docId: string | null) => void
  /** 에러 클리어 */
  clearError: () => void

  // ----- 렌더링 헬퍼 -----
  /**
   * 외부 canvas 엘리먼트에 페이지를 렌더.
   * 컴포넌트가 useRef로 canvas를 잡고 useEffect 내부에서 호출.
   */
  renderPage: (
    canvas: HTMLCanvasElement,
    pageIndex: PageIndex,
    scale?: number,
    rotation?: 0 | 90 | 180 | 270,
  ) => Promise<void>

  /** 페이지 텍스트 추출 (AI 변환용) */
  extractText: (pageIndex: PageIndex) => Promise<string>
  /** 전체 문서 텍스트 추출 */
  extractAllText: () => Promise<string[]>
}

export function usePdf(): UsePdfReturn {
  const documents = usePdfStore((s) => s.documents)
  const isLoading = usePdfStore((s) => s.isLoading)
  const loadingMessage = usePdfStore((s) => s.loadingMessage)
  const error = usePdfStore((s) => s.error)
  const activeDoc = usePdfStore(selectActiveDoc)
  const pages = usePdfStore(selectActivePages)

  const loadDocument = usePdfStore((s) => s.loadDocument)
  const loadDocuments = usePdfStore((s) => s.loadDocuments)
  const removeDocument = usePdfStore((s) => s.removeDocument)
  const setActiveDoc = usePdfStore((s) => s.setActiveDoc)
  const clearError = usePdfStore((s) => s.clearError)

  const loadFile = useCallback(
    async (file: File) => {
      await loadDocument(file)
    },
    [loadDocument],
  )

  const loadFiles = useCallback(
    async (files: File[]) => {
      await loadDocuments(files)
    },
    [loadDocuments],
  )

  const renderPage = useCallback(
    async (
      canvas: HTMLCanvasElement,
      pageIndex: PageIndex,
      scale = 1.0,
      rotation: 0 | 90 | 180 | 270 = 0,
    ) => {
      if (!activeDoc) return
      await renderPageToCanvas(activeDoc.bytes, pageIndex, canvas, {
        scale,
        rotation,
      })
    },
    [activeDoc],
  )

  const extractText = useCallback(
    async (pageIndex: PageIndex) => {
      if (!activeDoc) return ''
      return extractPageText(activeDoc.bytes, pageIndex)
    },
    [activeDoc],
  )

  const extractAllText = useCallback(async () => {
    if (!activeDoc) return []
    return extractAllPagesText(activeDoc.bytes)
  }, [activeDoc])

  return {
    activeDoc,
    pages,
    documents,
    isLoading,
    loadingMessage,
    error,
    loadFile,
    loadFiles,
    removeDocument,
    setActiveDoc,
    clearError,
    renderPage,
    extractText,
    extractAllText,
  }
}
