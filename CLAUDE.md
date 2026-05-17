# PDF Office — 하네스 포인터

## 하네스: PDF Office 웹서비스

**목표:** PDF 업로드/뷰어/페이지편집/병합/AI변환 기능을 갖춘 클라이언트 사이드 웹서비스 구축

**트리거:** PDF 서비스 개발/기능 구현/수정/재실행 요청 시 `pdf-office-orchestrator` 스킬을 사용하라. 단순 코드 설명이나 질문은 직접 응답 가능.

**기술 스택:**
- Next.js 16.2.6 App Router + TypeScript + Tailwind CSS v3.4 + shadcn/ui
- pdfjs-dist (PDF 렌더링) + pdf-lib (PDF 조작)
- Zustand (상태 관리) + react-dropzone (파일 업로드)
- Anthropic Claude API / Gemini / OpenAI (AI 변환, BYO Key)

**배포:** https://pdf-office-dusky.vercel.app (Vercel Production)

**참고 레포:** https://github.com/jkwon-startup/pdfconvert-web

**핵심 주의사항:**
- `npm install`은 반드시 `--legacy-peer-deps` 사용 (react-dropzone/React 19 peer conflict)
- Turbopack canvas alias: `next.config.mjs`의 `turbopack.resolveAlias.canvas → './src/lib/empty-canvas.js'`
- `src/lib/types.ts`가 타입 SSOT; `src/types/pdf.ts`는 re-export 배럴만
- Gemini API key는 `x-goog-api-key` 헤더로 전달 (URL 쿼리 파라미터 금지)

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-05-14 | 초기 하네스 구성 | 전체 | PDF Office 웹서비스 신규 구축 |
| 2026-05-14 | 전체 서비스 구현 완료 | src/ 전체 | 5-에이전트 하네스 실행 |
| 2026-05-14 | Next.js 16.2.6 업그레이드 | package.json | CVE-2025-66478 Vercel 배포 차단 |
| 2026-05-14 | Turbopack canvas alias 수정 | next.config.mjs | canvas 빌드 오류 해결 |
| 2026-05-14 | 타입 SSOT 정리 | src/types/pdf.ts | 중복 280줄 타입 제거 |
| 2026-05-15 | P0/P1/P2 UX·기능 개선(우선순위 웨이브, 병렬 에이전트) | src/ 전체(20수정+25신규) | 평가 기반 개선: 병합UI 실연결·AI프록시/비전·IndexedDB영속·Undo/Redo·증분썸네일·DnD·단축키·반응형·한국어통일·변환범위·추출/삽입/워터마크/검색/암호해제. tsc 0·build 0·SHIP-READY |
| 2026-05-16 | 텍스트 편집 전면 제거 · 워크스페이스 초기화 · 히어로/푸터 리디자인 · 긴 파일명 삭제버튼 수정 · @pdf-lib/fontkit 제거 · README ko/en 현행화 | src/·docs·package.json | 인플레이스 텍스트편집은 폰트/리플로우 한계로 완벽 재현 불가 → 제거; UX 가독성·발견성 개선; 미사용 의존성 정리. tsc 0·build 0·프로덕션 실측 (a76b4c9~d7bc95e) |
| 2026-05-17 | 뷰어 UX 개선 Phase 1 — 연속 스크롤 기본·보기모드 토글(연속/단일)·공유 pdfjs 캐시(doc-cache)·IO 윈도잉·Ctrl/⌘+휠 줌·드래그 팬·키보드 스크롤·순서 버튼 명료화(#3)·회전 아이콘 RotateCwSquare(#4)·사용안내 | src/(뷰어·스토어·툴바·훅·types)·docs | 사용자 피드백 4건(스크롤 부재·1/2페이지·이동버튼 모호·회전아이콘). 서브에이전트 주도(태스크별 스펙+코드품질 2단계 리뷰), persist v3 마이그레이션. tsc 0·build 0·feat/viewer-ux-phase1 (88abb66~2661893). 후속(Phase 2): 2페이지 스프레드. 추적: scroll-sync per-frame querySelectorAll 성능·휠 getState 정밀줌·ZOOM 상수 추출 |
