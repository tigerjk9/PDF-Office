---
name: pdf-ui-development
description: PDF Office 웹서비스의 UI 컴포넌트를 구현하는 스킬. Next.js 15 App Router + shadcn/ui + Tailwind CSS v4로 드래그앤드롭 업로드, PDF 뷰어, 페이지 썸네일 그리드, 순서 조정, 삭제, 병합, AI 변환 패널을 구현한다. UI 컴포넌트 구현이 필요하면 반드시 이 스킬을 사용할 것.
---

# PDF UI Development Skill

## 목표

아키텍처 문서를 기반으로 PDF Office의 모든 UI 컴포넌트와 페이지를 구현한다.
UI는 `usePdfStore` 훅을 통해서만 PDF 상태에 접근하며 직접 PDF 조작 로직을 포함하지 않는다.

## 구현 순서

1. `_workspace/01_architecture/` 문서 읽기 (필수)
2. Next.js 프로젝트 초기화 확인 (package.json 없으면 생성)
3. shadcn/ui 컴포넌트 설치 확인
4. 페이지 레이아웃 구현 (layout.tsx, page.tsx)
5. 기능 컴포넌트 구현 (업로드 → 뷰어 → 페이지관리 → 툴바 → AI패널 순)

## 프로젝트 초기화 (없을 경우)

```bash
# package.json이 없을 때만 실행
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"
npx shadcn@latest init
npx shadcn@latest add button dialog scroll-area separator slider tooltip badge
npm install pdfjs-dist pdf-lib zustand react-dropzone @anthropic-ai/sdk
```

## 컴포넌트별 구현 가이드

### DropZone.tsx
- react-dropzone 사용, `accept: { 'application/pdf': ['.pdf'] }` 
- 다중 파일 드롭 지원 (`multiple: true`)
- 드롭 시 `usePdfStore().loadDocument(file)` 호출
- 진행 중 표시: 파일명 + 스피너

### PdfViewer.tsx
- Canvas ref로 pdfjs 렌더링 수신
- 줌 레벨 상태 (50% ~ 200%, 기본 100%)
- `overflow-auto` 스크롤 영역

### PageGrid.tsx
- 썸네일 그리드 (2~4열, 반응형)
- 드래그 핸들 (GripVertical 아이콘)
- 클릭으로 단일 선택, Shift+클릭으로 범위 선택, Ctrl+클릭으로 다중 선택
- 선택된 페이지: 파란 테두리

### EditorToolbar.tsx
- 삭제: 선택된 페이지 삭제 버튼 (Trash 아이콘)
- 이동: 위/아래/맨앞/맨뒤 버튼
- 회전: 90도 회전 버튼
- 병합: "파일 추가하여 병합" 버튼
- 내보내기: "PDF 다운로드" 버튼

### ConvertPanel.tsx
- 제공자 선택: Claude / Gemini / GPT (탭 또는 드롭다운)
- API 키 입력: type="password" + 저장 버튼 (localStorage)
- 변환 버튼: 비활성 조건 (API 키 없음, 문서 없음)
- 진행률: 스트리밍 텍스트 실시간 표시
- MD 미리보기: react-markdown 렌더링

## 스타일 가이드

- 배경: `bg-gray-50` (전체), `bg-white` (패널)
- 선택 상태: `ring-2 ring-blue-500`
- 위험 액션(삭제): `variant="destructive"`
- 아이콘: lucide-react 전용

## 완료 기준

- `npx tsc --noEmit` 통과
- 모든 컴포넌트가 api-interfaces.ts 타입 사용
- 로딩/에러 상태 표시 구현됨
- 반응형 레이아웃 (모바일 768px 이상)
