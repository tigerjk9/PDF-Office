# PDF Office — 뷰어 UX 개선 설계 (Phase 1)

- **작성일**: 2026-05-17
- **상태**: 승인됨 (사용자 리뷰 대기)
- **범위**: Phase 1 (연속 스크롤 뷰어 + 보기 모드 토글 + 순서버튼 명료화 + 회전 아이콘 교체)
- **후속**: Phase 2 (2페이지 스프레드) — 별도 spec

---

## 1. 배경 / 문제 정의

사용자 피드백 4건:

1. **본문 스크롤이 아쉽다** — 편집기가 아닌 *뷰어*로서의 기능도 필요.
2. **1페이지 / 2페이지 보기** 둘 다 지원되면 좋겠다.
3. **"이동" 버튼이 모호** — 페이지 이동(navigate)인지, 그 페이지를 옮기는 것(reorder)인지 혼동.
4. **90° 회전 버튼이 새로고침처럼 보임** — 아이콘 변경 필요.

**근본 원인**: `PdfViewer.tsx`는 캔버스에 페이지 **1장만** 그리는 편집기 중심 설계다. 컨테이너에 `overflow-auto`가 있으나 페이지 박스가 하나뿐이라 (확대 시 외) 스크롤할 대상이 없다. 페이지 이동은 ◀▶ 버튼/번호 입력에만 의존하며, 연속 스크롤·휠 줌·드래그 팬 등 표준 뷰어 경험이 부재하다. 1·2번은 "뷰 모드 부재"라는 같은 뿌리, 3·4번은 저비용 명료성 결함이다.

## 2. 목표 / 비목표

**목표 (Phase 1)**
- 연속 스크롤을 **기본** 보기 모드로 도입(크롬/Adobe 수준 첫인상).
- `보기 모드` 토글 `[연속 | 단일]` (Phase 2에서 `2페이지` 추가).
- 스크롤 위치 ↔ 현재 페이지 표시 ↔ 썸네일 하이라이트 3자 동기화.
- `Ctrl/⌘ + 휠` 줌, 확대 시 드래그 팬.
- 키보드 스크롤(↑↓/PageUp·Down/Space/Home/End).
- 순서 버튼 라벨·그룹·아이콘·툴팁 명료화(3번), 회전 아이콘 교체(4번).
- 100+ 페이지에서 메모리 안전(가상화).

**비목표 (YAGNI / Phase 2 / 제외)**
- 2페이지 스프레드 + 표지 단독 옵션 → **Phase 2 별도 spec**.
- 커서 기준(anchor) 줌, 뷰어 내 텍스트 선택, 검색 결과 하이라이트 스크롤 → 제외.
- 새 외부 의존성 추가 → 금지(프로젝트 의존성 보수성).

## 3. 결정 로그 (브레인스토밍 합의)

| # | 결정 | 선택 | 근거 |
|---|------|------|------|
| D1 | 뷰어 개선 범위 | **단계적 풀 뷰어** | 가장 큰 통증(연속 스크롤) 먼저, 2페이지는 분리 가능한 fast-follow로 위험 분산 |
| D2 | 가상화 아키텍처 | **IntersectionObserver 윈도잉 + 공유 pdfjs 문서 + 썸네일 플레이스홀더** | 신규 의존성 0, 기존 렌더러·`boxSize`·`page.thumbnail` 재사용, 메모리 안전 |
| D3 | Phase 1 기본 모드 | **연속이 기본** | 피드백의 핵심(뷰어 경험)을 정면 해결. 기존 사용자: `viewMode` 없으면 `'continuous'`로 마이그레이션 |
| D4 | 3번 처리 수준 | **라벨·그룹·아이콘 명확화 (버튼 유지)** | 드래그 재정렬은 이미 작동. 혼동은 라벨링 문제 → 낮은 회귀 위험 |

## 4. 아키텍처

### 4.1 모드 스위치 셸
`PdfViewer`를 얇은 스위치로 리팩터:

```
PdfViewer (셸)
 ├─ viewMode === 'single'      → SinglePageViewer  (기존 코드 거의 그대로 이동, 회귀 최소화)
 └─ viewMode === 'continuous'  → ContinuousViewer  (신규)
```

