# PDF Office — Phase 2 설계 (2페이지 스프레드 + 페이지 패널 리사이즈)

- **작성일**: 2026-05-17
- **상태**: 승인됨 (사용자 리뷰 대기)
- **선행**: Phase 1 (연속 스크롤 뷰어, main 92e997b 배포 완료)
- **범위**: (A) 연속 뷰어 2페이지(N행 2열) 스프레드 + 보기 모드 3종 토글, (B) 좌측 페이지 썸네일 패널 마우스 리사이즈 + 영속

---

## 1. 배경 / 문제

사용자 피드백:
1. **2페이지 보기 부재** — 연속 뷰어가 N행 **1열**로만 표시. 1페이지/2페이지(N행 **2열**) 둘 다 지원 필요.
2. **페이지 패널 고정 폭** — 좌측 "페이지" 썸네일 패널(`w-[15.5rem]` 고정)을 마우스로 좌우 너비 조정하고 싶음.

## 2. 결정 로그 (브레인스토밍 합의)

| # | 결정 | 선택 | 근거 |
|---|------|------|------|
| D1 | 2페이지 페어링 | **단순 2-up** (1·2 / 3·4 / 5·6 …, 홀수 끝 단독) | 구현·예측 단순, 일반 문서 자연스러움. 표지 오프셋·book·토글 제외(YAGNI) |
| D2 | 2페이지 구현 방식 | **ContinuousViewer 확장** | IO·스크롤동기화·doc-cache·줌/팬 무변경 재사용. 별도 SpreadViewer는 ~150줄 중복(DRY 위반) |
| D3 | 리사이즈 대상·영속 | **페이지 패널만 + localStorage 영속** | UI 레이아웃 선호는 문서 스토어(IndexedDB)와 분리. 문서 사이드바·모바일 제외(범위 최소) |
| D4 | 리사이즈 구현 | **자체 훅+핸들(의존성 0)** | 프로젝트 의존성 보수성. 리사이즈 라이브러리 미도입 |

## 3. 목표 / 비목표

**목표**
- `보기 모드` 세그먼트 `[연속 | 단일]` → `[연속 | 단일 | 2페이지]`. 2페이지 = 연속 스크롤 2열.
- 2-up 행 그룹핑(`1·2 / 3·4 …`, 홀수 마지막 단독), 각 페이지 ≈ 절반폭.
- 페이지 패널 우측 경계 드래그 리사이즈, 클램프 [180, 420]px, localStorage 영속, 새로고침 유지.
- 윈도잉·스크롤 3자 동기화·줌/팬·doc-cache·키보드·단일/연속 동작 **회귀 0**.

**비목표 (YAGNI / 추적)**
- 표지 단독 오프셋·book 모드·표지 토글 → 제외.
- 문서 사이드바 리사이즈·모바일 리사이즈 → 제외.
- 스프레드 키보드 행단위 이동(Phase 1대로 ±1 페이지 유지) → 범위 외.
- scroll-sync per-frame `querySelectorAll` 성능(Phase 1 P1 추적) → 유지.

## 4. 아키텍처

### 4.1 보기 모드 확장
- `src/lib/types.ts`: `ViewMode = 'continuous' | 'single' | 'spread'` (Phase 1 주석이 이미 'spread' 예고). **persist 버전업 불필요** — 타입 확장은 하위호환이고 `migrate`는 `viewMode` 부재 시에만 `'continuous'` 주입(기존 'continuous'/'single' 영속값 그대로 유효, 'spread'는 사용자 클릭으로만 설정).
- `PdfViewer` 셸: 현재 `viewMode === 'continuous' ? <ContinuousViewer/> : <SinglePageViewer/>` → **`viewMode === 'single' ? <SinglePageViewer/> : <ContinuousViewer/>`** (continuous·spread 모두 ContinuousViewer).
- `ZoomControl` 보기 모드 group: 기존 2버튼 뒤 3번째 추가 — `2페이지`, lucide `Columns2` 아이콘, `variant={viewMode === 'spread' ? 'default' : 'ghost'}`, `onClick={() => setViewMode('spread')}`, `aria-label="두 페이지씩 보기"`, `aria-pressed`. 기존 fit-page는 Phase 1에서 `{viewMode === 'single' && (...)}`로 감싸 있으므로 spread에서도 자동 숨김(무변경).

### 4.2 2페이지 렌더 (ContinuousViewer)
- `viewMode` 셀렉터 추가. `const cols = viewMode === 'spread' ? 2 : 1`.
- **신규 순수 헬퍼** `src/lib/pdf/spread.ts`:
  ```ts
  export function groupIntoRows<T>(items: T[], cols: number): T[][]
  ```
  `cols<=1`이면 `items.map(x=>[x])`(1열도 동일 행 구조로 통일). `cols===2`이면 `[[i0,i1],[i2,i3],…]` 마지막 홀수는 `[iN]`. 순수·결정적.
