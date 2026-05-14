/**
 * PDF Office — Zustand Store
 *
 * api-interfaces.ts의 PdfStore 인터페이스를 구현한다.
 * 단일 스토어 + 슬라이스 패턴 (state-design.md 참조).
 *
 * 의존:
 *   - lib/pdf/loader.ts (파싱/메타)
 *   - lib/pdf/renderer.ts (썸네일)
 *   - lib/pdf/manipulator.ts (delete/reorder/merge/rotate)
 *   - lib/pdf/exporter.ts (다운로드)
 *
 * 미연결: convertToMarkdown → AI 에이전트가 /api/convert 라우트와 연결 예정.
 */

'use client'

import { create } from 'zustand'
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware'
import { fileToBytes, getAllPageMeta } from '@/lib/pdf/loader'
import { generateThumbnails } from '@/lib/pdf/renderer'
import {
  deletePages,
  reorderPages,
  mergeDocuments,
  rotatePage,
} from '@/lib/pdf/manipulator'
import { downloadPdf } from '@/lib/pdf/exporter'
import type {
  ApplyOperationResult,
  ConversionOptions,
  ConversionResult,
  DocId,
  EditMode,
  PageIndex,
  PdfDocument,
  PdfError,
  PdfOperation,
  PdfStore,
  ViewerState,
} from '@/lib/types'

// ---- Helpers --------------------------------------------------------------

