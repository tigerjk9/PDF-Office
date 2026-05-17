<div align="center">

# PDF Office

**브라우저에서 완결되는 PDF 뷰어 & 편집기 — 서버 없음, 업로드 없음, 내 파일만.**

[![Deploy](https://img.shields.io/badge/Vercel-Live-black?logo=vercel)](https://pdf-office-dusky.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[**라이브 데모 →**](https://pdf-office-dusky.vercel.app)

한국어 · [English](README.en.md)

</div>

---

## 왜 PDF Office인가

- **프라이버시 우선** — 모든 처리가 브라우저 안에서. 파일 업로드·서버 저장·계정·추적이 없습니다.
- **뷰어이자 편집기** — 연속 스크롤·단일·2페이지(2-up) 3가지 보기 모드. 그냥 읽기에도, 페이지를 편집하기에도 한 화면에서.
- **설치 불필요** — 링크 하나로 즉시 사용. 브라우저만 있으면 됩니다.
- **작업 보존** — 업로드·편집·보기 설정(모드·줌·패널 폭)이 브라우저(IndexedDB·localStorage)에 저장되어 새로고침·재방문에도 복원됩니다.

---

## 무엇을 하나요

| 기능 | 설명 |
|---|---|
| **업로드** | 끌어다 놓기 또는 클릭 — 한 번에 여러 PDF |
| **암호 PDF** | 비밀번호로 보호된 PDF 잠금 해제 후 편집 |
| **보기** | 연속 스크롤·단일·**2페이지(2-up)** 3모드 · 마우스/키보드 스크롤 · Ctrl/⌘+휠 줌 · 드래그 팬 · 페이지 패널 폭 조절 |
| **페이지 편집** | 삭제·회전·**드래그로 순서 변경**, 선택(범위/토글), 실행취소/다시실행 |
| **추출 · 삽입 · 워터마크** | 선택 페이지 추출/분할, 빈 페이지·타 문서 페이지 삽입, 워터마크 |
| **검색** | 문서 텍스트 검색 후 해당 페이지로 이동 |
| **병합** | 2개 이상 PDF를 원하는 순서로 결합 — **서로 다른 페이지 크기 자동 정규화** |
| **초기화** | 모든 문서·편집 내역을 한 번에 비우고 처음 상태로 |
| **AI → Markdown** | PDF를 구조화된 Markdown으로 변환 (Claude Sonnet 4.6 / Gemini 2.5 Flash / GPT-4o) |

예외는 **AI 변환** 하나뿐 — 본인이 입력한 키로 동일 출처 프록시를 거쳐 선택한 제공자에만 요청하며, 서버에 저장·로깅되지 않습니다.

---

## 보기 모드 & 뷰어 조작

PDF Office는 편집기이기 이전에 **읽기 좋은 뷰어**입니다. 상단 컨트롤바에서 세 가지 모드를 전환하며, 선택한 모드는 세션에 저장됩니다.

| 모드 | 레이아웃 | 쓰임 |
|---|---|---|
| **연속 스크롤** (기본) | 전 페이지 세로 1열, 끊김 없는 스크롤 | 길게 훑어 읽기 |
| **단일 페이지** | 한 번에 한 페이지, 페이지 맞춤 지원 | 한 장씩 정독·검토 |
| **2페이지 (2-up)** | N행 2열 스프레드(`1·2 / 3·4 …`, 홀수 끝 단독) | 책·논문처럼 펼쳐 보기 |

**조작**

- **스크롤** — 마우스 휠/트랙패드, 또는 키보드 `↑` `↓` · `PageUp` `PageDown` · `Space` · `Home` `End`. 스크롤 위치와 페이지 번호가 양방향 동기화됩니다.
- **줌** — 슬라이더·`+`/`−` 버튼·**`Ctrl`/`⌘` + 휠**. 너비 맞춤은 전 모드, 페이지 맞춤은 단일 모드에서.
- **드래그 팬** — 확대해 콘텐츠가 화면보다 넓을 때 마우스로 끌어 이동.
- **페이지 패널 크기 조절** — 좌측 썸네일 패널 우측 경계를 드래그해 폭을 180~420px 사이로 조절(`role="separator"` 접근성 지원). 폭은 브라우저에 저장되어 새로고침 후에도 유지됩니다.
- **부드러운 대용량 처리** — 화면 밖 페이지는 썸네일 자리표시로 두고 보이는 페이지만 캔버스 렌더(IntersectionObserver 윈도잉) + 공유 pdfjs 문서 캐시(재파싱 0)로, 페이지가 많아도 가볍게 스크롤됩니다.
- **세션 복원** — 보기 모드·줌·패널 폭은 물론 업로드·편집 상태까지 복원됩니다.

---

## 빠른 시작

```bash
git clone https://github.com/tigerjk9/PDF-Office.git
cd PDF-Office

npm install --legacy-peer-deps   # react-dropzone가 React 19와 peer 충돌 → 필수
npm run dev
```

[http://localhost:3000](http://localhost:3000) 접속.

> **참고:** `--legacy-peer-deps`는 필수입니다.

검증(테스트 러너 없음): `npx tsc --noEmit` · `npm run build`.

---

## AI 변환 (BYO Key)

API 키는 **브라우저 `localStorage`에만** 저장되고, 동일 출처 `/api/ai/convert` 프록시를 통해 해당 제공자에만 전달됩니다. 서버에 저장·로깅되지 않습니다.

| 제공자 | 모델 | 키 발급 |
|---|---|---|
| Claude (Anthropic) | `claude-sonnet-4-6` | [console.anthropic.com](https://console.anthropic.com) |
| Gemini (Google) | `gemini-2.5-flash` | [aistudio.google.com](https://aistudio.google.com) |
| OpenAI | `gpt-4o` | [platform.openai.com](https://platform.openai.com) |

텍스트가 없는 스캔 PDF는 페이지 이미지를 비전 모델로 전달해 변환합니다. 변환 범위(전체/현재/선택/범위)를 지정할 수 있고, 결과는 문서별로 캐시됩니다.

---

## 기술 스택

```
Next.js 16 (App Router + Turbopack)
TypeScript · Tailwind CSS v3.4 · shadcn/ui · Pretendard
pdfjs-dist          — PDF 렌더링 / 텍스트 추출
pdf-lib              — PDF 조작 (삭제·회전·재정렬·병합·추출·삽입·워터마크)
Zustand (+ IndexedDB persist) — 상태·세션 보존 (보기 모드 영속 v3 migrate)
react-dropzone      — 파일 업로드
Claude / Gemini / OpenAI — AI 변환 (서버 프록시, BYO Key)
```

---

## 프로젝트 구조

```
src/
├── app/                  # App Router · /api/ai/convert 프록시 라우트
├── components/
│   ├── ai/               # ConvertPanel, MarkdownPreview
│   ├── help/             # HelpSheet (사용 방법)
│   ├── layout/           # AppShell · AppFooter · PanelResizer(패널 폭 드래그 핸들)
│   ├── merge/            # MergeDialog
│   ├── pages/            # PageGrid, PageThumbnail, Insert/Watermark 다이얼로그
│   ├── upload/           # DropZone, FileList, PasswordDialog
│   ├── viewer/           # PdfViewer(셸) · ContinuousViewer · SinglePageViewer · PageSlot · ZoomControl · SearchPanel
│   └── ui/               # shadcn/ui 프리미티브
├── hooks/                # useViewerScrollSync · usePanelWidth · useKeyboardShortcuts · …
├── lib/
│   ├── ai/               # server 어댑터, converter, transport, page-extractor, 캐시
│   ├── pdf/              # loader · renderer · manipulator · merge-normalize · history · spread(2-up) · page-box · doc-cache(공유 문서)
│   ├── store/            # Zustand pdf-store (IndexedDB persist · v3 migrate)
│   └── types.ts          # 타입 SSOT
```

---

## 배포

Vercel용으로 사전 구성되어 있습니다 (`vercel.json`이 `--legacy-peer-deps` 자동 적용). main 브랜치 푸시 시 Git 연동으로 프로덕션 자동 배포됩니다.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftigerjk9%2FPDF-Office)

---

## 알려진 제약

- **OCR 없음** — 텍스트 레이어가 없는 스캔 PDF는 AI 변환 시 페이지 이미지를 비전 모델로 전달합니다(텍스트 추출 자체는 불가).
- **대용량 PDF**(100+ 페이지) — 본문 뷰어는 윈도잉으로 부드럽게 스크롤되지만, 좌측 페이지 패널의 썸네일 생성은 느릴 수 있습니다.

---

<div align="center">

[Next.js](https://nextjs.org)로 제작 · [Vercel](https://vercel.com)에 배포

</div>
