# PDF Office 뷰어 UX 개선 Phase 1 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF Office에 연속 스크롤 뷰어(기본)·보기모드 토글·줌/팬·키보드 스크롤·순서버튼 명료화·회전 아이콘 교체를 추가한다.

**Architecture:** `PdfViewer`를 모드 스위치 셸로 축소하고, 기존 단일 페이지 로직은 동작 변경 없이 `SinglePageViewer`로 이전한다. 신규 `ContinuousViewer`는 IntersectionObserver 윈도잉 + 페이지당 박스 사전 예약 + 활성 문서 1개를 공유하는 pdfjs 문서 캐시(`doc-cache`)로 100+페이지에서 메모리 안전하게 동작한다. 스크롤↔현재페이지는 억제 플래그 + rAF로 양방향 동기화한다.

**Tech Stack:** Next.js 16 App Router, TypeScript 5.6, React 19 RC, Zustand 5(persist+IndexedDB), pdfjs-dist 4.7, lucide-react, Tailwind v3.

**검증 모델 (중요):** 이 프로젝트는 **단위 테스트 러너가 없다**(`package.json`에 jest/vitest/test 스크립트 부재). 확립된 검증은 `npm run type-check`(`tsc --noEmit`) + `npm run lint`(`next lint`) + `npm run build` + **브라우저 도그푸딩**이며(승인 spec §10 및 프로젝트 전 이력과 일치), 본 계획은 이 모델을 따른다. 각 태스크는 코드 작성 → 정적 검증(type-check/lint) → (해당 시) build → **구체적 도그푸딩 절차+기대 관찰** → 커밋 순으로 진행한다. 순수 로직 모듈은 정확한 입출력 명세를 두고 통합 도그푸딩으로 수용한다.

**준비물:** 테스트용 멀티페이지 PDF(20+ 페이지 권장, 일부 가로/세로 혼재 또는 회전 가능 파일). 회귀 도그푸딩에 100+페이지 PDF 1개 추가 권장.

**SSOT 주의:** 타입은 `src/lib/types.ts`가 단일 진실 소스. `src/types/pdf.ts`는 re-export 배럴이므로 별도 수정 불필요.

---

## File Structure

**신규 (Create)**
- `src/lib/pdf/page-box.ts` — `computePageBox()` 순수 헬퍼(페이지 종횡비 → px 박스·scale; 회전 스왑·fit 모드 포함). 단일/연속 뷰어 공용.
- `src/lib/pdf/doc-cache.ts` — `acquirePdfDoc(bytes)`/`releasePdfDoc(bytes)` 참조카운트 캐시. **bytes 참조 키잉**(WeakMap), 활성 1개만 유지.
- `src/components/viewer/SinglePageViewer.tsx` — 기존 `PdfViewer` 로직을 동작 변경 없이 이전.
- `src/components/viewer/PageSlot.tsx` — 연속 뷰어의 페이지 1개 슬롯(박스 예약 + 가시 시 캔버스 / 비가시 시 썸네일 / 슬롯 단위 에러·재시도).
- `src/components/viewer/ContinuousViewer.tsx` — 스크롤 컨테이너 + 슬롯 매핑 + IntersectionObserver + 줌/팬.
- `src/hooks/useViewerScrollSync.ts` — 스크롤↔`currentPageIndex` 양방향 동기화(억제 플래그·rAF) 캡슐화.

**수정 (Modify)**
- `src/lib/types.ts` — `ViewMode` 타입, `ViewerState.viewMode`, `PdfStore.setViewMode`.
- `src/lib/store/pdf-store.ts` — `initialViewer.viewMode`, `setViewMode`, persist `version 3` + `migrate`.
- `src/lib/pdf/renderer.ts` — `renderPageToCanvas`에 선택적 `doc` 주입(폴백 보존).
- `src/components/viewer/PdfViewer.tsx` — 모드 스위치 셸로 축소.
- `src/components/viewer/ZoomControl.tsx` — `보기 모드` 세그먼트 추가, 연속 모드에서 `fit-page` 숨김.
- `src/hooks/useKeyboardShortcuts.ts` — 연속 모드 스크롤 키.
- `src/components/toolbar/EditorToolbar.tsx` — 순서 버튼 그룹·라벨·툴팁, `RotateCw→RotateCwSquare`.
- `src/components/pages/PageThumbnail.tsx` — 회전 아이콘 `RotateCw→RotateCwSquare` 정렬.
- `src/components/help/HelpSheet.tsx` — 드래그 재정렬·연속 스크롤 1~2줄 안내.

---

## Task 1: 타입·스토어·persist 마이그레이션 (viewMode 배관)

**Files:**
- Modify: `src/lib/types.ts:145-149` (ViewerState), `src/lib/types.ts` (PdfStore 액션 영역, `setFitMode` 인접)
- Modify: `src/lib/store/pdf-store.ts:97-101` (initialViewer), `:795-796` (setFitMode 인접에 setViewMode), `:877-906` (persist 옵션)

- [ ] **Step 1: types.ts — ViewMode 타입과 ViewerState 필드 추가**

`src/lib/types.ts`의 `EditMode` 정의(현재 143행 `export type EditMode = 'view' | 'edit' | 'merge'`) 바로 아래에 추가:

```ts
/** 뷰어 보기 모드. Phase 2에서 'spread'(2페이지) 추가 예정. */
export type ViewMode = 'continuous' | 'single'
```

`ViewerState`(현재 145-149행)를 다음으로 교체:

```ts
export interface ViewerState {
  currentPageIndex: PageIndex
  zoom: number
  fitMode: 'fit-width' | 'fit-page' | null
  viewMode: ViewMode
}
```

- [ ] **Step 2: types.ts — PdfStore에 setViewMode 액션 시그니처 추가**

`src/lib/types.ts`에서 `setFitMode: (mode: ViewerState['fitMode']) => void` 행(현재 185행) 바로 아래에 추가:

```ts
  setViewMode: (mode: ViewMode) => void
```

- [ ] **Step 3: store — initialViewer에 viewMode 기본값**

`src/lib/store/pdf-store.ts`의 `initialViewer`(97-101행)를 교체:

```ts
const initialViewer: ViewerState = {
  currentPageIndex: 0,
  zoom: 1.0,
  fitMode: 'fit-width',
  viewMode: 'continuous',
}
```

`src/lib/store/pdf-store.ts` 상단 타입 import(59-71행 `import type { ... } from '@/lib/types'`)에 `ViewMode` 추가:

```ts
  ViewerState,
  ViewMode,
} from '@/lib/types'
```
(기존 마지막 항목 `ViewerState,` 뒤에 `ViewMode,` 추가 — 알파벳/논리 순서 무관, 타입 import이므로 트리셰이크 영향 없음)

- [ ] **Step 4: store — setViewMode 액션 추가**

`src/lib/store/pdf-store.ts`에서 `setFitMode`(795-796행) 정의:
```ts
          setFitMode: (fitMode) =>
            set((s) => ({ viewer: { ...s.viewer, fitMode } })),
```
바로 아래에 추가:

```ts
          setViewMode: (viewMode: ViewMode) =>
            set((s) => ({ viewer: { ...s.viewer, viewMode } })),
```

- [ ] **Step 5: store — persist version 3 + migrate**

`src/lib/store/pdf-store.ts` persist 옵션 객체(877행 `{` ~ `name: 'pdf-office-state'`, `version: 2` 영역). 현재:
```ts
        {
          name: 'pdf-office-state',
          version: 2,
          storage: createIdbStorage<Partial<PdfStore>>(),
          partialize: (s) => ({
```
를 다음으로 교체(`version: 3` + `migrate` 추가, 나머지 라인 보존):

