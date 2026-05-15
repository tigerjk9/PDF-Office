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
import {
  fileToBytes,
  getAllPageMeta,
  WRONG_PASSWORD_PREFIX,
} from '@/lib/pdf/loader'
import { generateThumbnails, renderPageThumbnail } from '@/lib/pdf/renderer'
import {
  deletePages,
  reorderPages,
  mergeDocuments,
  rotatePage,
  replaceTextAtRect,
} from '@/lib/pdf/manipulator'
import {
  extractPages,
  insertBlankPage,
  insertPagesFromDoc,
  applyWatermark,
} from '@/lib/pdf/insert'
import { downloadPdf } from '@/lib/pdf/exporter'
import {
  createIdbStorage,
  flushPersist,
  onPersistSettled,
} from '@/lib/pdf/idb-storage'
import {
  remapPagesAfterDelete,
  remapPagesAfterReorder,
  remapPagesAfterRotate,
} from '@/lib/pdf/thumbnails'
import {
  emptyHistory,
  pushSnapshot,
  popUndo,
  popRedo,
  canUndo as historyCanUndo,
  canRedo as historyCanRedo,
  type HistoryState,
  type HistorySnapshot,
} from '@/lib/pdf/history'
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

// ---- 편집 히스토리 (P1-8) -------------------------------------------------
//
// 히스토리 스냅샷은 영속화 대상에서 제외해야 한다(용량 폭증 방지).
// types.ts(동결)에 스택 필드를 추가할 수 없고 partialize 에서도 빼야 하므로
// 스냅샷 본문은 모듈 레벨 변수로 보관하고, 스토어 상태에는 타입에 이미
// 정의된 canUndo/canRedo 불리언만 노출한다(반응형 + persist 자동 제외).
//
// 불변성: historyRef.current 는 항상 새 HistoryState 로 교체(직접 변이 금지).

const historyRef: { current: HistoryState } = { current: emptyHistory() }

/**
 * 히스토리 변경 시 스토어의 canUndo/canRedo 불리언을 동기화한다.
 * setState 는 스토어 생성 후에만 가능하므로 지연 바인딩한다.
 */
let syncHistoryFlags: (() => void) | null = null

/** 새 작업 직전 스냅샷을 push 하고 redo 스택을 비운다(불변). */
function pushHistory(snapshot: HistorySnapshot): void {
  historyRef.current = pushSnapshot(historyRef.current, snapshot)
  syncHistoryFlags?.()
}

/** 히스토리 스택을 비운다(reset 시). */
function clearHistory(): void {
  historyRef.current = emptyHistory()
  syncHistoryFlags?.()
}

/**
 * undo/redo 실행 시점의 "현재 상태"를 반대 방향 스택에 보관할
 * 복원점으로 캡처한다. pending 스냅샷의 docId 문서가 현재 존재하면
 * 전체(bytes + pages + rotation + thumbnail) 스냅샷, 없으면 doc=null.
 *
 * 불변성: 캡처 시 pages 를 얕은 복제해 이후 변이로부터 격리.
 */
function makeCurrentSnapshot(
  state: PdfStore,
  pending: HistorySnapshot | undefined,
): HistorySnapshot | null {
  if (!pending) return null
  const cur = state.documents.find((d) => d.id === pending.docId)
  return {
    docId: pending.docId,
    doc: cur
      ? { ...cur, pages: cur.pages.map((p) => ({ ...p })) }
      : null,
    prevActiveDocId: state.activeDocId,
    prevCurrentPageIndex: state.viewer.currentPageIndex,
  }
}

/**
 * 복원점을 documents 에 반영한다.
 *  - doc != null : 해당 docId 문서를 doc 으로 교체. 없으면 끝에 삽입.
 *  - doc == null : 해당 docId 문서를 제거.
 * 활성 문서/뷰어 페이지를 복원점 컨텍스트로 되돌리고 선택을 초기화.
 *
 * 썸네일은 스냅샷에 포함돼 있으므로 재렌더하지 않는다(P1-9).
 */