- 박스 폭: `SPREAD_GAP = 16`(Tailwind gap-4). spread일 때 열당 가용폭
  `perCol = Math.floor((containerSize.w - 48 - SPREAD_GAP) / 2)`.
  `computePageBox(p, { zoom, fitMode: fitMode === 'fit-page' ? 'fit-width' : fitMode, availW: cols === 2 ? perCol : containerSize.w, availH: containerSize.h, pad: cols === 2 ? 0 : 48 })`.
  (1열 경로는 기존과 **동일 인자**(availW=containerSize.w, pad=48) → continuous 회귀 0.)
- 레이아웃: `boxes`는 페이지 인덱스 기준 그대로 유지(인덱스 i ↔ boxes[i]). 렌더는 `groupIntoRows(pages, cols)`로 행 생성 후:
  ```
  <div ...container flex-col gap-4...>
    {rows.map(row => (
      <div key=... className="flex flex-row gap-4 justify-center">
        {row.map(p => <PageSlot key=`${doc.id}-${p.index}` page={p} box={boxes[p.index]} doc={doc} pageIndex={p.index} visible={visible.has(p.index)} bytes={doc.bytes} />)}
      </div>
    ))}
  </div>
  ```
  행 `key`는 행 첫 페이지 인덱스(`row[0].index`).
- **PageSlot 무변경** — 박스만 주입받아 렌더(슬롯별 `data-page-index` 유지).
- **윈도잉 IO 재관찰 필수(중요):** continuous↔spread 전환 시 children 구조가 `PageSlot` 평면 리스트 ↔ `<div(row)><PageSlot/></div>` 중첩으로 바뀌어 React가 PageSlot을 **리마운트**한다(부모 엘리먼트 타입 변경). 기존 IO effect deps `[pages.length, activeDoc?.id]`는 `viewMode` 미포함이라 재실행되지 않아 **리마운트된 새 슬롯을 관찰하지 못함 → 윈도잉 정지(전 페이지 썸네일 고착)**. 따라서 IO effect의 deps 배열에 **`viewMode` 추가**(`[pages.length, activeDoc?.id, viewMode]`)해 모드 전환 시 IO를 재생성·재관찰한다. (단일↔연속은 셸이 ContinuousViewer 자체를 unmount/remount → IO effect 자연 재실행, 별도 처리 불요.)
- **useViewerScrollSync·줌·팬·doc-cache·키보드: 무변경 재사용.** scroll-sync는 매 스크롤 `querySelectorAll('[data-page-index]')` 라이브 조회라 행 구조와 무관(중앙 Y 최근접; 2열 행은 좌우 Y가 같아 좌측 페이지가 현재 페이지 — 허용). 외부 nav는 해당 페이지 슬롯으로 scrollIntoView(좌/우 어느 열이든 그 행이 보임). doc-cache/줌/팬은 컨테이너 기준이라 무관.

### 4.3 페이지 패널 리사이즈
- **신규** `src/hooks/usePanelWidth.ts`:
  - 시그니처: `usePanelWidth(key: string, def: number, min: number, max: number): { width: number; setWidth: (w: number) => void }`.
  - 초기값: `useState(def)` → 마운트 `useEffect`에서 `localStorage.getItem(key)` 읽어 클램프 후 반영(SSR 안전: effect는 브라우저에서만).
  - `setWidth`: `Math.max(min, Math.min(max, w))` 클램프 → state + `localStorage.setItem(key, String(clamped))`.
- **신규** `src/components/layout/PanelResizer.tsx`:
  - 확정 props: `{ width: number; min: number; max: number; onWidthChange: (w: number) => void }`.
  - 동작: `pointerdown`에서 `startX=e.clientX`, `startW=width`, `setPointerCapture`; `pointermove`에서 `onWidthChange(startW + (e.clientX - startX))`(클램프는 호출측 `setWidth`가 수행); `pointerup`/`pointercancel`에서 capture 해제·드래그 종료. 드래그 중 `document.body.style.userSelect='none'`(종료 시 복원)으로 텍스트 선택 방지.
  - 시각: 패널 우측 경계에 절대배치(`absolute right-0 top-0 h-full w-1.5`, ≈6px) hit 영역, `cursor-col-resize`, hover/active 시 `bg-primary/40` 강조, `role="separator" aria-orientation="vertical" aria-label="페이지 패널 크기 조절"`.
