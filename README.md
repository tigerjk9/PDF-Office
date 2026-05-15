<div align="center">

# PDF Office

**브라우저에서 완결되는 PDF 편집기 — 서버 없음, 업로드 없음, 내 파일만.**

[![Deploy](https://img.shields.io/badge/Vercel-Live-black?logo=vercel)](https://pdf-office-dusky.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[**라이브 데모 →**](https://pdf-office-dusky.vercel.app)

한국어 · [English](README.en.md)

</div>

---

## 무엇을 하나요

| 기능 | 설명 |
|---|---|
| **업로드** | 끌어다 놓기 또는 클릭 — 한 번에 여러 PDF |
| **보기** | 페이지별 뷰어, 줌·맞춤(너비/페이지), 안정적 로딩 |
| **페이지 편집** | 삭제·회전·**드래그로 순서 변경**, 선택(범위/토글), 실행취소/다시실행 |
| **텍스트 편집** | 페이지 내 텍스트 클릭 → 인라인 수정 (한글 포함, 임베드 폰트) |
| **추출 · 삽입 · 워터마크** | 선택 페이지 추출/분할, 빈 페이지·타 문서 페이지 삽입, 워터마크 |
| **검색** | 문서 텍스트 검색 후 해당 페이지로 이동 |
| **병합** | 2개 이상 PDF를 원하는 순서로 결합 — **서로 다른 페이지 크기 자동 정규화** |
| **AI → Markdown** | PDF를 구조화된 Markdown으로 변환 (Claude Sonnet 4.6 / Gemini 2.5 Flash / GPT-4o) |

모든 처리는 **브라우저 안에서** 이루어집니다. 파일은 기기를 벗어나지 않습니다. AI 변환만 본인이 입력한 키로 동일 출처 프록시를 거쳐 해당 제공자에 요청합니다. 업로드한 문서·편집 상태는 브라우저(IndexedDB)에 보존되어 새로고침해도 복원됩니다.

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
pdf-lib + @pdf-lib/fontkit — PDF 조작 / 텍스트 편집(CJK 폰트 임베드)
Zustand (+ IndexedDB persist) — 상태·세션 보존
react-dropzone      — 파일 업로드
Claude / Gemini / OpenAI — AI 변환 (서버 프록시, BYO Key)
```

---

## 프로젝트 구조

```
src/
├── app/                  # App Router, api/ai/convert 프록시 라우트
├── components/
│   ├── ai/               # ConvertPanel, MarkdownPreview
│   ├── help/             # HelpSheet (사용 방법)
│   ├── layout/           # AppShell, AppFooter
│   ├── merge/            # MergeDialog
│   ├── pages/            # PageGrid, PageThumbnail, Insert/Watermark 다이얼로그
│   ├── upload/           # DropZone, FileList, PasswordDialog
│   ├── viewer/           # PdfViewer, ZoomControl, SearchPanel, TextEditLayer
│   └── ui/               # shadcn/ui 프리미티브
├── hooks/
├── lib/
│   ├── ai/               # server 어댑터, converter, transport, page-extractor, 캐시
│   ├── pdf/              # loader, renderer, manipulator, merge-normalize, font-embed, history
│   ├── store/            # Zustand pdf-store (IndexedDB persist)
│   └── types.ts          # 타입 SSOT
```

---

## 배포

Vercel용으로 사전 구성되어 있습니다 (`vercel.json`이 `--legacy-peer-deps` 자동 적용). main 브랜치 푸시 시 Git 연동으로 프로덕션 자동 배포됩니다.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftigerjk9%2FPDF-Office)

---

## 알려진 제약

- **텍스트 편집**은 완벽한 WYSIWYG가 아닙니다. 원본 글꼴/스타일을 보존하지 않고(임베드 폰트로 통일), 단일 라인 가정이며, 흰색 redact를 사용해 비흰색 배경 페이지에는 박스 잔흔이, 교체 텍스트가 더 짧으면 원본 꼬리가 보일 수 있습니다.
- **OCR 없음** — 텍스트 레이어가 없는 스캔 PDF는 AI 변환 시 페이지 이미지를 비전 모델로 전달합니다(텍스트 추출 자체는 불가).
- **대용량 PDF**(100+ 페이지)는 썸네일 생성이 느릴 수 있습니다.

---

<div align="center">

[Next.js](https://nextjs.org)로 제작 · [Vercel](https://vercel.com)에 배포

</div>