function restoreSnapshot(
  rp: HistorySnapshot,
  set: (
    partial:
      | Partial<PdfStore>
      | ((s: PdfStore) => Partial<PdfStore>),
  ) => void,
): void {
  set((s) => {
    let documents: PdfDocument[]
    if (rp.doc === null) {
      documents = s.documents.filter((d) => d.id !== rp.docId)
    } else {
      const exists = s.documents.some((d) => d.id === rp.docId)
      documents = exists
        ? s.documents.map((d) => (d.id === rp.docId ? rp.doc! : d))
        : [...s.documents, rp.doc]
    }
    // 활성 문서 보정: 복원점이 가리키는 문서가 실제로 존재할 때만 사용.
    const wantActive = rp.prevActiveDocId
    const activeDocId =
      wantActive && documents.some((d) => d.id === wantActive)
        ? wantActive
        : (documents[documents.length - 1]?.id ?? null)
    const activeDoc = documents.find((d) => d.id === activeDocId)
    const maxIdx = Math.max(0, (activeDoc?.pageCount ?? 1) - 1)
    return {
      documents,
      activeDocId,
      selectedPages: [],
      viewer: {
        ...s.viewer,
        currentPageIndex: Math.min(
          Math.max(0, rp.prevCurrentPageIndex),
          maxIdx,
        ),
      },
    }
  })
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
          canUndo: false,
          canRedo: false,

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

          loadEncryptedDocument: async (file: File, password: string) => {
            if (get().isLoading) return
            set({
              isLoading: true,
              loadingMessage: `Unlocking ${file.name}...`,
              error: null,
            })
            try {
              const bytes = await fileToBytes(file)
              // loader 에 password 전달 — 잘못된 비밀번호면 loader 가
              // WRONG_PASSWORD_ 접두 에러를 던진다(일반 암호화와 구분).
              const metas = await getAllPageMeta(bytes, password)
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
              // 썸네일은 동일 password 로 재해독해 생성(fire-and-forget).
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
              const message =
                cause instanceof Error ? cause.message : String(cause)
              // 비밀번호 불일치는 명확히 안내(복구 가능),
              // 그 외(여전히 암호 필요/파싱 실패 등)는 ENCRYPTED_PDF.
              const err: PdfError = message.includes(WRONG_PASSWORD_PREFIX)
                ? {
                    code: 'ENCRYPTED_PDF',
                    message: '비밀번호가 올바르지 않습니다.',
                    cause,
                    recoverable: true,
                  }
                : toPdfError(cause, 'ENCRYPTED_PDF')
              set({ error: err })
            } finally {
              set({ isLoading: false, loadingMessage: null })
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

                // 히스토리: 새 문서 추가 작업.
                // 추가 직전엔 이 문서가 없었으므로 복원점 doc=null
                // (undo 시 추가 문서 제거 → 직전 활성/페이지로 복귀).
                pushHistory({
                  docId: newDoc.id,
                  doc: null,
                  prevActiveDocId: state.activeDocId,
                  prevCurrentPageIndex: state.viewer.currentPageIndex,
                })

                set((s) => ({
                  documents: [...s.documents, newDoc],
                  activeDocId: newDoc.id,
                  selectedPages: [],
                  viewer: { ...s.viewer, currentPageIndex: 0 },
                  editMode: 'view',
                }))
                // 병합 결과는 신규 문서이므로 전체 썸네일 생성 불가피.
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

              // extract: 선택 페이지를 새 문서로 추출(merge와 동일하게
              // 새 PdfDocument 생성 + 썸네일 전체 생성 + activeDoc 전환).
              if (op.type === 'extract') {
                const srcDoc = state.documents.find((d) => d.id === op.docId)
                if (!srcDoc) {
                  throw new Error('OPERATION_FAILED: 문서를 찾을 수 없습니다.')
                }
                const newBytes = await extractPages(
                  srcDoc.bytes,
                  op.pageIndices,
                )
                const outputName =
                  op.outputName ?? `extracted-${Date.now()}.pdf`
                const newId = makeId()
                const newDoc = await buildDocument(
                  newBytes,
                  outputName,
                  newBytes.byteLength,
                  newId,
                )

                // 히스토리: 새 문서 추가 작업(추가 직전엔 없었으므로
                // 복원점 doc=null → undo 시 추가 문서 제거).
                pushHistory({
                  docId: newDoc.id,
                  doc: null,
                  prevActiveDocId: state.activeDocId,
                  prevCurrentPageIndex: state.viewer.currentPageIndex,
                })

                set((s) => ({
                  documents: [...s.documents, newDoc],
                  activeDocId: newDoc.id,
                  selectedPages: [],
                  viewer: { ...s.viewer, currentPageIndex: 0 },
                  editMode: 'view',
                }))
                // 추출 결과는 신규 문서이므로 전체 썸네일 생성 불가피.
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

              // insertBlank / insertFrom / watermark:
              // 기존 문서를 갱신(ID 유지) + 히스토리 push(undo 가능).
              // 페이지 구조/내용이 바뀌어 메타·썸네일 재구성이 필요하므로
              // delete/reorder/rotate 의 증분 리매핑 체인과 분리해 처리한다.
              if (
                op.type === 'insertBlank' ||
                op.type === 'insertFrom' ||
                op.type === 'watermark'
              ) {
                const tgt = state.documents.find((d) => d.id === op.docId)
                if (!tgt) {
                  throw new Error('OPERATION_FAILED: 문서를 찾을 수 없습니다.')
                }

                // 히스토리: 작업 직전 문서 전체 스냅샷(bytes + pages +
                // 이미 렌더된 thumbnail 포함) → undo 시 그대로 복원(재렌더 0장).
                const beforeSnap: PdfDocument = {
                  ...tgt,
                  pages: tgt.pages.map((p) => ({ ...p })),
                }

                let nextBytes: Uint8Array
                if (op.type === 'insertBlank') {
                  nextBytes = await insertBlankPage(
                    tgt.bytes,
                    op.atIndex,
                    op.size,
                  )
                } else if (op.type === 'insertFrom') {
                  const src = state.documents.find(
                    (d) => d.id === op.sourceDocId,
                  )
                  if (!src) {
                    throw new Error(
                      'OPERATION_FAILED: 소스 문서를 찾을 수 없습니다.',
                    )
                  }
                  nextBytes = await insertPagesFromDoc(
                    tgt.bytes,
                    src.bytes,
                    op.sourcePageIndices,
                    op.atIndex,
                  )
                } else {
                  // watermark — 전 페이지 적용.
                  nextBytes = await applyWatermark(tgt.bytes, op.text, {
                    opacity: op.opacity,
                    fontSize: op.fontSize,
                    rotationDeg: op.rotationDeg,
                  })
                }

                // 작업이 성공해 nextBytes 가 산출된 후에만 스냅샷 push.
                pushHistory({
                  docId: tgt.id,
                  doc: beforeSnap,
                  prevActiveDocId: state.activeDocId,
                  prevCurrentPageIndex: state.viewer.currentPageIndex,
                })

                // ID 유지: 사용자 관점에서 동일 문서.
                // 페이지 수/크기가 변하므로 메타는 buildDocument 로 재구성.
                const rebuilt = await buildDocument(
                  nextBytes,
                  tgt.name,
                  nextBytes.byteLength,
                  tgt.id,
                )
                const updatedDoc: PdfDocument = {
                  ...rebuilt,
                  createdAt: tgt.createdAt,
                  modifiedAt: Date.now(),
                }

                set((s) => ({
                  documents: s.documents.map((d) =>
                    d.id === tgt.id ? updatedDoc : d,
                  ),
                  selectedPages: [],
                  viewer: {
                    ...s.viewer,
                    currentPageIndex: Math.min(
                      s.viewer.currentPageIndex,
                      Math.max(0, updatedDoc.pageCount - 1),
                    ),
                  },
                }))

                // 페이지 구조/내용이 바뀌었으므로 썸네일 전체 재생성.
                // (insertBlank/insertFrom: 인덱스 시프트로 정확한 증분 매핑이
                //  복잡 → rebuild 패턴. watermark: 전 페이지 변경으로 명세상
                //  전체 재생성 허용.)
                void generateThumbnails(
                  updatedDoc.bytes,
                  0.3,
                  (i, _t, dataUrl) => {
                    set((s) => ({
                      documents: s.documents.map((d) =>
                        d.id !== updatedDoc.id
                          ? d
                          : {
                              ...d,
                              pages: d.pages.map((p) =>
                                p.index === i
                                  ? { ...p, thumbnail: dataUrl }
                                  : p,
                              ),
                            },
                      ),
                    }))
                  },
                ).catch(() => undefined)

                return { success: true, document: updatedDoc }
              }

              // editText: 단일 페이지 텍스트 교체. 문서 ID 유지 갱신 +
              // 히스토리 push(undo 가능) + 편집된 1페이지만 증분 썸네일 재렌더
              // (P1-9: 나머지 페이지 썸네일/메타는 그대로 보존).
              if (op.type === 'editText') {
                const tgt = state.documents.find((d) => d.id === op.docId)
                if (!tgt) {
                  throw new Error('OPERATION_FAILED: 문서를 찾을 수 없습니다.')
                }
                if (op.pageIndex < 0 || op.pageIndex >= tgt.pageCount) {
                  throw new Error(
                    `OPERATION_FAILED: 페이지 인덱스 ${op.pageIndex} 범위 초과.`,
                  )
                }

                // 작업 직전 문서 전체 스냅샷(bytes + pages + 기존 thumbnail).
                // → undo 시 그대로 복원(편집 페이지 썸네일까지 복구, 재렌더 0장).
                const beforeSnap: PdfDocument = {
                  ...tgt,
                  pages: tgt.pages.map((p) => ({ ...p })),
                }

                const { bytes: editedBytes, warning } =
                  await replaceTextAtRect(
                    tgt.bytes,
                    op.pageIndex,
                    {
                      x: op.rect.x,
                      y: op.rect.y,
                      width: op.rect.width,
                      height: op.rect.height,
                      fontSize: op.fontSize,
                    },
                    op.replacementText,
                  )

                // 작업 성공(editedBytes 산출) 후에만 스냅샷 push.
                pushHistory({
                  docId: tgt.id,
                  doc: beforeSnap,
                  prevActiveDocId: state.activeDocId,
                  prevCurrentPageIndex: state.viewer.currentPageIndex,
                })

                // ID 유지: 페이지 수/구조는 불변(텍스트만 교체)이므로
                // pages 메타는 기존 것을 그대로 두고 bytes 만 교체한다.
                // 편집된 페이지 썸네일은 아래에서 비동기 증분 갱신.
                const updatedDoc: PdfDocument = {
                  ...tgt,
                  bytes: editedBytes,
                  modifiedAt: Date.now(),
                  sizeBytes: editedBytes.byteLength,
                }

                set((s) => ({
                  documents: s.documents.map((d) =>
                    d.id === tgt.id ? updatedDoc : d,
                  ),
                  selectedPages: [],
                }))

                // P1-9 증분 썸네일: 편집된 1페이지만 재렌더(fire-and-forget).
                // 나머지 페이지 썸네일은 보존되어 재렌더 0장.
                void renderPageThumbnail(editedBytes, op.pageIndex, 0.3)
                  .then((dataUrl) => {
                    set((s) => ({
                      documents: s.documents.map((d) =>
                        d.id !== updatedDoc.id
                          ? d
                          : {
                              ...d,
                              pages: d.pages.map((p) =>
                                p.index === op.pageIndex
                                  ? { ...p, thumbnail: dataUrl }
                                  : p,
                              ),
                            },
                      ),
                    }))
                  })
                  .catch(() => {
                    // 썸네일 실패는 silent — 본문 편집은 이미 반영됨.
                  })

                return { success: true, document: updatedDoc, warning }
              }

              // delete / reorder / rotate 는 단일 문서 갱신

              const doc = state.documents.find((d) => d.id === op.docId)
              if (!doc) throw new Error('OPERATION_FAILED: 문서를 찾을 수 없습니다.')

              // 히스토리: 작업 직전 문서 전체 스냅샷(bytes + pages + rotation +
              // 이미 렌더된 thumbnail 포함) → undo/redo 시 썸네일 재렌더 회피.
              const beforeSnapshot: PdfDocument = {
                ...doc,
                pages: doc.pages.map((p) => ({ ...p })),
              }

              // P1-9 증분 썸네일: 작업 유형별로 기존 썸네일을 최대한 재사용.
              // bytes 는 정확성을 위해 pdf-lib 으로 재생성하되, pages 메타는
              // 전체 재렌더 없이 리매핑한다.
              let newBytes: Uint8Array
              let newPages
              if (op.type === 'delete') {
                newBytes = await deletePages(doc.bytes, op.pageIndices)
                // 삭제 안 된 페이지의 기존 썸네일 보존(재렌더 0장).
                newPages = remapPagesAfterDelete(
                  doc.pages,
                  op.pageIndices,
                  doc.id,
                )
              } else if (op.type === 'reorder') {
                newBytes = await reorderPages(doc.bytes, op.newOrder)
                // 기존 썸네일을 새 순서로 재배치만(재렌더 0장).
                newPages = remapPagesAfterReorder(doc.pages, op.newOrder, doc.id)
              } else if (op.type === 'rotate') {
                newBytes = await rotatePage(doc.bytes, op.pageIndex, op.degrees)
                // 회전 페이지의 rotation 메타만 갱신(CSS 회전, 재렌더 0장).
                newPages = remapPagesAfterRotate(
                  doc.pages,
                  op.pageIndex,
                  op.degrees,
                )
              } else {
                // exhaustive — TypeScript의 narrowing이 끝나면 op는 never가 된다
                const _exhaustive: never = op
                void _exhaustive
                throw new Error('OPERATION_FAILED: 알 수 없는 작업 타입.')
              }

              // 스냅샷이 유효(작업 실패 없이 newBytes 산출)할 때만 push.
              // 작업 직전 문서 전체를 복원점으로 보관(undo 시 그대로 복원).
              pushHistory({
                docId: doc.id,
                doc: beforeSnapshot,
                prevActiveDocId: state.activeDocId,
                prevCurrentPageIndex: state.viewer.currentPageIndex,
              })

              // ID 유지: 사용자 관점에서 동일 문서.
              // pages 는 증분 리매핑 결과를 사용(전체 buildDocument/재렌더 회피).
              const updatedDoc: PdfDocument = {
                ...doc,
                bytes: newBytes,
                pageCount: newPages.length,
                pages: newPages,
                modifiedAt: Date.now(),
                sizeBytes: newBytes.byteLength,
              }

              set((s) => ({
                documents: s.documents.map((d) =>
                  d.id === doc.id ? updatedDoc : d,
                ),
                selectedPages: [],
                viewer: {
                  ...s.viewer,
                  currentPageIndex: Math.min(
                    s.viewer.currentPageIndex,
                    Math.max(0, updatedDoc.pageCount - 1),
                  ),
                },
              }))

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

          // --- 히스토리 (P1-8) ---
          undo: () => {
            const state = get()
            // redo 용 현재 상태 스냅샷 산출.
            const current = makeCurrentSnapshot(state, historyRef.current.undo[
              historyRef.current.undo.length - 1
            ])
            if (!current) return
            const result = popUndo(historyRef.current, current)
            if (!result) return
            historyRef.current = result.next
            restoreSnapshot(result.snapshot, set)
            syncHistoryFlags?.()
          },
          redo: () => {
            const state = get()
            const current = makeCurrentSnapshot(state, historyRef.current.redo[
              historyRef.current.redo.length - 1
            ])
            if (!current) return
            const result = popRedo(historyRef.current, current)
            if (!result) return
            historyRef.current = result.next
            restoreSnapshot(result.snapshot, set)
            syncHistoryFlags?.()
          },

          // --- 공통 ---
          clearError: () => set({ error: null }),
          reset: () => {
            clearHistory()
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
              canUndo: false,
              canRedo: false,
            })
          },
        }),
        {
          name: 'pdf-office-state',
          version: 2,
          // IndexedDB 어댑터: Uint8Array(bytes)를 무손실 저장 (JSON 직렬화 X)
          storage: createIdbStorage<Partial<PdfStore>>(),
          // 문서(bytes 포함) + 활성 문서 + 뷰어 상태를 영속화.
          // 휘발성(isLoading/loadingMessage/error)과 미연결 conversionResults는 제외.
          partialize: (s) => ({
            documents: s.documents,
            activeDocId: s.activeDocId,
            viewer: s.viewer,
            editMode: s.editMode,
          }),
          // 비동기 IndexedDB rehydrate 완료 시 호출.
          // 복원된 문서가 있는데 activeDocId가 비었으면 첫 문서를 활성화.
          onRehydrateStorage: () => (state, error) => {
            if (error) {
              console.warn('[pdf-store] rehydrate 오류(빈 상태로 시작):', error)
              return
            }
            if (
              state &&
              state.documents.length > 0 &&
              !state.documents.some((d) => d.id === state.activeDocId)
            ) {
              state.activeDocId = state.documents[0].id
            }
          },
        },
      ),
    ),
    { name: 'PdfOfficeStore' },
  ),
)