- `AppShell`: 페이지 패널 `<div>`의 `w-[15.5rem]` 제거 → `style={{ width }}`(`relative` 추가), 내부 끝에 `<PanelResizer .../>`. `usePanelWidth('pdf-office-pages-panel-w', 248, 180, 420)` 사용. 문서 사이드바·모바일 Sheet 드로어·overflow 구조 **무변경**(데스크탑 `md:flex` 한정).

## 5. 데이터 흐름 / 에러 처리

- 보기 모드: 사용자가 ZoomControl에서 `setViewMode('spread')` → 셸은 ContinuousViewer 유지(리렌더). `cols` 변경 → `boxes` 재계산(useMemo deps에 `viewMode` 추가) → `groupIntoRows`로 행 레이아웃 갱신. children 구조가 평면↔중첩으로 바뀌어 PageSlot이 **리마운트**되므로 §4.2대로 **IO effect deps에 `viewMode`를 포함**해 IO를 재생성·새 슬롯 재관찰한다(이게 없으면 윈도잉 정지). 도그푸딩 §6.2/6.3에서 모드 토글 후 윈도잉 정상 동작 확인.
- 패널 너비: localStorage 단일 정수. 손상값(NaN/범위 밖)은 클램프·`Number.isFinite` 가드로 기본값 폴백.
- 에러: 기존 PageSlot 슬롯별 에러+재시도 그대로. 리사이즈 클램프로 패널 0폭/과대 방지. 빈 문서·문서 없음 상태는 기존 분기 유지.

## 6. 검증 (완료 기준)

프로젝트 표준(테스트 러너 없음 — `pdf-office-verification-model` 메모리): `npx tsc --noEmit` 0 · `npm run build` exit 0. **헤드리스 도그푸딩**:
1. 5p PDF: `2페이지` 토글 → 2열, 행=1·2/3·4/5(홀수 끝 단독), 각 페이지 절반폭.
2. 보기 모드 3종 토글 상호 전환(연속 1열 ↔ 단일 ↔ 2페이지 2열) 회귀 0, 새로고침 시 모드 영속.
3. 2페이지에서 스크롤 시 페이지 표시·썸네일 동기화, 윈도잉(먼 슬롯 썸네일/스켈레톤), Ctrl+휠 줌·드래그 팬 동작.
4. 페이지 패널 우측 핸들 드래그 → 너비 변경(클램프 180~420), 새로고침 후 영속, 손상 localStorage 폴백.
5. 단일/연속 모드·문서 사이드바·모바일 드로어 회귀 0.
6. 프로덕션 폴링 검증(main 푸시 후, 별도 사용자 요청 시 — `pdf-office-workflow` 메모리 1세트).

## 7. 리스크 / 완화

| 리스크 | 완화 |
|--------|------|
| 모드 전환 시 IO 윈도잉 stale(슬롯 리마운트) | IO effect deps에 `viewMode` 추가 → 전환 시 IO 재생성·재관찰(§4.2). 미적용 시 윈도잉 정지(전 페이지 썸네일 고착). 도그푸딩 §6.2/6.3 필수 확인 |
| 2열에서 페이지가 컨테이너 초과(저폭/고줌) | 기존 드래그 팬(`scrollWidth>clientWidth`)이 흡수, 박스는 perCol로 축소 |
| 리사이즈 핸들 vs 텍스트 선택/스크롤 | pointer capture + `cursor-col-resize`, hit 영역 한정(6px), 드래그 중 `user-select:none` |
| localStorage 손상/없음 | `Number.isFinite`+클램프, 기본 248 폴백 |
| continuous(1열) 회귀 | spread 분기에서만 인자 변경, 1열은 기존과 **동일 인자**(availW=w, pad=48) |

## 8. 파일 변경 맵

| 파일 | 변경 |
|------|------|
| `src/lib/types.ts` | `ViewMode`에 `'spread'` 추가 |
| `src/lib/pdf/spread.ts` | **신규** `groupIntoRows` 순수 헬퍼 |
| `src/components/viewer/ContinuousViewer.tsx` | viewMode·cols·perCol 박스폭·행 그룹 레이아웃(boxes useMemo deps에 viewMode) |
| `src/components/viewer/PdfViewer.tsx` | 셸 분기 `single ? Single : Continuous` |
| `src/components/viewer/ZoomControl.tsx` | 보기 모드 3번째 `2페이지`(Columns2) 버튼 |
| `src/hooks/usePanelWidth.ts` | **신규** 너비 상태+localStorage+클램프 |
| `src/components/layout/PanelResizer.tsx` | **신규** 드래그 핸들 |
| `src/components/layout/AppShell.tsx` | 페이지 패널 width 동적 + PanelResizer 배치 |

(PageSlot·useViewerScrollSync·doc-cache·page-box·renderer·SinglePageViewer·store 액션: **무변경**.)
