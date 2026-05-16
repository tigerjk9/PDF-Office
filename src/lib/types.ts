/**
 * PDF Office — 공유 TypeScript 타입 정의
 *
 * 모든 에이전트(UI/Engine/AI)가 이 파일을 단일 진실 소스(SSOT)로 참조한다.
 * 런타임 코드는 포함하지 않으며 순수 타입만 정의한다.
 *
 * 원본 SSOT: _workspace/01_architecture/api-interfaces.ts
 */

// ---------------------------------------------------------------------------
// 1. 원시(Primitive) 별칭
// ---------------------------------------------------------------------------

/** UUID v4 형식의 문서 고유 ID */
export type DocId = string

/** 0-based 페이지 인덱스 */
export type PageIndex = number

/** PDF 페이지 회전 각도 (시계 방향) */
export type RotationDegrees = 0 | 90 | 180 | 270

/** 데이터 URL (예: "data:image/png;base64,...") */
export type DataUrl = string

/** AI 변환 제공자 식별자 */
export type AIProvider = 'claude' | 'gemini' | 'openai'

// ---------------------------------------------------------------------------
// 2. PDF 문서 / 페이지
// ---------------------------------------------------------------------------

export interface PdfDocument {
  id: DocId
  name: string
  bytes: Uint8Array
  pageCount: number
  pages: PdfPage[]
  createdAt: number
  modifiedAt?: number
  sizeBytes: number
}

export interface PdfPage {
  index: PageIndex
  docId: DocId
  thumbnail?: DataUrl
  selected: boolean
  width: number
  height: number
  rotation: RotationDegrees
}

// ---------------------------------------------------------------------------
// 3. 편집 작업 (PdfOperation)
// ---------------------------------------------------------------------------

export type PdfOperation =
  | DeletePagesOperation
  | ReorderPagesOperation
  | MergeDocumentsOperation
  | RotatePageOperation
  | ExtractPagesOperation
  | InsertBlankPageOperation
  | InsertPagesFromDocOperation
  | WatermarkOperation

export interface DeletePagesOperation {
  type: 'delete'
  docId: DocId
  pageIndices: PageIndex[]
}

export interface ReorderPagesOperation {
  type: 'reorder'
  docId: DocId
  newOrder: PageIndex[]
}

export interface MergeDocumentsOperation {
  type: 'merge'
  docIds: DocId[]
  outputName?: string
}

export interface RotatePageOperation {
  type: 'rotate'
  docId: DocId
  pageIndex: PageIndex
  degrees: 90 | 180 | 270
}

/** 선택 페이지를 새 문서로 추출/분할 (P2-5). 새 PdfDocument 생성. */
export interface ExtractPagesOperation {
  type: 'extract'
  docId: DocId
  pageIndices: PageIndex[]
  outputName?: string
}

/** 빈 페이지 삽입 (P2-5). atIndex 위치에 삽입(해당 위치 앞). */
export interface InsertBlankPageOperation {
  type: 'insertBlank'
  docId: DocId
  atIndex: PageIndex
  /** 미지정 시 atIndex 인접 페이지 크기 또는 A4 기본 */
  size?: { width: number; height: number }
}

/** 다른 문서의 페이지를 현재 문서에 삽입 (P2-5). */
export interface InsertPagesFromDocOperation {
  type: 'insertFrom'
  docId: DocId
  sourceDocId: DocId
  sourcePageIndices: PageIndex[]
  atIndex: PageIndex
}

/** 모든 페이지에 텍스트 워터마크 적용 (P2-8). 문서 ID 유지. */
export interface WatermarkOperation {
  type: 'watermark'
  docId: DocId
  text: string
  /** 0~1, 기본 0.15 */
  opacity?: number
  fontSize?: number
  /** 대각선 등 회전 각도(도). 기본 45 */
  rotationDeg?: number
}

/** 엔진 실행 결과 */
export interface ApplyOperationResult {
  success: boolean
  document?: PdfDocument
  warning?: string
  error?: PdfError
}

// ---------------------------------------------------------------------------
// 4. Zustand 스토어 인터페이스
// ---------------------------------------------------------------------------

export type EditMode = 'view' | 'edit' | 'merge'

export interface ViewerState {
  currentPageIndex: PageIndex
  zoom: number
  fitMode: 'fit-width' | 'fit-page' | null
}

export interface PdfStore {
  // --- 상태 ---
  documents: PdfDocument[]
  activeDocId: DocId | null
  selectedPages: PageIndex[]
  editMode: EditMode
  viewer: ViewerState
  isLoading: boolean
  loadingMessage: string | null
  error: PdfError | null
  conversionResults: Record<DocId, ConversionResult>
  /** Undo 스택에 되돌릴 작업이 있는지 (P1-8) */
  canUndo: boolean
  /** Redo 스택에 다시 적용할 작업이 있는지 (P1-8) */
  canRedo: boolean

  // --- 액션: 문서 ---
  loadDocument: (file: File) => Promise<void>
  loadDocuments: (files: File[]) => Promise<void>
  /** 암호화 PDF를 비밀번호로 재시도 로드 (P2-8). */
  loadEncryptedDocument: (file: File, password: string) => Promise<void>
  removeDocument: (docId: DocId) => void
  setActiveDoc: (docId: DocId | null) => void