```ts
        {
          name: 'pdf-office-state',
          version: 3,
          storage: createIdbStorage<Partial<PdfStore>>(),
          // v2 이하(또는 viewMode 부재) 영속 상태 → 연속 스크롤을 기본으로 주입.
          // 기존 사용자는 fitMode만 저장돼 있으므로 viewMode 없으면 'continuous'.
          migrate: (persisted: unknown, version: number) => {
            const state = persisted as Partial<PdfStore> | undefined
            if (!state || !state.viewer) return state as Partial<PdfStore>
            const v = state.viewer as Partial<ViewerState>
            if (version < 3 || !v.viewMode) {
              return {
                ...state,
                viewer: {
                  ...(state.viewer as ViewerState),
                  viewMode: 'continuous' as ViewMode,
                },
              }
            }
            return state
          },
          partialize: (s) => ({
```
(이후 `partialize` 본문·`onRehydrateStorage`는 그대로 유지)

- [ ] **Step 6: 정적 검증**

Run: `npm run type-check`
Expected: 에러 0 (특히 `ViewerState`를 만족하지 않는 객체 리터럴이 없어야 함 — `initialViewer`에 `viewMode` 추가했으므로 통과)

Run: `npm run lint`
Expected: 신규/수정 라인 관련 경고 0

- [ ] **Step 7: 빌드 검증**

Run: `npm run build`
Expected: exit 0, 빌드 성공

- [ ] **Step 8: 도그푸딩 — persist & 마이그레이션**

Run: `npm run dev` → 브라우저 `http://localhost:3000`

1. 기존에 문서를 올린 적 있으면(IndexedDB에 v2 상태 존재) 페이지 로드 시 콘솔 오류 없이 정상 진입하는지 확인.
2. 새 PDF 업로드 → DevTools → Application → IndexedDB → `pdf-office-state` 확인: 저장 객체의 `viewer.viewMode === "continuous"`, 루트 `version === 3`.
3. 새로고침 → 동일하게 복원(오류·빈 화면 없음).

Expected: 마이그레이션·신규 모두 `viewMode: "continuous"`, version 3. 앱 정상 동작(기존 단일 페이지 렌더 그대로 — 이 시점엔 UI 미변경).

- [ ] **Step 9: 커밋**

```bash
git add src/lib/types.ts src/lib/store/pdf-store.ts
git commit -m "feat: ViewerState.viewMode 추가 + persist v3 마이그레이션(연속 기본)"
```

---

## Task 2: page-box.ts — 박스/스케일 순수 헬퍼 추출

**Files:**
- Create: `src/lib/pdf/page-box.ts`
- Modify: `src/components/viewer/PdfViewer.tsx:74-97` (boxSize useMemo가 헬퍼를 호출하도록 — 픽셀 동등성으로 추출 정확성 검증)

- [ ] **Step 1: page-box.ts 작성**

`src/lib/pdf/page-box.ts`:

```ts
/**
 * 페이지 표시 박스(px)와 렌더 스케일 계산 — 단일/연속 뷰어 공용 순수 함수.
 *
 * 기존 PdfViewer.boxSize useMemo 로직을 무변경 추출한 것이다.
 *  - 회전 90/270 → 종횡비 스왑
 *  - fit-width: 가용 폭에 맞춤 / fit-page: 가용 폭·높이 중 작은 쪽 / null: zoom 그대로
 *  - 컨테이너 padding 보정(기본 48 = Tailwind p-6 24*2)
 */
import type { PdfPage, ViewerState } from '@/lib/types'

export interface PageBox {
  /** 박스 너비(px, 정수) */
  w: number
  /** 박스 높이(px, 정수) */
  h: number
  /** pdfjs viewport 스케일 */
  scale: number
}

/** 컨테이너 padding 보정 기본값 (Tailwind p-6 = 24px * 2) */
export const DEFAULT_CONTAINER_PAD = 48

export function computePageBox(
  page: Pick<PdfPage, 'width' | 'height' | 'rotation'>,
  opts: {
    zoom: number
    fitMode: ViewerState['fitMode']
    /** 컨테이너 가용 너비(px, padding 포함 전 값) */
    availW: number
    /** 컨테이너 가용 높이(px, padding 포함 전 값) */
    availH: number
    /** padding 보정값(기본 48). 슬롯 등 padding 다를 때 0 전달 */
    pad?: number
  },
): PageBox {
  const pad = opts.pad ?? DEFAULT_CONTAINER_PAD
  const availW = Math.max(opts.availW - pad, 100)
  const availH = Math.max(opts.availH - pad, 100)

  const rotated = page.rotation === 90 || page.rotation === 270
  const pw = rotated ? page.height : page.width
  const ph = rotated ? page.width : page.height

  let scale = opts.zoom
  if (opts.fitMode === 'fit-width') {
    scale = availW / pw
  } else if (opts.fitMode === 'fit-page') {
    scale = Math.min(availW / pw, availH / ph)
  }

  return {
    w: Math.max(Math.round(pw * scale), 1),
    h: Math.max(Math.round(ph * scale), 1),
    scale,
  }
}
```

- [ ] **Step 2: PdfViewer가 헬퍼를 사용하도록 교체 (픽셀 동등성 검증용)**

`src/components/viewer/PdfViewer.tsx` 상단 import에 추가:
```ts
import { computePageBox } from '@/lib/pdf/page-box'
```

`boxSize` useMemo(74-97행) 전체를 다음으로 교체:

```ts
  // 표시될 페이지 박스 크기(px) — 렌더 전에도 동일 계산으로 미리 예약 (R2-6 b)
  const boxSize = useMemo(() => {
    if (!page) return null
    return computePageBox(page, {
      zoom,
      fitMode,
      availW: containerSize.w,
      availH: containerSize.h,
    })
  }, [page, zoom, fitMode, containerSize.w, containerSize.h])
```

- [ ] **Step 3: 정적 검증**

Run: `npm run type-check`
Expected: 에러 0

Run: `npm run lint`
Expected: 경고 0 (미사용 import 없음 — `useMemo`는 여전히 사용)

- [ ] **Step 4: 도그푸딩 — 단일 페이지 픽셀 동등성(추출 정확성)**

Run: `npm run dev`

1. 멀티페이지 PDF 업로드. 첫 페이지가 추출 전과 **시각적으로 동일**(크기·여백·선명도)한지 확인.
2. 줌 슬라이더 50%/100%/200%, `너비 맞춤`/`페이지 맞춤` 토글, 회전된 페이지(썸네일 회전 버튼으로 90° 적용 후) — 모두 추출 전과 동일하게 렌더되는지.
3. 창 크기 리사이즈 시 레이아웃 점프 없는지(기존 동작 보존).