function makeId(): string {
  // Web Crypto 우선, 폴백
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function toPdfError(cause: unknown, fallback: PdfError['code']): PdfError {
  const message = cause instanceof Error ? cause.message : String(cause)
  let code: PdfError['code'] = fallback
  if (message.includes('ENCRYPTED_PDF')) code = 'ENCRYPTED_PDF'
  else if (message.includes('INVALID_FILE')) code = 'INVALID_FILE'
  else if (message.includes('PARSE_FAILED')) code = 'PARSE_FAILED'
  return {
    code,
    message,
    cause,
    recoverable: code !== 'PARSE_FAILED',
  }
}

const initialViewer: ViewerState = {
  currentPageIndex: 0,
  zoom: 1.0,
  fitMode: 'fit-width',
}

/**
 * 새 bytes로부터 PdfDocument 메타데이터를 재구성한다.
 * 페이지 수, 폭/높이를 다시 측정하고 thumbnail은 빈 상태로 시작.
 * @param targetId 새 문서 ID (병합) 또는 기존 ID 유지 (편집).
 */
async function buildDocument(
  bytes: Uint8Array,
  name: string,
  sizeBytes: number,
  targetId: string,
): Promise<PdfDocument> {
  const metas = await getAllPageMeta(bytes)
  return {
    id: targetId,
    name,
    bytes,
    pageCount: metas.length,
    pages: metas.map((m) => ({
      index: m.index,
      docId: targetId,
      thumbnail: undefined,
      selected: false,
      width: m.width,
      height: m.height,
      rotation: 0,
    })),
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    sizeBytes,
  }
}

// ---- Store ----------------------------------------------------------------

export const usePdfStore = create<PdfStore>()(
  devtools(
    subscribeWithSelector(
      persist(
        (set, get) => ({
          // --- 상태 ---
          documents: [],
          activeDocId: null,
          selectedPages: [],
          editMode: 'view',
          viewer: initialViewer,
          isLoading: false,
          loadingMessage: null,
          error: null,
          conversionResults: {},

          // --- 문서 액션 ---
          loadDocument: async (file: File) => {
            if (get().isLoading) return
            set({ isLoading: true, loadingMessage: `Parsing ${file.name}...`, error: null })
            try {
              const bytes = await fileToBytes(file)
              const metas = await getAllPageMeta(bytes)
              const id = makeId()
              const doc: PdfDocument = {
                id,
                name: file.name,
                bytes,
                pageCount: metas.length,
                pages: metas.map((m) => ({
                  index: m.index,
                  docId: id,
                  thumbnail: undefined,
                  selected: false,
                  width: m.width,
                  height: m.height,
                  rotation: 0,
                })),
                createdAt: Date.now(),
                sizeBytes: file.size,
              }
              set((s) => ({
                documents: [...s.documents, doc],
                activeDocId: doc.id,
                selectedPages: [],
              }))
              // 비동기 후처리: 썸네일 생성 (fire-and-forget)
              void generateThumbnails(bytes, 0.3, (i, _t, dataUrl) => {
                set((s) => ({
                  documents: s.documents.map((d) =>
                    d.id !== id
                      ? d
                      : {
                          ...d,
                          pages: d.pages.map((p) =>
                            p.index === i ? { ...p, thumbnail: dataUrl } : p,
                          ),
                        },
                  ),
                }))
              }).catch(() => {
                // 썸네일 실패는 silent — 페이지는 표시되어야 함
              })
            } catch (cause) {
              set({ error: toPdfError(cause, 'PARSE_FAILED') })
            } finally {
              set({ isLoading: false, loadingMessage: null })
            }
          },

          loadDocuments: async (files: File[]) => {
            for (const f of files) {
              // 순차 로드 (메모리 가드)
              // eslint-disable-next-line no-await-in-loop
              await get().loadDocument(f)
            }
          },

          removeDocument: (docId: DocId) => {
            set((s) => {
              const remaining = s.documents.filter((d) => d.id !== docId)
              const newActive =
                s.activeDocId === docId ? (remaining[0]?.id ?? null) : s.activeDocId
              return {
                documents: remaining,
                activeDocId: newActive,
                selectedPages: [],
              }
            })
          },

          setActiveDoc: (docId: DocId | null) => {
            set({
              activeDocId: docId,
              selectedPages: [],
              editMode: 'view',
              viewer: { ...get().viewer, currentPageIndex: 0 },
            })
          },

          // --- 편집 액션 ---
          applyOperation: async (op: PdfOperation): Promise<ApplyOperationResult> => {
            if (get().isLoading) {
              return {
                success: false,
                error: {
                  code: 'OPERATION_FAILED',
                  message: '다른 작업이 진행 중입니다.',
                  recoverable: true,
                },
              }
            }
            set({
              isLoading: true,
              loadingMessage: 'Applying operation...',
              error: null,
            })

            try {
              const state = get()

              // 병합은 새 문서 생성 분기
              if (op.type === 'merge') {
                const docs = op.docIds
                  .map((id) => state.documents.find((d) => d.id === id))
                  .filter((d): d is PdfDocument => !!d)
                if (docs.length !== op.docIds.length) {
                  throw new Error('OPERATION_FAILED: 일부 문서를 찾을 수 없습니다.')
                }
                if (docs.length < 2) {
                  throw new Error('OPERATION_FAILED: 병합하려면 2개 이상의 문서가 필요합니다.')
                }
                const newBytes = await mergeDocuments(docs.map((d) => d.bytes))
                const outputName = op.outputName ?? `merged-${Date.now()}.pdf`
                const newId = makeId()
                const newDoc = await buildDocument(
                  newBytes,
                  outputName,
                  newBytes.byteLength,
                  newId,
                )
                set((s) => ({
                  documents: [...s.documents, newDoc],
                  activeDocId: newDoc.id,
                  selectedPages: [],
                  viewer: { ...s.viewer, currentPageIndex: 0 },
                  editMode: 'view',
                }))
                // 썸네일 fire-and-forget
                void generateThumbnails(newDoc.bytes, 0.3, (i, _t, dataUrl) => {
                  set((s) => ({
                    documents: s.documents.map((d) =>
                      d.id !== newDoc.id
                        ? d
                        : {
                            ...d,
                            pages: d.pages.map((p) =>
                              p.index === i ? { ...p, thumbnail: dataUrl } : p,
                            ),
                          },
                    ),
                  }))
                }).catch(() => undefined)
                return { success: true, document: newDoc }
              }

              // delete / reorder / rotate 는 단일 문서 갱신
              if (op.type === 'editText') {
                // v1 MVP: 텍스트 편집은 좌표가 필요하므로 store API 단독으로는 미지원.
                // UI는 src/lib/pdf/manipulator.replaceTextAtRect를 직접 사용해야 한다.
                throw new Error(
                  'OPERATION_FAILED: editText는 좌표 정보가 필요합니다. replaceTextAtRect 직접 호출 권장.',
                )
              }

              const doc = state.documents.find((d) => d.id === op.docId)
              if (!doc) throw new Error('OPERATION_FAILED: 문서를 찾을 수 없습니다.')

              let newBytes: Uint8Array
              if (op.type === 'delete') {
                newBytes = await deletePages(doc.bytes, op.pageIndices)
              } else if (op.type === 'reorder') {
                newBytes = await reorderPages(doc.bytes, op.newOrder)
              } else if (op.type === 'rotate') {
                newBytes = await rotatePage(doc.bytes, op.pageIndex, op.degrees)
              } else {
                // exhaustive — TypeScript의 narrowing이 끝나면 op는 never가 된다
                const _exhaustive: never = op
                void _exhaustive
                throw new Error('OPERATION_FAILED: 알 수 없는 작업 타입.')
              }

              // ID 유지: 사용자 관점에서 동일 문서
              const updatedDoc = await buildDocument(
                newBytes,
                doc.name,
                newBytes.byteLength,
                doc.id,
              )

              set((s) => ({
                documents: s.documents.map((d) => (d.id === doc.id ? updatedDoc : d)),
                selectedPages: [],
                viewer: {
                  ...s.viewer,
                  currentPageIndex: Math.min(
                    s.viewer.currentPageIndex,
                    updatedDoc.pageCount - 1,
                  ),
                },
              }))

              // 새 썸네일 재생성
              void generateThumbnails(updatedDoc.bytes, 0.3, (i, _t, dataUrl) => {
                set((s) => ({
                  documents: s.documents.map((d) =>
                    d.id !== updatedDoc.id
                      ? d
                      : {
                          ...d,
                          pages: d.pages.map((p) =>
                            p.index === i ? { ...p, thumbnail: dataUrl } : p,
                          ),
                        },
                  ),
                }))
              }).catch(() => undefined)

              return { success: true, document: updatedDoc }
            } catch (cause) {
              const err = toPdfError(cause, 'OPERATION_FAILED')
              set({ error: err })
              return { success: false, error: err }
            } finally {
              set({ isLoading: false, loadingMessage: null })
            }
          },

          exportDocument: async (docId: DocId, fileName?: string) => {
            const doc = get().documents.find((d) => d.id === docId)
            if (!doc) {
              set({
                error: {
                  code: 'EXPORT_FAILED',
                  message: '문서를 찾을 수 없습니다.',
                  recoverable: true,
                },
              })
              return
            }
            try {
              downloadPdf(doc.bytes, fileName ?? doc.name)
            } catch (cause) {
              set({ error: toPdfError(cause, 'EXPORT_FAILED') })
            }
          },

          // --- 선택/뷰어 ---
          togglePageSelection: (pageIndex: PageIndex) => {
            set((s) => ({
              selectedPages: s.selectedPages.includes(pageIndex)
                ? s.selectedPages.filter((i) => i !== pageIndex)
                : [...s.selectedPages, pageIndex].sort((a, b) => a - b),
            }))
          },
          selectPages: (pageIndices: PageIndex[]) => {
            set({ selectedPages: [...pageIndices].sort((a, b) => a - b) })
          },
          clearSelection: () => set({ selectedPages: [] }),
          setEditMode: (mode: EditMode) => set({ editMode: mode }),
          setZoom: (zoom: number) => {
            const clamped = Math.max(0.25, Math.min(4.0, zoom))
            set((s) => ({ viewer: { ...s.viewer, zoom: clamped, fitMode: null } }))
          },
          setFitMode: (fitMode) =>
            set((s) => ({ viewer: { ...s.viewer, fitMode } })),
          setCurrentPage: (pageIndex: PageIndex) =>
            set((s) => {
              const activeDoc = s.documents.find((d) => d.id === s.activeDocId)
              const max = (activeDoc?.pageCount ?? 1) - 1
              const clamped = Math.max(0, Math.min(max, pageIndex))
              return { viewer: { ...s.viewer, currentPageIndex: clamped } }
            }),

          // --- AI ---
          convertToMarkdown: async (
            docId: DocId,
            options: ConversionOptions,
          ): Promise<ConversionResult> => {
            // TODO(ai-agent): 실제 /api/convert fetch + streaming 연결
            const doc = get().documents.find((d) => d.id === docId)
            if (!doc) {
              throw new Error('Document not found')
            }
            const start = Date.now()
            const result: ConversionResult = {
              markdown: '# Conversion not yet wired\n\nConnect the AI agent.',
              tokensUsed: 0,
              provider: options.provider,
              model: 'stub',
              completedAt: Date.now(),
              durationMs: Date.now() - start,
              pagesConverted: 0,
            }
            set((s) => ({
              conversionResults: { ...s.conversionResults, [docId]: result },
            }))
            return result
          },

          // --- 공통 ---
          clearError: () => set({ error: null }),
          reset: () =>
            set({
              documents: [],
              activeDocId: null,
              selectedPages: [],
              editMode: 'view',
              viewer: initialViewer,
              isLoading: false,
              loadingMessage: null,
              error: null,
              conversionResults: {},
            }),
        }),
        {
          name: 'pdf-office-prefs',
          // 사용자 선호만 영속화 (state-design §7)
          partialize: (s) => ({
            viewer: { zoom: s.viewer.zoom, fitMode: s.viewer.fitMode },
          }),
        },
      ),
    ),
    { name: 'PdfOfficeStore' },
  ),
)

// --- Selectors -------------------------------------------------------------

export const selectActiveDoc = (s: PdfStore): PdfDocument | null =>
  s.documents.find((d) => d.id === s.activeDocId) ?? null

export const selectActivePages = (s: PdfStore) => selectActiveDoc(s)?.pages ?? []

export const selectIsAnySelected = (s: PdfStore) => s.selectedPages.length > 0

export const selectCanMerge = (s: PdfStore) => s.documents.length >= 2