- 기존 단일 페이지 렌더 로직(ResizeObserver·boxSize·취소 핸들·로딩/에러 오버레이)은 **`SinglePageViewer`로 그대로 분리**하고 동작을 바꾸지 않는다.
- `boxSize` 계산(페이지 종횡비 → px 박스, 회전 스왑, fit 모드)은 두 뷰어가 공유하므로 **순수 헬퍼로 추출**: `lib/pdf/page-box.ts` → `computePageBox(page, { zoom, fitMode, availW, availH })`.

### 4.2 공유 pdfjs 문서 캐시 (핵심)
현재 `renderPageToCanvas`는 호출마다 `loadPdfDocument(bytes)` → `doc.destroy()` 로 **전체 PDF를 재파싱**한다. 연속 스크롤에서 동시에 3~5페이지 렌더 + 스크롤마다 재렌더 시 치명적.

신규 `lib/pdf/doc-cache.ts`:
- `acquirePdfDoc(bytes)` — **`bytes` 참조 식별자(identity)** 로 `PDFDocumentProxy`를 1회 로드해 참조 카운트로 캐시. 키는 `docId`가 **아니라** `bytes`다: 편집(delete/rotate/reorder/insert/watermark)은 동일 `docId`로 **새 `bytes`** 를 만들므로, `docId` 키잉은 stale 렌더를 유발한다. 구현은 `WeakMap<Uint8Array, Entry>`(GC 친화) 또는 `${docId}:${doc.modifiedAt}` 복합 키 — 둘 다 bytes 변경 시 자동으로 새 항목이 된다.
- `releasePdfDoc(bytes)` — 참조 0이 되면 `destroy()`.
- 동시에 캐시되는 문서는 **활성 bytes 1개**만(메모리 상한). 활성 문서 전환 **또는 편집으로 bytes 교체** 시 이전 항목 release.
- `renderPageToCanvas`에 선택적 `doc?: PDFDocumentProxy` 주입(또는 `renderPageWithDoc`) — 캐시 문서 사용 시 재파싱 0. 미주입 시 기존 동작(폴백) 유지 → 단일 뷰어/기존 호출처 무변경.

### 4.3 ContinuousViewer 렌더링
- 세로 스크롤 컨테이너 + `activeDoc.pages` 각각을 `PageSlot`으로 매핑.
- 각 `PageSlot`은 `computePageBox`로 **박스 크기를 즉시 예약**(레이아웃 점프 0).
- IntersectionObserver(`rootMargin` ≈ 화면 2개분 프리페치)로 뷰포트 근접 슬롯만 실제 `<canvas>` 마운트 → 캐시 문서로 렌더. 먼 슬롯은 **`page.thumbnail`(이미 존재)** 을 확대 표시 → 빈 화면 깜빡임 0.
- 페이지별 취소 핸들 보관 → 스크롤 이탈/언마운트 시 `cancel()`(기존 `RenderHandle` 재사용).
- 줌/회전/문서 변경 시 보이는 슬롯만 재렌더(먼 슬롯은 박스만 재계산).

## 5. 상태 / 타입 변경 + 영속 마이그레이션

### 5.1 타입 (SSOT = `src/lib/types.ts`)
```ts
export type ViewMode = 'continuous' | 'single' // Phase 2: | 'spread'

export interface ViewerState {
  currentPageIndex: PageIndex
  zoom: number
  fitMode: 'fit-width' | 'fit-page' | null
  viewMode: ViewMode            // 신규
}
// PdfStore 인터페이스에 setViewMode(mode: ViewMode): void 추가
```
> 비고: 과거 "types.ts 동결"은 *히스토리 스택 필드*를 영속 상태에 넣지 않으려는 한정 결정이었다. `viewMode`는 정당한 뷰어 사용자 설정이며 영속 대상이 맞다.

### 5.2 스토어 (`src/lib/store/pdf-store.ts`)
- `initialViewer`에 `viewMode: 'continuous'` 추가.
- `setViewMode` 액션(불변 갱신: `viewer: { ...s.viewer, viewMode }`).
- persist `version: 2 → 3` + `migrate(persisted, version)`:
  - `version < 3` 또는 `viewer.viewMode` 부재 → `viewer.viewMode = 'continuous'` 주입.
