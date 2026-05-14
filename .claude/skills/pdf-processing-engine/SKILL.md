---
name: pdf-processing-engine
description: PDF 처리 엔진을 구현하는 스킬. pdfjs-dist로 PDF를 로드/렌더링하고, pdf-lib로 페이지 삭제/순서변경/병합/텍스트편집을 수행하며, Zustand 스토어를 구현한다. PDF 파싱, 조작, 상태관리 구현이 필요하면 반드시 이 스킬을 사용할 것.
---

# PDF Processing Engine Skill

## 목표

pdfjs-dist(읽기)와 pdf-lib(쓰기)를 결합하여 PDF 처리 파이프라인과 Zustand 상태 관리를 구현한다.

## 라이브러리 역할 분리

| 라이브러리 | 역할 | 출력 |
|-----------|------|------|
| pdfjs-dist | 로드, 파싱, 렌더링, 텍스트 추출 | Canvas, ImageData, string |
| pdf-lib | 페이지 조작, 병합, 저장 | Uint8Array |

두 라이브러리는 `Uint8Array`로 데이터를 교환한다.

## 구현 파일별 가이드

### worker-config.ts

```typescript
import * as pdfjsLib from 'pdfjs-dist'

// Next.js 환경에서 Worker 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
```

### loader.ts

```typescript
import * as pdfjsLib from 'pdfjs-dist'
import './worker-config'

export async function loadPdfDocument(bytes: Uint8Array) {
  return pdfjsLib.getDocument({ data: bytes }).promise
}

export async function getPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await loadPdfDocument(bytes)
  return doc.numPages
}
```

### renderer.ts — 썸네일 생성 (중요)

```typescript
export async function renderPageThumbnail(
  bytes: Uint8Array,
  pageIndex: number,  // 0-based
  scale = 0.3
): Promise<string> {
  const doc = await loadPdfDocument(bytes)
  const page = await doc.getPage(pageIndex + 1)  // pdfjs는 1-based
  const viewport = page.getViewport({ scale })
  
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  
  await page.render({
    canvasContext: canvas.getContext('2d')!,
    viewport
  }).promise
  
  return canvas.toDataURL('image/jpeg', 0.7)
}
```

### manipulator.ts — 핵심 PDF 조작

모든 함수는 순수 함수: `Uint8Array → Uint8Array`

```typescript
import { PDFDocument, degrees } from 'pdf-lib'

export async function deletePages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  // 높은 인덱스부터 삭제 (인덱스 시프트 방지)
  ;[...indices].sort((a, b) => b - a).forEach(i => doc.removePage(i))
  return doc.save()
}

export async function reorderPages(bytes: Uint8Array, newOrder: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes)
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, newOrder)
  pages.forEach(p => out.addPage(p))
  return out.save()
}

export async function mergeDocuments(bytesArray: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create()
  for (const bytes of bytesArray) {
    const doc = await PDFDocument.load(bytes)
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    pages.forEach(p => merged.addPage(p))
  }
  return merged.save()
}

export async function rotatePage(bytes: Uint8Array, pageIndex: number, deg: 90 | 180 | 270): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  const page = doc.getPage(pageIndex)
  page.setRotation(degrees(deg))
  return doc.save()
}
```

### pdf-store.ts — Zustand 스토어

```typescript
import { create } from 'zustand'
import type { PdfStore } from '@/lib/types'

export const usePdfStore = create<PdfStore>((set, get) => ({
  documents: [],
  activeDocId: null,
  selectedPages: [],
  editMode: 'view',
  isLoading: false,
  error: null,

  loadDocument: async (file: File) => {
    set({ isLoading: true, error: null })
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      // pdfjs로 페이지 수 파악, 썸네일 생성...
      // 스토어에 document 추가
    } catch (e) {
      set({ error: (e as Error).message })
    } finally {
      set({ isLoading: false })
    }
  },

  applyOperation: async (op) => {
    const { documents, activeDocId } = get()
    const doc = documents.find(d => d.id === activeDocId)
    if (!doc) return
    
    set({ isLoading: true })
    try {
      let newBytes: Uint8Array
      if (op.type === 'delete') newBytes = await deletePages(doc.bytes, op.pageIndices)
      else if (op.type === 'reorder') newBytes = await reorderPages(doc.bytes, op.newOrder)
      else if (op.type === 'merge') { /* ... */ }
      // 스토어 업데이트
    } finally {
      set({ isLoading: false })
    }
  },

  exportDocument: async (docId: string) => {
    const doc = get().documents.find(d => d.id === docId)
    if (!doc) return
    const blob = new Blob([doc.bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = doc.name
    a.click()
    URL.revokeObjectURL(url)
  },

  clearError: () => set({ error: null })
}))
```

## Next.js 설정 (next.config.ts)

```typescript
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias.canvas = false  // pdfjs canvas polyfill 비활성화
    return config
  }
}
```

## 완료 기준

- 모든 조작 함수가 `Uint8Array → Uint8Array` 순수 함수
- Worker 설정이 next.config.ts + worker-config.ts에 올바르게 구성됨
- Zustand 스토어가 api-interfaces.ts의 PdfStore 인터페이스 구현
- TypeScript 오류 없음