Expected: 모든 케이스에서 추출 전과 동일. 회귀 0.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/pdf/page-box.ts src/components/viewer/PdfViewer.tsx
git commit -m "refactor: 박스/스케일 계산을 page-box.ts 순수 헬퍼로 추출 (동작 불변)"
```

---

## Task 3: doc-cache.ts + 렌더러 doc 주입 (재파싱 제거)

**Files:**
- Create: `src/lib/pdf/doc-cache.ts`
- Modify: `src/lib/pdf/renderer.ts:12-17` (RenderOptions), `:44-101` (renderPageToCanvas)

- [ ] **Step 1: doc-cache.ts 작성**

`src/lib/pdf/doc-cache.ts`:

```ts
/**
 * 활성 문서용 pdfjs PDFDocumentProxy 공유 캐시.
 *
 * 배경: renderer.renderPageToCanvas 는 호출마다 loadPdfDocument(bytes) →
 * doc.destroy() 로 전체 PDF를 재파싱한다. 연속 스크롤은 동시에 여러 페이지를
 * 렌더하고 스크롤마다 재렌더하므로 재파싱이 치명적이다.
 *
 * 키잉: docId 가 아니라 bytes 참조(identity)로 키잉한다. 편집(delete/rotate/
 * reorder/insert/watermark)은 동일 docId 로 '새 bytes' 를 만들므로 docId
 * 키잉은 stale 렌더를 유발한다. loader.loadPdfDocument 는 입력 bytes 를
 * 내부 방어 복사하므로(원본 detach 안 됨) 스토어의 bytes 참조는 안정적 →
 * WeakMap<Uint8Array> 키가 정확하고 GC 친화적이다.
 *
 * 메모리 상한: 활성 bytes 1개만 유지. 새 bytes 를 acquire 하면 이전 1개를
 * 강제 destroy 한다(참조 카운트와 무관 — 활성 문서 전환/편집 시 이전 문서
 * 슬롯들은 이미 cancel/unmount 되는 흐름).
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadPdfDocument } from './loader'

interface Entry {
  bytes: Uint8Array
  promise: Promise<PDFDocumentProxy>
  refs: number
}

const cache = new WeakMap<Uint8Array, Entry>()
/** 현재 활성(가장 최근 acquire) bytes — 상한 1개 유지용 */
let activeKey: Uint8Array | null = null
let activeEntry: Entry | null = null

async function destroyEntry(entry: Entry): Promise<void> {
  try {
    const doc = await entry.promise
    await doc.destroy()
  } catch {
    // 로드 실패 또는 이미 destroy 된 경우 — 무시
  }
}

/**
 * bytes 에 대한 PDFDocumentProxy 를 획득(없으면 1회 로드). 참조 +1.
 * 다른 bytes 였다면 이전 활성 항목을 즉시 destroy(상한 1개).
 */
export function acquirePdfDoc(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  let entry = cache.get(bytes)
  if (!entry) {
    entry = { bytes, promise: loadPdfDocument(bytes), refs: 0 }
    cache.set(bytes, entry)
  }
  entry.refs += 1

  if (activeKey !== bytes) {
    const prev = activeEntry
    if (prev && prev !== entry) {
      void destroyEntry(prev)
      cache.delete(prev.bytes)
    }
    activeKey = bytes
    activeEntry = entry
  }
  return entry.promise
}

/** 참조 -1. 0이 되면 destroy(단, 현재 활성 항목이면 다음 전환까지 보존). */
export function releasePdfDoc(bytes: Uint8Array): void {
  const entry = cache.get(bytes)
  if (!entry) return
  entry.refs = Math.max(0, entry.refs - 1)
  if (entry.refs === 0 && activeEntry !== entry) {
    void destroyEntry(entry)
    cache.delete(bytes)
  }
}
```

- [ ] **Step 2: renderer.ts — RenderOptions에 doc 주입 옵션**

`src/lib/pdf/renderer.ts` 상단에 pdfjs 타입 import 추가(9행 `import { loadPdfDocument } from './loader'` 아래):

```ts
import type { PDFDocumentProxy } from 'pdfjs-dist'
```

`RenderOptions`(12-17행)를 교체:

```ts
export interface RenderOptions {
  /** 렌더 배율 (1.0 = 100%) */
  scale: number
  /** 누적 회전 각도 (0/90/180/270). pdfjs viewport에 합성 */
  rotation?: 0 | 90 | 180 | 270
  /**
   * 공유 PDFDocumentProxy 주입(연속 뷰어 — doc-cache).
   * 주어지면 재파싱/ destroy 하지 않는다. 미지정 시 기존 동작(폴백):
   * 호출마다 loadPdfDocument → finally destroy.
   */
  doc?: PDFDocumentProxy
}
```

- [ ] **Step 3: renderer.ts — 주입 시 재파싱/destroy 생략**

`src/lib/pdf/renderer.ts` `renderPageToCanvas`의 promise IIFE(53-88행)를 교체:

```ts
  const promise = (async () => {
    const injected = opts.doc
    const doc = injected ?? (await loadPdfDocument(bytes))
    try {
      if (cancelled) return
      const page = await doc.getPage(pageIndex + 1) // pdfjs는 1-based
      const viewport = page.getViewport({
        scale: opts.scale,
        rotation: opts.rotation ?? 0,
      })

      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D context unavailable')

      // devicePixelRatio 대응 (HiDPI 선명도)
      const dpr =
        typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (cancelled) return
      const task = page.render({ canvasContext: ctx, viewport })
      renderTask = task
      try {
        await task.promise
      } catch (e) {
        if (!isCancelled(e)) throw e
        return // 취소는 정상 흐름 — 조용히 종료
      }
      page.cleanup()
    } finally {
      // 주입 문서는 호출자(doc-cache)가 수명 관리 — 여기서 destroy 금지.
      if (!injected) await doc.destroy()
    }
  })()
```

- [ ] **Step 4: 정적 검증**

Run: `npm run type-check`
Expected: 에러 0

Run: `npm run lint`
Expected: 경고 0

- [ ] **Step 5: 빌드 검증**

Run: `npm run build`
Expected: exit 0

- [ ] **Step 6: 도그푸딩 — 폴백 경로 무변경(회귀 0)**

이 시점에 아직 doc 주입 호출처가 없다(폴백 경로만 사용). 단일 페이지 뷰어가 기존과 동일하게 렌더되는지만 확인:

Run: `npm run dev`
1. 멀티페이지 PDF 업로드 → 페이지 렌더 정상.
2. 페이지 이동(◀▶)·줌·회전 정상, 콘솔 오류 0.
3. 문서 2개 업로드 후 전환 → 각 첫 페이지 정상 렌더.

Expected: 기존과 100% 동일(주입 미사용 경로이므로 무변경). 회귀 0.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/pdf/doc-cache.ts src/lib/pdf/renderer.ts
git commit -m "feat: 공유 pdfjs 문서 캐시(doc-cache) + 렌더러 doc 주입(폴백 보존)"
```

---

## Task 4: PdfViewer 분리 — SinglePageViewer + 모드 스위치 셸

**Files:**
- Create: `src/components/viewer/SinglePageViewer.tsx` (현 PdfViewer 본문 이전)
- Modify: `src/components/viewer/PdfViewer.tsx` (셸로 축소)

- [ ] **Step 1: SinglePageViewer.tsx 생성 (현 PdfViewer 로직 그대로 이전)**

`src/components/viewer/SinglePageViewer.tsx` — 현재 `src/components/viewer/PdfViewer.tsx`의 **전체 내용**을 복사하되, 컴포넌트 이름만 `PdfViewer` → `SinglePageViewer`로 변경하고 Task 2에서 적용한 `computePageBox` 사용 형태를 유지한다. 결과 파일 전문:

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'

import { renderPageToCanvas } from '@/lib/pdf/renderer'
import { computePageBox } from '@/lib/pdf/page-box'
import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'

/**
 * 단일 페이지 Canvas 렌더러 (보기 모드 'single').
 *
 * 기존 PdfViewer 로직을 동작 변경 없이 이전한 것이다(회귀 최소화).
 *  - 페이지 종횡비로 캔버스 박스를 즉시 예약 → 레이아웃 점프 0
 *  - ResizeObserver + 디바운스로 fit-mode 재계산 thrash 제거
 *  - 로딩/에러는 절대 위치 오버레이 → CLS 0
 */
