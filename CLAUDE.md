# PDF Office — 하네스 포인터

## 하네스: PDF Office 웹서비스

**목표:** PDF 업로드/뷰어/페이지편집/병합/AI변환 기능을 갖춘 클라이언트 사이드 웹서비스 구축

**트리거:** PDF 서비스 개발/기능 구현/수정/재실행 요청 시 `pdf-office-orchestrator` 스킬을 사용하라. 단순 코드 설명이나 질문은 직접 응답 가능.

**기술 스택:**
- Next.js 15 App Router + TypeScript + Tailwind CSS v4 + shadcn/ui
- pdfjs-dist (PDF 렌더링) + pdf-lib (PDF 조작)
- Zustand (상태 관리) + react-dropzone (파일 업로드)
- Anthropic Claude API / Gemini / OpenAI (AI 변환, BYO Key)

**참고 레포:** https://github.com/jkwon-startup/pdfconvert-web

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-05-14 | 초기 하네스 구성 | 전체 | PDF Office 웹서비스 신규 구축 |