- `partialize`는 이미 `viewer` 전체를 포함 → 별도 변경 불필요.

## 6. 데이터 흐름 — 3자 동기화

```
[사용자 스크롤] ─(rAF 스로틀)→ 뷰포트 중앙 페이지 계산 → setCurrentPage(idx)
                                                          │
        ┌─────────────────────────────────────────────────┤
        ▼                         ▼                        ▼
 ZoomControl 입력칸        PageGrid 하이라이트       (이미 currentPageIndex 구독)
        ▲
[외부 변경] 썸네일 클릭 / 번호 입력 / ←→ / Home·End
        └─→ currentPageIndex 변경 감지 → 해당 PageSlot로 scrollIntoView
```

- **피드백 루프 차단**: 프로그램 스크롤 직전 `suppressScrollSync = true` 설정 → 스크롤 정착 후 해제. rAF 스로틀로 스크롤 핸들러 폭주 방지.
- 외부 변경 출처 판별: `currentPageIndex`가 뷰어 자신의 스크롤 동기화로 바뀐 경우 재스크롤 생략.

## 7. 줌 / 팬 / 키보드

- **Ctrl/⌘ + 휠** → `setZoom` (`preventDefault`). 일반 휠 = 네이티브 세로 스크롤(연속).
- **드래그 팬**: 콘텐츠가 컨테이너보다 넓을 때 pointer 드래그로 `scrollLeft/Top` 조정, 커서 `grab`/`grabbing`.
- **키보드**(`useKeyboardShortcuts` 확장 — 단일 모드 동작 불변):
  - 연속 모드: `↑/PageUp` 이전 페이지로 스크롤, `↓/PageDown/Space` 다음, `Home/End` 처음/끝. 기존 `←/→`도 페이지 이동(스크롤) 유지.
  - 입력 필드 포커스 시 비활성(기존 `isEditableTarget` 재사용).
- **fitMode**: 연속 모드에서 `fit-page`는 의미 상충(스크롤 무력화) → 연속 모드에서는 `fit-width`/명시 줌만. `fit-page` 버튼은 **단일 모드 전용**으로 노출(연속에서는 숨김/비활성).

## 8. 툴바 명료화 (`src/components/toolbar/EditorToolbar.tsx`만 수정)

### 8.1 순서 버튼 (3번)
- 화살표 4개(`ChevronsUp/MoveUp/MoveDown/ChevronsDown`)를 **구분선으로 묶고** 데스크탑에 `순서` 텍스트 라벨.
- 툴팁/`aria-label`을 명시적으로: 예) *"이 페이지를 문서 안에서 한 칸 앞으로 (순서 변경)"*, *"맨 앞으로 (순서 변경)"*.
- 버튼은 유지(키보드·정밀 조작·접근성). 드래그 재정렬이 주 제스처임을 `HelpSheet`(사용 방법)에 1줄 반영.

### 8.2 회전 아이콘 (4번)
- `RotateCw` → `RotateCwSquare`(lucide). `EditorToolbar`와 `PageThumbnail`의 회전 어포던스를 동일 아이콘으로 정렬. 툴팁 `90° 회전` 유지.

## 9. 에러 처리

- **페이지별 렌더 실패**: 해당 `PageSlot`에만 인라인 에러 카드 + 재시도(전체 뷰어는 정상). 기존 단일 뷰어의 `renderError` 패턴을 슬롯 단위로 재사용.
- **캐시 문서 로드 실패**: `renderPageToCanvas` 폴백(호출별 로드)으로 graceful degrade.
- **취소**: 기존 `RenderHandle.cancel`을 스크롤 이탈/언마운트/모드 전환/문서 전환에서 호출.
- **문서 전환 경합**: 활성 문서 변경 시 이전 캐시 문서 release + 진행 중 렌더 전부 cancel.

## 10. 검증 (완료 기준)