export function SinglePageViewer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const renderHandleRef = useRef<{ cancel: () => void } | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })

  const activeDoc = usePdfStore(selectActiveDoc)
  const pageIndex = usePdfStore((s) => s.viewer.currentPageIndex)
  const zoom = usePdfStore((s) => s.viewer.zoom)
  const fitMode = usePdfStore((s) => s.viewer.fitMode)

  const page = activeDoc?.pages[pageIndex]

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let raf = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const measure = () => {
      const rect = el.getBoundingClientRect()
      setContainerSize((prev) => {
        const next = {
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        }
        if (prev.w === next.w && prev.h === next.h) return prev
        return next
      })
    }

    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(measure)
      }, 120)
    })
    ro.observe(el)
    measure()

    return () => {
      ro.disconnect()
      if (timer) clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [])

  const boxSize = useMemo(() => {
    if (!page) return null
    return computePageBox(page, {
      zoom,
      fitMode,
      availW: containerSize.w,
      availH: containerSize.h,
    })
  }, [page, zoom, fitMode, containerSize.w, containerSize.h])

  useEffect(() => {
    if (!activeDoc || !page || !canvasRef.current || !boxSize) return

    let disposed = false
    renderHandleRef.current?.cancel()

    setIsRendering(true)
    setRenderError(null)

    const handle = renderPageToCanvas(
      activeDoc.bytes,
      pageIndex,
      canvasRef.current,
      { scale: boxSize.scale, rotation: page.rotation },
    )
    renderHandleRef.current = handle

    handle.promise
      .then(() => {
        if (!disposed) setIsRendering(false)
      })
      .catch((err: unknown) => {
        if (disposed) return
        if (err && (err as { name?: string }).name === 'RenderingCancelledException') {
          return
        }
        setRenderError(err instanceof Error ? err.message : '렌더링 실패')
        setIsRendering(false)
      })

    return () => {
      disposed = true
      handle.cancel()
    }
  }, [activeDoc, page, pageIndex, boxSize])

  if (!activeDoc) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        선택된 문서가 없습니다
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full flex-1 items-start justify-center overflow-auto p-6"
      role="region"
      aria-label="PDF 뷰어"
    >
      <div
        className="relative flex-shrink-0 rounded-sm bg-background shadow-md ring-1 ring-border"
        style={
          boxSize
            ? { width: boxSize.w, height: boxSize.h }
            : { aspectRatio: '1 / 1.414', width: 'min(60%, 480px)' }
        }
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full rounded-sm"
          aria-label={`${activeDoc.pageCount}페이지 중 ${pageIndex + 1}페이지`}
        />
        {isRendering && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-live="polite"
          >
            <span className="flex items-center gap-2 rounded-md border border-border bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-[1px]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              <span>렌더링 중…</span>
            </span>
          </div>
        )}
        {renderError && (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-sm bg-background/95 p-4 text-center"
          >
            <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
            <p className="text-sm font-medium text-foreground">
              페이지를 렌더링하지 못했습니다
            </p>
            <p className="max-w-[28ch] text-xs text-muted-foreground">
              {renderError}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: PdfViewer.tsx를 모드 스위치 셸로 축소**

`src/components/viewer/PdfViewer.tsx` 전문을 교체:

```tsx
'use client'

import { usePdfStore } from '@/lib/store/pdf-store'
import { SinglePageViewer } from '@/components/viewer/SinglePageViewer'
import { ContinuousViewer } from '@/components/viewer/ContinuousViewer'

/**
 * 뷰어 셸 — viewer.viewMode 에 따라 단일/연속 뷰어를 분기한다.
 * 단일 경로는 SinglePageViewer 로 동작 변경 없이 보존(회귀 최소화).
 */
export function PdfViewer() {
  const viewMode = usePdfStore((s) => s.viewer.viewMode)
  if (viewMode === 'continuous') return <ContinuousViewer />
  return <SinglePageViewer />
}
```

> 주의: 이 단계에서 `ContinuousViewer`는 아직 없으므로 **import가 컴파일 에러**가 된다. Step 3에서 최소 스텁을 먼저 만들어 빌드를 통과시킨다(Task 5에서 실제 구현).

- [ ] **Step 3: ContinuousViewer 최소 스텁 생성(빌드 통과용)**

`src/components/viewer/ContinuousViewer.tsx`:

```tsx
'use client'

/** Task 5에서 구현. 현재는 빌드 통과용 최소 스텁. */
export function ContinuousViewer() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
      연속 보기 준비 중…
    </div>
  )
}
```

- [ ] **Step 4: 정적 검증**

Run: `npm run type-check`
Expected: 에러 0

Run: `npm run build`
Expected: exit 0

- [ ] **Step 5: 도그푸딩 — 모드 분기 동작**

Run: `npm run dev`
1. 새 PDF 업로드 → 기본 `viewMode: continuous` 이므로 **"연속 보기 준비 중…" 스텁**이 보여야 정상(분기 확인).
2. DevTools 콘솔에서 일시적으로 단일 모드 강제: `window.__zustand` 미노출이므로 대신 IndexedDB가 아닌 빠른 확인을 위해 — Task 8에서 토글 UI가 생기기 전이므로, 이 스텝에서는 콘솔에서 `localStorage`가 아닌 store 직접 접근이 어렵다. 대안: 임시로 `initialViewer.viewMode`를 `'single'`로 바꿔 단일 뷰어가 기존과 동일 렌더되는지 1회 확인 후 **되돌린다**(커밋 전 원복 필수).
3. 단일 모드 확인: 기존 단일 페이지 렌더·줌·이동 100% 동일(SinglePageViewer 이전 정확성).

Expected: continuous→스텁, single→기존과 동일. `initialViewer` 원복 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/components/viewer/PdfViewer.tsx src/components/viewer/SinglePageViewer.tsx src/components/viewer/ContinuousViewer.tsx
git commit -m "refactor: PdfViewer를 모드 스위치 셸로 분리 (SinglePageViewer 동작 보존)"
```

---

## Task 5: PageSlot — 페이지 슬롯(박스 예약 + 가시 시 캔버스/비가시 시 썸네일 + 슬롯 에러)

**Files:**
- Create: `src/components/viewer/PageSlot.tsx`

- [ ] **Step 1: PageSlot.tsx 작성**

`src/components/viewer/PageSlot.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'

import { renderPageToCanvas } from '@/lib/pdf/renderer'
import type { PdfPage } from '@/lib/types'
import type { PageBox } from '@/lib/pdf/page-box'

interface PageSlotProps {
  page: PdfPage
  /** 미리 계산된 박스(부모가 computePageBox로 산출) */
  box: PageBox
  /** 공유 pdfjs 문서(doc-cache). null이면 아직 로드 전 → 썸네일만 */
  doc: PDFDocumentProxy | null
  /** 0-based 페이지 인덱스 */
  pageIndex: number
  /** 뷰포트 근접 여부(IntersectionObserver). true일 때만 캔버스 렌더 */
  visible: boolean
  /** 활성 문서 bytes(폴백 렌더용) */
  bytes: Uint8Array
}

/**
 * 연속 뷰어의 페이지 1개 슬롯.
 *  - 박스 크기를 즉시 예약 → 스크롤 중 레이아웃 점프 0
 *  - visible && doc 일 때만 캔버스 렌더(윈도잉). 그 외엔 page.thumbnail
 *  - 렌더 실패는 이 슬롯에만 인라인 표시 + 재시도(전체 뷰어 영향 0)
 */
export function PageSlot({
  page,
  box,
  doc,
  pageIndex,
  visible,
  bytes,
}: PageSlotProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const handleRef = useRef<{ cancel: () => void } | null>(null)
  const [rendered, setRendered] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!visible || !canvasRef.current) return
    let disposed = false
    handleRef.current?.cancel()
    setError(null)

    const handle = renderPageToCanvas(bytes, pageIndex, canvasRef.current, {
      scale: box.scale,
      rotation: page.rotation,
      doc: doc ?? undefined,
    })
    handleRef.current = handle

    handle.promise
      .then(() => {
        if (!disposed) setRendered(true)
      })
      .catch((err: unknown) => {
        if (disposed) return
        if (
          err &&
          (err as { name?: string }).name === 'RenderingCancelledException'
        ) {
          return
        }
        setError(err instanceof Error ? err.message : '렌더링 실패')
      })

    return () => {
      disposed = true
      handle.cancel()
    }
  }, [visible, doc, bytes, pageIndex, box.scale, page.rotation, retryKey])

  return (
    <div
      data-page-index={pageIndex}
      className="relative flex-shrink-0 rounded-sm bg-background shadow-md ring-1 ring-border"
      style={{ width: box.w, height: box.h }}
      aria-label={`${pageIndex + 1}페이지`}
    >
      {/* 비가시: 썸네일 자리표시(이미 존재). 가시: 캔버스 */}
      {!visible && page.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={page.thumbnail}
          alt={`${pageIndex + 1}페이지 미리보기`}
          className="h-full w-full rounded-sm object-contain"
          draggable={false}
        />
      )}
      {!visible && !page.thumbnail && (
        <div className="skeleton-shimmer h-full w-full rounded-sm" aria-hidden />
      )}
      {visible && (
        <canvas
          ref={canvasRef}
          className="block h-full w-full rounded-sm"
          aria-label={`${pageIndex + 1}페이지`}
        />
      )}
      {visible && !rendered && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex items-center gap-2 rounded-md border border-border bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-[1px]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            <span>렌더링 중…</span>
          </span>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-sm bg-background/95 p-4 text-center"
        >
          <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
          <p className="text-sm font-medium text-foreground">
            {pageIndex + 1}페이지 렌더 실패
          </p>
          <button
            type="button"
            onClick={() => {
              setRendered(false)
              setRetryKey((k) => k + 1)
            }}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            다시 시도
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 정적 검증**

Run: `npm run type-check`
Expected: 에러 0 (`PageBox`·`PdfPage`·`renderPageToCanvas` 모두 기존/Task2~3에서 정의됨)

Run: `npm run lint`
Expected: 경고 0

Run: `npm run build`
Expected: exit 0 (아직 미사용 컴포넌트지만 컴파일 가능해야 함)

- [ ] **Step 3: 커밋**

```bash
git add src/components/viewer/PageSlot.tsx
git commit -m "feat: PageSlot — 박스 예약·가시 시 캔버스/비가시 썸네일·슬롯 에러 재시도"
```

---

## Task 6: ContinuousViewer + 스크롤→현재페이지 동기화 훅

**Files:**
- Create: `src/hooks/useViewerScrollSync.ts`
- Modify: `src/components/viewer/ContinuousViewer.tsx` (스텁 → 실구현)

- [ ] **Step 1: useViewerScrollSync.ts 작성**

`src/hooks/useViewerScrollSync.ts`:

```ts
'use client'

import { useEffect, useRef } from 'react'

/**
 * 연속 뷰어 스크롤 ↔ currentPageIndex 양방향 동기화.
 *
 *  - 사용자 스크롤 → rAF 스로틀로 뷰포트 중앙에 가장 가까운 슬롯 계산
 *    → onPageChange(idx). (프로그램 스크롤 중에는 억제)
 *  - 외부에서 currentPageIndex 변경(썸네일/번호/키보드) → 해당 슬롯로
 *    scrollIntoView. 이때 suppress 플래그를 세워 스크롤→상태 루프 차단.
 *
 * 슬롯은 `[data-page-index]` 속성으로 식별한다(PageSlot 가 부여).
 */
export function useViewerScrollSync(args: {
  containerRef: React.RefObject<HTMLDivElement | null>
  currentPageIndex: number
  pageCount: number
  onPageChange: (index: number) => void
}) {
  const { containerRef, currentPageIndex, pageCount, onPageChange } = args
  const suppressRef = useRef(false)
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const rafRef = useRef(0)
  const lastReportedRef = useRef(currentPageIndex)

  // 사용자 스크롤 → 중앙 슬롯 계산
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onScroll = () => {
      if (suppressRef.current) return
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        const centerY = rect.top + rect.height / 2
        const slots = el.querySelectorAll<HTMLElement>('[data-page-index]')
        let bestIdx = lastReportedRef.current
        let bestDist = Infinity
        slots.forEach((s) => {
          const r = s.getBoundingClientRect()
          const c = r.top + r.height / 2
          const d = Math.abs(c - centerY)
          if (d < bestDist) {
            bestDist = d
            bestIdx = Number(s.dataset.pageIndex)
          }
        })
        if (
          Number.isFinite(bestIdx) &&
          bestIdx !== lastReportedRef.current
        ) {
          lastReportedRef.current = bestIdx
          onPageChange(bestIdx)
        }
      })
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(rafRef.current)
    }
  }, [containerRef, onPageChange])

  // 외부 currentPageIndex 변경 → 해당 슬롯로 스크롤(억제 플래그)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (currentPageIndex === lastReportedRef.current) return // 스크롤 자기발화
    if (pageCount <= 0) return

    const target = el.querySelector<HTMLElement>(
      `[data-page-index="${currentPageIndex}"]`,
    )
    if (!target) return

    suppressRef.current = true
    lastReportedRef.current = currentPageIndex
    target.scrollIntoView({ block: 'start', behavior: 'auto' })

    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current)
    suppressTimerRef.current = setTimeout(() => {
      suppressRef.current = false
    }, 180)

    return () => {
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current)
    }
  }, [containerRef, currentPageIndex, pageCount])
}
```

- [ ] **Step 2: ContinuousViewer.tsx 실구현**

`src/components/viewer/ContinuousViewer.tsx` 전문 교체:

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'
import { computePageBox } from '@/lib/pdf/page-box'
import { acquirePdfDoc, releasePdfDoc } from '@/lib/pdf/doc-cache'
import { PageSlot } from '@/components/viewer/PageSlot'
import { useViewerScrollSync } from '@/hooks/useViewerScrollSync'

/** 뷰포트 기준 ±이만큼의 화면을 미리 렌더(프리페치) */
const PREFETCH_SCREENS = 1.5

/**
 * 연속 스크롤 뷰어 (보기 모드 'continuous').
 *  - 모든 페이지를 박스 예약된 PageSlot 으로 세로 나열
 *  - IntersectionObserver 로 뷰포트 근접 슬롯만 캔버스 렌더(윈도잉)
 *  - 공유 pdfjs 문서(doc-cache)로 재파싱 0
 *  - 스크롤 ↔ currentPageIndex 양방향 동기화(useViewerScrollSync)
 */
export function ContinuousViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [visible, setVisible] = useState<Set<number>>(new Set())
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)

  const activeDoc = usePdfStore(selectActiveDoc)
  const zoom = usePdfStore((s) => s.viewer.zoom)
  const fitMode = usePdfStore((s) => s.viewer.fitMode)
  const currentPageIndex = usePdfStore((s) => s.viewer.currentPageIndex)
  const setCurrentPage = usePdfStore((s) => s.setCurrentPage)

  const bytes = activeDoc?.bytes ?? null

  // 공유 pdfjs 문서 수명: bytes 변경/언마운트 시 acquire/release
  useEffect(() => {
    if (!bytes) {
      setDoc(null)
      return
    }
    let alive = true
    acquirePdfDoc(bytes)
      .then((d) => {
        if (alive) setDoc(d)
      })
      .catch(() => {
        if (alive) setDoc(null) // 폴백: PageSlot 이 bytes 로 직접 로드
      })
    return () => {
      alive = false
      releasePdfDoc(bytes)
      setDoc(null)
    }
  }, [bytes])

  // 컨테이너 크기 측정(fit-width 계산용)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let raf = 0
    const measure = () => {
      const r = el.getBoundingClientRect()
      setContainerSize((p) => {
        const n = { w: Math.round(r.width), h: Math.round(r.height) }
        return p.w === n.w && p.h === n.h ? p : n
      })
    }
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    })
    ro.observe(el)
    measure()
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  // 페이지별 박스(연속 모드는 fit-page 미지원 → fit-width/zoom만; pad=0)
  const pages = activeDoc?.pages ?? []
  const boxes = useMemo(() => {
    return pages.map((p) =>
      computePageBox(p, {
        zoom,
        fitMode: fitMode === 'fit-page' ? 'fit-width' : fitMode,
        availW: containerSize.w,
        availH: containerSize.h,
        pad: 48,
      }),
    )
  }, [pages, zoom, fitMode, containerSize.w, containerSize.h])

  // IntersectionObserver 윈도잉
  useEffect(() => {
    const el = containerRef.current
    if (!el || pages.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev)
          for (const e of entries) {
            const idx = Number(
              (e.target as HTMLElement).dataset.pageIndex,
            )
            if (e.isIntersecting) next.add(idx)
            else next.delete(idx)
          }
          return next
        })
      },
      {
        root: el,
        rootMargin: `${Math.round(PREFETCH_SCREENS * 100)}% 0px`,
        threshold: 0.01,
      },
    )
    const slots = el.querySelectorAll<HTMLElement>('[data-page-index]')
    slots.forEach((s) => io.observe(s))
    return () => io.disconnect()
  }, [pages.length, activeDoc?.id])

  useViewerScrollSync({
    containerRef,
    currentPageIndex,
    pageCount: pages.length,
    onPageChange: setCurrentPage,
  })

  if (!activeDoc) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        선택된 문서가 없습니다
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full flex-1 flex-col items-center gap-4 overflow-auto p-6"
      role="region"
      aria-label="PDF 뷰어 (연속)"
    >
      {pages.map((p, i) => (
        <PageSlot
          key={`${activeDoc.id}-${p.index}`}
          page={p}
          box={boxes[i]}
          doc={doc}
          pageIndex={p.index}
          visible={visible.has(p.index)}
          bytes={activeDoc.bytes}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: 정적 검증**

Run: `npm run type-check`
Expected: 에러 0

Run: `npm run lint`
Expected: 경고 0

Run: `npm run build`
Expected: exit 0

- [ ] **Step 4: 도그푸딩 — 연속 스크롤 + 동기화**

Run: `npm run dev`
1. 20+페이지 PDF 업로드(기본 연속 모드). 페이지들이 세로로 나열되고 스크롤되는지.
2. 스크롤 시 상단 컨트롤바 페이지 번호 입력칸과 좌측 썸네일 하이라이트가 **현재 보이는 페이지로 자동 갱신**되는지.
3. 좌측 썸네일 클릭 → 본문이 해당 페이지로 스크롤되는지(루프/튐 없이).
4. 상단 번호 입력 후 Enter → 해당 페이지로 스크롤.
5. 멀리(예: 50페이지 문서의 40p) 스크롤 → 먼 페이지는 썸네일 자리표시, 근접 시 캔버스로 선명화. DevTools Performance/메모리에서 캔버스가 전부 동시에 그려지지 않는지(윈도잉 확인).
6. 회전된 페이지(썸네일 회전 적용) 종횡비 정상.

Expected: 연속 스크롤·3자 동기화·윈도잉 정상, 콘솔 오류 0, 스크롤↔클릭 피드백 루프 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/hooks/useViewerScrollSync.ts src/components/viewer/ContinuousViewer.tsx
git commit -m "feat: ContinuousViewer — IO 윈도잉·공유 doc·스크롤 동기화"
```

---

## Task 7: 보기 모드 세그먼트 컨트롤 (ZoomControl) + 연속 모드 fit-page 숨김

**Files:**
- Modify: `src/components/viewer/ZoomControl.tsx`

- [ ] **Step 1: ZoomControl — 보기 모드 토글 추가, fit-page 조건부**

`src/components/viewer/ZoomControl.tsx` import에 추가(11행 `MoveHorizontal,` 뒤):
```ts
  ScrollText,
  FileText,
```
스토어 셀렉터 영역(37-40행 부근, `setFitMode` 셀렉터 뒤)에 추가:
```ts
  const viewMode = usePdfStore((s) => s.viewer.viewMode)
  const setViewMode = usePdfStore((s) => s.setViewMode)
```

`맞춤 모드` 블록(201-237행, `{/* 맞춤 모드 */}` ~ 닫는 `</div>`) **앞**에 보기 모드 세그먼트와 구분선을 삽입:

```tsx
      {/* 보기 모드 (Phase 2에서 2페이지 추가) */}
      <div
        className="flex flex-shrink-0 items-center gap-0.5"
        role="group"
        aria-label="보기 모드"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={viewMode === 'continuous' ? 'default' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode('continuous')}
              aria-label="연속 스크롤 보기"
              aria-pressed={viewMode === 'continuous'}
            >
              <ScrollText className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>연속 스크롤 보기</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={viewMode === 'single' ? 'default' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode('single')}
              aria-label="한 페이지씩 보기"
              aria-pressed={viewMode === 'single'}
            >
              <FileText className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>한 페이지씩 보기</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-4 flex-shrink-0" />
```

`페이지 맞춤`(fit-page) 버튼을 감싼 `<Tooltip>`(220-236행)을 `{viewMode === 'single' && ( ... )}`로 조건부 렌더한다. 즉 해당 `<Tooltip> ... </Tooltip>` 전체를:

```tsx
        {viewMode === 'single' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={fitMode === 'fit-page' ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() =>
                  setFitMode(fitMode === 'fit-page' ? null : 'fit-page')
                }
                aria-label="페이지 맞춤"
                aria-pressed={fitMode === 'fit-page'}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>페이지 맞춤</TooltipContent>
          </Tooltip>
        )}
```
로 감싼다(`fit-width` 버튼은 두 모드 공통이므로 그대로 둔다).

- [ ] **Step 2: 정적 검증**

Run: `npm run type-check`
Expected: 에러 0

Run: `npm run lint`
Expected: 경고 0 (추가한 `ScrollText`/`FileText` 사용됨, 미사용 import 0)

Run: `npm run build`
Expected: exit 0

- [ ] **Step 3: 도그푸딩 — 모드 토글·영속·fit-page 조건부**

Run: `npm run dev`
1. 상단 컨트롤바에 `연속`/`한 페이지` 토글이 보이고 기본 `연속` 활성(default 변형).
2. `한 페이지` 클릭 → SinglePageViewer로 전환, 기존 단일 동작·`페이지 맞춤` 버튼 노출.
3. `연속` 클릭 → ContinuousViewer로 복귀, `페이지 맞춤` 버튼 **숨김**(`너비 맞춤`은 두 모드 공통 노출).
4. `한 페이지` 선택 후 새로고침 → 새로고침 후에도 `한 페이지` 유지(persist v3).
5. `연속`으로 되돌리고 새로고침 → 연속 유지.

Expected: 토글·영속·fit-page 조건부 정상.

- [ ] **Step 4: 커밋**

```bash
git add src/components/viewer/ZoomControl.tsx
git commit -m "feat: 보기 모드 토글(연속/단일) + 연속 모드 fit-page 숨김"
```

---

## Task 8: Ctrl/⌘+휠 줌 + 확대 시 드래그 팬 (연속 뷰어)

**Files:**
- Modify: `src/components/viewer/ContinuousViewer.tsx`

- [ ] **Step 1: 휠 줌 + 드래그 팬 핸들러 추가**

`src/components/viewer/ContinuousViewer.tsx`에서 `setCurrentPage` 셀렉터 아래에 추가:

```ts
  const setZoom = usePdfStore((s) => s.viewer.zoom !== undefined ? s.setZoom : s.setZoom)
```
> 위 한 줄 대신 정확히 다음으로 작성(불필요 삼항 제거):
```ts
  const setZoom = usePdfStore((s) => s.setZoom)
  const zoomRef = useRef(zoom)
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])
```

`useViewerScrollSync(...)` 호출 **아래**에 휠 줌·팬 effect 추가:

```ts
  // Ctrl/⌘ + 휠 → 줌. 일반 휠은 네이티브 스크롤 유지.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const dir = e.deltaY < 0 ? 1 : -1
      const next = +(zoomRef.current + dir * 0.1).toFixed(2)
      setZoom(Math.max(0.25, Math.min(4.0, next)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setZoom])

  // 콘텐츠가 컨테이너보다 넓을 때 드래그 팬(grab/grabbing)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let panning = false
    let startX = 0
    let startY = 0
    let startLeft = 0
    let startTop = 0

    const canPan = () => el.scrollWidth > el.clientWidth + 1

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !canPan()) return
      panning = true
      startX = e.clientX
      startY = e.clientY
      startLeft = el.scrollLeft
      startTop = el.scrollTop
      el.setPointerCapture(e.pointerId)
      el.style.cursor = 'grabbing'
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!panning) return
      el.scrollLeft = startLeft - (e.clientX - startX)
      el.scrollTop = startTop - (e.clientY - startY)
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!panning) return
      panning = false
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* 캡처 해제 실패 무해 */
      }
      el.style.cursor = ''
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
    }
  }, [])