// --- 히스토리 플래그 동기화 바인딩 (P1-8) ---------------------------------
//
// historyRef 변경 시 스토어의 canUndo/canRedo 불리언을 실제 스택 상태와
// 일치시킨다. 스토어 생성 이후에만 setState 가능하므로 여기서 지연 바인딩.
// 값이 실제로 바뀔 때만 set 호출(불필요한 리렌더 방지).

syncHistoryFlags = () => {
  const nextCanUndo = historyCanUndo(historyRef.current)
  const nextCanRedo = historyCanRedo(historyRef.current)
  const s = usePdfStore.getState()
  if (s.canUndo !== nextCanUndo || s.canRedo !== nextCanRedo) {
    usePdfStore.setState({ canUndo: nextCanUndo, canRedo: nextCanRedo })
  }
}

// --- 이탈 경고 + 영속 flush (모듈 레벨, 엔진 소유) -------------------------
//
// documents 가 1개 이상이고 마지막 영속 저장 이후 변경분이 남아있으면
// 브라우저 기본 이탈 경고를 띄운다. 동시에 디바운스 대기 중인
// IndexedDB 쓰기를 즉시 flush 해 손실 가능성을 최소화한다.
//
// 컴포넌트 파일은 건드리지 않고 이 엔진 소유 파일 내에서만 처리한다.