- `npx tsc --noEmit` 0 에러, `npm run build` exit 0 (프로젝트 표준, `--legacy-peer-deps`).
- `npm run lint` 0 에러.
- **브라우저 도그푸딩**(프로젝트 규칙 — UI 변경 필수). 다중 페이지 PDF로:
  1. 연속 스크롤 부드러움 / 페이지 표시·썸네일 하이라이트 자동 동기화
  2. 썸네일 클릭 → 해당 페이지로 스크롤 / 번호 입력 / ←→ / Home·End
  3. `Ctrl+휠` 줌, 확대 후 드래그 팬
  4. `보기 모드` 토글, **새로고침 후 모드 유지**(persist) 및 **마이그레이션**(viewMode 없는 기존 상태 → 연속)
  5. 100+ 페이지 메모리 안정(먼 페이지 썸네일 플레이스홀더), 회전 페이지 종횡비
  6. 문서 전환 / undo·redo / 삭제·재정렬 회귀 없음
  7. **단일 모드 무변경**(기존 동작 보존)
  8. 순서 버튼 툴팁·라벨, 회전 아이콘 시각 확인

## 11. 리스크 / 완화

| 리스크 | 완화 |
|--------|------|
| 스크롤-동기화 피드백 루프 | `suppressScrollSync` 플래그 + rAF 스로틀 + 출처 판별 |
| pdfjs 메모리 증가 | 캐시 문서 1개만 유지, 문서 전환·언마운트 시 `destroy()` |
| 단일 경로 회귀 | 기존 로직을 `SinglePageViewer`로 *이동만*, 동작 변경 없음 |
| types.ts SSOT 변경 | persist `version` 업 + `migrate` 제공, `viewMode`는 정당한 영속 설정 |
| 대형 문서 초기 썸네일 미생성 구간 | 썸네일 미존재 슬롯은 빈 박스(예약된 종횡비) + 근접 시 우선 렌더 |

## 12. 파일별 변경 맵

| 파일 | 변경 |
|------|------|
| `src/lib/types.ts` | `ViewMode` 타입, `ViewerState.viewMode`, `PdfStore.setViewMode` |
| `src/lib/store/pdf-store.ts` | `initialViewer.viewMode`, `setViewMode`, persist `version 3` + `migrate` |
| `src/lib/pdf/page-box.ts` | **신규** — `computePageBox` 순수 헬퍼(기존 boxSize 로직 추출) |
| `src/lib/pdf/doc-cache.ts` | **신규** — `acquirePdfDoc/releasePdfDoc`, **bytes 식별자 키잉**(docId 아님) 참조카운트 캐시 |
| `src/lib/pdf/renderer.ts` | `renderPageToCanvas`에 선택적 `doc` 주입(폴백 보존) |
| `src/components/viewer/PdfViewer.tsx` | 모드 스위치 셸로 축소 |
| `src/components/viewer/SinglePageViewer.tsx` | **신규** — 기존 PdfViewer 로직 이동(동작 불변) |
| `src/components/viewer/ContinuousViewer.tsx` | **신규** — 윈도잉·동기화·줌/팬 |
| `src/components/viewer/PageSlot.tsx` | **신규** — 슬롯별 박스 예약·캔버스/썸네일·에러 |
| `src/components/viewer/ZoomControl.tsx` | `보기 모드` 세그먼트 추가, 연속 모드에서 `fit-page` 숨김 |
| `src/components/toolbar/EditorToolbar.tsx` | 순서 버튼 그룹·라벨·툴팁, `RotateCw→RotateCwSquare` |
| `src/components/pages/PageThumbnail.tsx` | 회전 아이콘 정렬(해당 시) |
| `src/hooks/useKeyboardShortcuts.ts` | 연속 모드 스크롤 키(↑↓/PageUp·Down/Space/Home·End) |
| `src/components/help/HelpSheet.tsx` | 드래그 재정렬·연속 스크롤 1~2줄 안내 |

## 13. Phase 2 (예고, 별도 spec)

- `ViewMode`에 `'spread'` 추가, `[연속 | 단일 | 2페이지]` 세그먼트.
- 표지 단독 옵션(1쪽 단독 → 2·3, 4·5 …) vs 단순 2-up.
- 스프레드 박스 계산(2페이지 가로 합성) + 윈도잉 단위가 "스프레드"로.