```

- [ ] **Step 2: 정적 검증**

Run: `npm run type-check`
Expected: 에러 0

Run: `npm run lint`
Expected: 경고 0

Run: `npm run build`
Expected: exit 0

- [ ] **Step 3: 도그푸딩 — 줌/팬**

Run: `npm run dev`
1. 연속 모드에서 `Ctrl`(맥 `⌘`) 누른 채 휠 위/아래 → 줌 인/아웃(상단 % 갱신), 페이지 스크롤 아님.
2. 일반 휠(수정자 없음) → 정상 세로 스크롤(줌 아님).
3. 줌 200%로 페이지 폭이 컨테이너보다 넓을 때 본문 드래그 → 좌우/상하 팬, 커서 grabbing.
4. 줌 100%(폭이 컨테이너 이하)에서 드래그 → 팬 비활성(텍스트/스크롤 방해 없음).

Expected: 줌·팬 정상, 일반 스크롤 무간섭.

- [ ] **Step 4: 커밋**

```bash
git add src/components/viewer/ContinuousViewer.tsx
git commit -m "feat: 연속 뷰어 Ctrl/⌘+휠 줌 + 확대 시 드래그 팬"
```

---

## Task 9: 키보드 스크롤 (연속 모드)

**Files:**
- Modify: `src/hooks/useKeyboardShortcuts.ts`

- [ ] **Step 1: 연속 모드 스크롤 키 추가**

`src/hooks/useKeyboardShortcuts.ts`에서 `viewMode` 셀렉터를 추가한다. `currentPageIndex` 셀렉터(44행) 아래에:

```ts
  const viewMode = usePdfStore((s) => s.viewer.viewMode)