  // --- 액션: 편집 ---
  applyOperation: (op: PdfOperation) => Promise<ApplyOperationResult>
  exportDocument: (docId: DocId, fileName?: string) => Promise<void>

  // --- 액션: 선택/뷰어 ---
  togglePageSelection: (pageIndex: PageIndex) => void
  selectPages: (pageIndices: PageIndex[]) => void
  clearSelection: () => void
  setEditMode: (mode: EditMode) => void
  setZoom: (zoom: number) => void
  setFitMode: (mode: ViewerState['fitMode']) => void
  setCurrentPage: (pageIndex: PageIndex) => void

  // --- 액션: AI ---
  convertToMarkdown: (docId: DocId, options: ConversionOptions) => Promise<ConversionResult>

  // --- 액션: 히스토리 (P1-8) ---
  /** 직전 편집 작업(삭제/회전/순서변경/병합)을 되돌린다. */
  undo: () => void
  /** 되돌린 작업을 다시 적용한다. */
  redo: () => void

  // --- 액션: 공통 ---
  clearError: () => void
  reset: () => void
}

// ---------------------------------------------------------------------------
// 5. AI 변환
// ---------------------------------------------------------------------------

export interface ConversionOptions {
  provider: AIProvider
  /** 변환 범위 (P2-2). 'range'면 pageRange, 'selected'면 pages 사용. 미지정=all */
  scope?: 'all' | 'current' | 'selected' | 'range'
  /** scope='range'일 때 사용 (start..end, 0-based 포함 범위) */
  pageRange?: { start: PageIndex; end: PageIndex }
  /** scope='selected'/'current'일 때 변환할 페이지 인덱스 목록 (P2-2) */
  pages?: PageIndex[]
  quality?: 'fast' | 'balanced' | 'high'
  customPrompt?: string
  apiKey?: string
}

export interface ConversionResult {
  markdown: string
  tokensUsed: number
  provider: AIProvider
  model: string
  completedAt: number
  durationMs: number
  pagesConverted: number
}

// ---------------------------------------------------------------------------
// 6. 엔진(Engine) 어댑터 시그니처
// ---------------------------------------------------------------------------

export interface PdfEngine {
  parse(bytes: Uint8Array, name: string): Promise<PdfDocument>
  delete(doc: PdfDocument, pageIndices: PageIndex[]): Promise<PdfDocument>
  reorder(doc: PdfDocument, newOrder: PageIndex[]): Promise<PdfDocument>
  merge(docs: PdfDocument[], outputName: string): Promise<PdfDocument>
  rotate(doc: PdfDocument, pageIndex: PageIndex, degrees: RotationDegrees): Promise<PdfDocument>
  serialize(doc: PdfDocument): Promise<Uint8Array>
}

export interface PdfRenderer {
  renderPage(
    doc: PdfDocument,
    pageIndex: PageIndex,
    canvas: HTMLCanvasElement,
    scale: number,
  ): Promise<void>
  renderThumbnail(doc: PdfDocument, pageIndex: PageIndex): Promise<DataUrl>
  extractText(doc: PdfDocument, pageIndex: PageIndex): Promise<string>
  dispose(docId: DocId): void
}

// ---------------------------------------------------------------------------
// 7. AI 제공자 어댑터
// ---------------------------------------------------------------------------

export interface AIConversionProvider {
  readonly name: AIProvider
  readonly defaultModel: string
  convert(input: AIConversionInput): Promise<ConversionResult>
}

export interface AIConversionInput {
  pages: Array<{
    index: PageIndex
    text: string
    imageBase64?: string
  }>
  options: ConversionOptions
}

// ---------------------------------------------------------------------------
// 8. 에러 표준화
// ---------------------------------------------------------------------------

export type PdfErrorCode =
  | 'INVALID_FILE'
  | 'PARSE_FAILED'
  | 'ENCRYPTED_PDF'
  | 'OPERATION_FAILED'
  | 'EXPORT_FAILED'
  | 'AI_API_ERROR'
  | 'AI_QUOTA_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN'

export interface PdfError {
  code: PdfErrorCode
  message: string
  cause?: unknown
  recoverable: boolean
}

// ---------------------------------------------------------------------------
// 9. 컴포넌트 props 공통 타입
// ---------------------------------------------------------------------------

export interface DropzoneProps {
  onFilesAccepted: (files: File[]) => void
  maxFiles?: number
  maxSizeBytes?: number
  disabled?: boolean
}

export interface PageThumbnailProps {
  page: PdfPage
  isActive: boolean
  onClick: (index: PageIndex) => void
  onSelect: (index: PageIndex, multi: boolean) => void
  onRotate?: (index: PageIndex, degrees: 90 | 180 | 270) => void
  onDelete?: (index: PageIndex) => void
}

export interface ViewerCanvasProps {
  doc: PdfDocument
  pageIndex: PageIndex
  zoom: number
  fitMode: ViewerState['fitMode']
}

export interface ConversionPanelProps {
  doc: PdfDocument
  onConvert: (options: ConversionOptions) => Promise<void>
  result?: ConversionResult
  isConverting: boolean
}