if (typeof window !== 'undefined') {
  // 마지막 영속 반영 이후 변경 여부.
  // 초기값 false: rehydrate 직후(변경 없음) 경고하지 않음.
  let dirty = false

  // 영속 대상 슬라이스만 구독해 변경 시 dirty 마킹.
  usePdfStore.subscribe(
    (s) => ({
      documents: s.documents,
      activeDocId: s.activeDocId,
      viewer: s.viewer,
      editMode: s.editMode,
    }),
    () => {
      dirty = true
    },
    {
      equalityFn: (a, b) =>
        a.documents === b.documents &&
        a.activeDocId === b.activeDocId &&
        a.viewer === b.viewer &&
        a.editMode === b.editMode,
    },
  )

  window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
    const hasDocs = usePdfStore.getState().documents.length > 0
    if (!hasDocs) return

    // 대기 중인 디바운스 저장을 즉시 트리거(완료는 비동기지만
    // 대용량 IndexedDB 쓰기는 unload 중에도 best-effort 로 진행됨).
    flushPersist()

    if (dirty) {
      // 표준 + 레거시 브라우저 모두 대응한 이탈 확인 프롬프트.
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
  })

  // IndexedDB 영속 저장 1회가 디스크에 반영 완료되면 dirty 해제.
  // (디바운스 쓰기 완료 콜백 — 다음 사용자 변경 전까지 이탈 경고 억제)
  onPersistSettled(() => {
    dirty = false
  })

  // 비동기 rehydrate 가 끝나면 그 과정에서 발생한 상태 주입은
  // "사용자 변경"이 아니므로 dirty 를 초기화한다.
  // (복원만 된 페이지에서 편집 없이 이탈 시 불필요한 경고 방지)
  usePdfStore.persist?.onFinishHydration?.(() => {
    dirty = false
  })
}

// --- Selectors -------------------------------------------------------------

export const selectActiveDoc = (s: PdfStore): PdfDocument | null =>
  s.documents.find((d) => d.id === s.activeDocId) ?? null

export const selectActivePages = (s: PdfStore) => selectActiveDoc(s)?.pages ?? []

export const selectIsAnySelected = (s: PdfStore) => s.selectedPages.length > 0

export const selectCanMerge = (s: PdfStore) => s.documents.length >= 2