```

`onKeyDown` 내부 `// 페이지 이동`의 `ArrowLeft`/`ArrowRight` 블록(87-96행) **다음**, `// 삭제` 블록 **이전**에 추가:

```ts
      // 연속 모드 스크롤 키: ↑/PageUp 이전, ↓/PageDown/Space 다음, Home/End 처음·끝
      if (viewMode === 'continuous') {
        if (e.key === 'ArrowUp' || e.key === 'PageUp') {
          e.preventDefault()
          setCurrentPage(Math.max(0, currentPageIndex - 1))
          return
        }
        if (
          e.key === 'ArrowDown' ||
          e.key === 'PageDown' ||
          e.key === ' ' ||
          e.key === 'Spacebar'
        ) {
          e.preventDefault()
          setCurrentPage(Math.min(pageCount - 1, currentPageIndex + 1))
          return
        }
        if (e.key === 'Home') {
          e.preventDefault()
          setCurrentPage(0)
          return
        }
        if (e.key === 'End') {
          e.preventDefault()
          setCurrentPage(Math.max(0, pageCount - 1))
          return
        }
      }
```

`useEffect` 의존성 배열(110-121행)에 `viewMode` 추가:

```ts
  }, [
    enabled,
    activeDoc,
    currentPageIndex,
    selectedPages,
    setCurrentPage,
    clearSelection,
    undo,
    redo,
    selectAll,
    onRequestDelete,
    viewMode,
  ])
```

