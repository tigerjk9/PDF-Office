---
name: pdf-architecture-design
description: PDF Office 웹서비스의 시스템 아키텍처를 설계하는 스킬. Next.js 15 + pdfjs-dist + pdf-lib + Zustand + Anthropic Claude API 기술 스택으로 PDF 업로드/뷰어/페이지편집/병합/AI변환 기능의 컴포넌트 구조, 상태 설계, 타입 정의를 산출한다. 아키텍처 설계, 기술 스택 결정, 컴포넌트 구조 정의가 필요하면 반드시 이 스킬을 사용할 것.
---

# PDF Architecture Design Skill

## 목표

PDF Office 웹서비스의 전체 아키텍처를 설계하여 후속 에이전트(UI/Engine/AI)가 독립적으로 구현할 수 있는 명확한 인터페이스와 파일 구조를 산출한다.

## 설계 원칙

1. **클라이언트 사이드 우선**: 파일을 서버에 올리지 않고 브라우저에서 처리
2. **라이브러리 역할 분리**: pdfjs-dist(읽기/렌더링) ↔ pdf-lib(쓰기/조작) 명확히 구분
3. **타입 우선**: 구현 전에 TypeScript 인터페이스를 먼저 정의
4. **참고 레포 패턴**: jkwon-startup/pdfconvert-web의 extractors/providers 패턴 참고

## 산출물 구조

```
_workspace/01_architecture/
├── system-overview.md      ← 전체 아키텍처 + 데이터 흐름
├── component-tree.md       ← 컴포넌트 계층 (파일 경로 포함)
├── state-design.md         ← Zustand 스토어 설계
├── api-interfaces.ts       ← 공유 TypeScript 타입
└── task-breakdown.md       ← 에이전트별 구현 범위
```

## api-interfaces.ts 필수 포함 타입

```typescript
// PDF 문서
export interface PdfDocument {
  id: string
  name: string
  bytes: Uint8Array
  pageCount: number
  pages: PdfPage[]
}

// PDF 페이지
export interface PdfPage {
  index: number        // 0-based
  docId: string
  thumbnail?: string   // data URL
  selected: boolean
  width: number
  height: number
}

// 편집 작업
export type PdfOperation =
  | { type: 'delete'; pageIndices: number[] }
  | { type: 'reorder'; newOrder: number[] }
  | { type: 'merge'; docIds: string[] }
  | { type: 'rotate'; pageIndex: number; degrees: 90 | 180 | 270 }

// Zustand 스토어
export interface PdfStore {
  documents: PdfDocument[]
  activeDocId: string | null
  selectedPages: number[]
  editMode: 'view' | 'edit' | 'merge'
  isLoading: boolean
  error: string | null
  // 액션
  loadDocument: (file: File) => Promise<void>
  applyOperation: (op: PdfOperation) => Promise<void>
  exportDocument: (docId: string) => Promise<void>
  clearError: () => void
}

// AI 변환
export interface ConversionResult {
  markdown: string
  tokensUsed: number
  provider: 'claude' | 'gemini' | 'openai'
}
```

## state-design.md 필수 포함 항목

- Zustand 스토어 분리 기준 (하나의 큰 스토어 vs 도메인별 분리)
- 비동기 액션 패턴 (로딩/에러 상태 관리 방법)
- 파일 참조 방식 (Uint8Array in-memory vs File객체 vs URL.createObjectURL)
- 페이지 선택 상태 (단일/다중 선택)

## component-tree.md 필수 포함 항목

- 각 컴포넌트의 props 타입 (api-interfaces.ts 타입 참조)
- 클라이언트/서버 컴포넌트 구분 ('use client' 필요 여부)
- shadcn/ui 사용 컴포넌트 목록

## 완료 기준

- 모든 4개 산출물 파일 생성됨
- `api-interfaces.ts`가 유효한 TypeScript 구문
- `task-breakdown.md`에 UI/Engine/AI 각 에이전트 구현 파일 목록 명시됨