- [ ] **Step 2: 정적 검증**

Run: `npm run type-check`
Expected: 에러 0

Run: `npm run lint`
Expected: 경고 0

- [ ] **Step 3: 도그푸딩 — 키보드(단일 모드 무변경 포함)**

Run: `npm run dev`
1. 연속 모드, 본문에 포커스(빈 영역 클릭) 후: `↓`/`PageDown`/`Space` → 다음 페이지로 스크롤. `↑`/`PageUp` → 이전. `Home`/`End` → 처음/끝.
2. `←`/`→`도 페이지 이동(기존 동작) 유지.
3. 입력칸(상단 페이지 번호)에 포커스한 상태에서 위 키 → 스크롤 안 됨(입력 필드 가드 유지).
4. `한 페이지` 모드로 전환 → `↑↓/PageUp/Down/Space/Home/End`는 무동작(연속 전용), `←→`만 기존대로 페이지 이동(단일 모드 회귀 0).

Expected: 연속 키 동작, 단일 모드 기존 동작 불변, 입력 필드 가드 유지.

- [ ] **Step 4: 커밋**

```bash
git add src/hooks/useKeyboardShortcuts.ts
git commit -m "feat: 연속 모드 키보드 스크롤(↑↓/PageUp·Down/Space/Home·End)"
```

---

## Task 10: 순서 버튼 명료화(#3) + 회전 아이콘 교체(#4) + 사용안내

**Files:**
- Modify: `src/components/toolbar/EditorToolbar.tsx`
- Modify: `src/components/pages/PageThumbnail.tsx`
- Modify: `src/components/help/HelpSheet.tsx`

- [ ] **Step 1: EditorToolbar — 회전 아이콘 교체 + 순서 버튼 그룹/라벨/툴팁**

`src/components/toolbar/EditorToolbar.tsx` import(4-19행)에서 `RotateCw,` 를 `RotateCwSquare,` 로 교체.

순서 버튼 영역(138-162행, `{/* 이동 버튼 (단일 선택만) */}` ~ 4개 `ToolbarButton`)을 다음으로 교체(라벨을 '순서 변경'으로 명시 + 시각 그룹):

```tsx
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
```

회전 `ToolbarButton`(167-176행)의 아이콘을 교체: `<RotateCw className="h-4 w-4" />` → `<RotateCwSquare className="h-4 w-4" />` (label/`90° 회전` 텍스트는 유지).

- [ ] **Step 2: PageThumbnail — 회전 아이콘 정렬**

`src/components/pages/PageThumbnail.tsx` import(4행) `import { RotateCw, Trash2 } from 'lucide-react'` → `import { RotateCwSquare, Trash2 } from 'lucide-react'`.
회전 버튼 아이콘(235행) `<RotateCw className="h-3 w-3" />` → `<RotateCwSquare className="h-3 w-3" />` (aria-label `…90도 회전`은 유지).

- [ ] **Step 3: HelpSheet — 드래그 재정렬·연속 스크롤 안내 1~2줄**

`src/components/help/HelpSheet.tsx`를 열어 기능 설명 목록(예: 편집/페이지 관련 항목 배열 또는 섹션)을 찾는다. 페이지 관리 설명이 있는 항목에 다음 2개 항목을 같은 포맷으로 추가한다(주변 항목의 객체/JSX 구조를 그대로 따를 것):

- 제목: "연속 스크롤로 읽기" / 설명: "기본은 연속 스크롤입니다. 상단 도구막대의 연속/한 페이지 토글로 전환할 수 있어요."
- 제목: "페이지 순서 바꾸기" / 설명: "왼쪽 썸네일을 드래그해 순서를 바꾸거나, 도구막대의 순서 버튼(맨 앞/앞/뒤/맨 뒤)을 사용하세요."

> 정확한 추가 위치/구문은 HelpSheet의 기존 데이터 구조에 맞춘다(문자열 배열이면 문자열 2개, `{title, desc}` 배열이면 객체 2개). 새 컴포넌트/타입을 만들지 말 것.

- [ ] **Step 4: 정적 검증**

Run: `npm run type-check`
Expected: 에러 0 (`RotateCwSquare`는 lucide-react 0.460에 존재)

Run: `npm run lint`
Expected: 경고 0 (`RotateCw` 잔존 import 없음 — 두 파일 모두 교체했는지 확인)

Run: `npm run build`
Expected: exit 0

- [ ] **Step 5: 도그푸딩 — 라벨/아이콘/안내**

Run: `npm run dev`
1. 페이지 1개 선택 → 툴바 `순서` 라벨 + 4개 버튼. 각 버튼 호버 시 툴팁이 "…(문서 내 순서 변경)"로 표시되어 '페이지 이동'과 혼동되지 않는지.
2. 회전 버튼 아이콘이 사각형+회전 화살표(`RotateCwSquare`)로 바뀌어 새로고침과 구분되는지. 클릭 시 90° 회전 정상 동작.
3. 썸네일 호버 회전 버튼 아이콘도 동일하게 변경·동작.
4. 순서 버튼 동작(맨앞/앞/뒤/맨뒤) 기존대로 정상(회귀 0).
5. `사용 방법` 시트 열기 → 연속 스크롤·순서 바꾸기 안내 2줄 표시.

Expected: 어휘 충돌 제거, 아이콘 직관적, 회귀 0.

- [ ] **Step 6: 커밋**

```bash
git add src/components/toolbar/EditorToolbar.tsx src/components/pages/PageThumbnail.tsx src/components/help/HelpSheet.tsx
git commit -m "feat: 순서 버튼 라벨·그룹 명료화(#3) + 회전 아이콘 RotateCwSquare(#4) + 사용안내"
```

---

## Task 11: 최종 통합 검증 (spec §10 회귀 체크리스트)

**Files:** (코드 변경 없음 — 검증·필요 시 미세 수정)

- [ ] **Step 1: 전체 정적 게이트**

Run: `npm run type-check` → Expected: 에러 0
Run: `npm run lint` → Expected: 에러/경고 0
Run: `npm run build` → Expected: exit 0

- [ ] **Step 2: 통합 회귀 도그푸딩 (spec §10 전 항목)**

Run: `npm run dev` — 20+페이지 PDF + 100+페이지 PDF 각각:

1. 연속 스크롤 부드러움 / 페이지 표시·썸네일 하이라이트 자동 동기화
2. 썸네일 클릭·번호 입력·`←/→`·`Home/End`로 정확 이동(피드백 루프 없음)
3. `Ctrl/⌘+휠` 줌, 확대 후 드래그 팬
4. 보기 모드 토글, 새로고침 후 모드 유지, 마이그레이션(IndexedDB에서 `pdf-office-state` 삭제 후 v2 시뮬레이션 대신: 신규 업로드 시 `viewMode:"continuous"`/version 3 확인)
5. 100+페이지 메모리 안정(먼 페이지 썸네일 자리표시, 동시 캔버스 제한), 회전 페이지 종횡비
6. 문서 2개 전환 / undo·redo / 삭제·드래그 재정렬 — 연속·단일 모두 회귀 0
7. **단일 모드 무변경**(SinglePageViewer 기존 동작)
8. 순서 버튼 툴팁·라벨, 회전 아이콘 시각 확인

각 항목 PASS/FAIL 기록. FAIL 시 원인 태스크로 돌아가 수정 후 해당 태스크의 검증 재실행.

- [ ] **Step 3: 문서 변경 이력 갱신**

`CLAUDE.md`의 "변경 이력" 표 마지막에 1행 추가:

```
| 2026-05-17 | 뷰어 UX 개선 Phase 1 — 연속 스크롤 기본·보기모드 토글·공유 pdfjs 캐시·줌/팬·키보드 스크롤·순서버튼 명료화·회전 아이콘 교체 | src/(뷰어·스토어·툴바·훅) | 사용자 피드백 4건. tsc 0·build 0·도그푸딩 |
```

- [ ] **Step 4: 커밋**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 변경 이력 — 뷰어 UX Phase 1"
```

---

## Self-Review (작성자 점검 결과)

**1. Spec 커버리지**

| spec 요구 | 태스크 |
|-----------|--------|
| 연속 스크롤 기본 + 윈도잉 | T5(PageSlot)·T6(ContinuousViewer/IO) |
| 공유 pdfjs 문서 캐시(bytes 키잉) | T3 |
| boxSize 헬퍼 추출 | T2 |
| 모드 스위치 셸 + SinglePageViewer 보존 | T4 |
| `ViewerState.viewMode` + persist v3 마이그레이션 | T1 |
| 3자 동기화(스크롤↔현재페이지↔썸네일) | T6(useViewerScrollSync) |
| Ctrl/⌘+휠 줌 + 드래그 팬 | T8 |
| 키보드 스크롤(연속) | T9 |
| 보기 모드 세그먼트 + 연속 fit-page 숨김 | T7 |
| 순서 버튼 명료화(#3) | T10 |
| 회전 아이콘 교체(#4) | T10 |
| HelpSheet 안내 | T10 |
| 검증(type-check/lint/build/도그푸딩) | 전 태스크 + T11 |
| 에러: 슬롯 단위 인라인+재시도 | T5 |
| 리스크: 스크롤 루프 억제 | T6(suppressRef) |
누락 없음.

**2. 플레이스홀더 스캔**: 코드 스텝은 전부 실제 코드 포함(복붙 가능, 함정/자리표시 없음). T10 Step3(HelpSheet)만 기존 데이터 구조 의존이라 "주변 포맷을 따르라"고 지시 — 새 타입/컴포넌트 금지를 명시해 범위 한정. (초안에 PageSlot import 오타 함정을 넣었던 것을 검토에서 제거하고 올바른 `useRef`로 정정함.)

**3. 타입 일관성**: `computePageBox`/`PageBox`(T2) → T4·T5·T6에서 동일 시그니처 사용. `acquirePdfDoc/releasePdfDoc(bytes)`(T3) → T6 동일. `ViewMode`/`setViewMode`(T1) → T6·T7·T9 동일. `renderPageToCanvas` `opts.doc`(T3) → T5 `doc: doc ?? undefined` 일치. `[data-page-index]` 계약: PageSlot(T5)이 부여 → useViewerScrollSync·IO(T6)가 소비. 불일치 없음.

> 비고: 본 프로젝트는 단위 테스트 러너가 없어 TDD의 RED 단계를 코드 테스트로 표현할 수 없다. 대신 각 태스크는 정적 게이트(type-check/lint/build) + spec §10 기반 **구체적 도그푸딩 절차와 기대 관찰**로 수용하며, 이는 승인된 spec 및 프로젝트 확립 검증 모델과 일치한다(사용자 규칙 우선).
