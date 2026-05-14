---
name: pdf-qa-validation
description: PDF Office 웹서비스의 품질을 검증하는 스킬. UI-Store-Engine-AI 경계면 인터페이스 정합성, TypeScript 컴파일 오류, pdfjs Worker 설정, API 키 보안, Next.js 빌드 성공 여부를 검사하고 수정한다. QA 검증, 빌드 오류 수정, 코드 품질 검사가 필요하면 반드시 이 스킬을 사용할 것.
---

# PDF QA Validation Skill

## 목표

구현 완료 후 "경계면 교차 비교" 방식으로 품질을 검증하고,
Critical/Major 문제를 즉시 수정하여 빌드 통과를 보장한다.

## 검증 순서

### Step 1: 인터페이스 정합성 (경계면 교차 비교)

```
UI 컴포넌트 props → api-interfaces.ts 타입 → Zustand 스토어 → PDF 엔진 함수
```

체크:
- `usePdfStore()`의 반환 타입이 `PdfStore` 인터페이스와 일치하는가
- UI가 `applyOperation(op: PdfOperation)` 을 올바른 타입으로 호출하는가
- PDF 엔진 함수의 반환 타입(Uint8Array)이 스토어에서 올바르게 처리되는가
- AI 변환 결과(`ConversionResult`)가 UI 컴포넌트에 전달되는가

### Step 2: pdfjs Worker 설정 검증

```typescript
// 올바른 패턴 확인
pdfjsLib.GlobalWorkerOptions.workerSrc = '...'  // 반드시 설정됨

// next.config.ts 확인
config.resolve.alias.canvas = false  // 반드시 있어야 함
```

### Step 3: TypeScript 컴파일

```bash
npx tsc --noEmit 2>&1
```

오류 유형별 처리:
- `TS2345` (타입 불일치): api-interfaces.ts 기준으로 수정
- `TS7006` (암시적 any): 명시적 타입 추가
- `TS2304` (찾을 수 없는 이름): import 추가

### Step 4: 보안 검사

- API 키가 URL 쿼리 파라미터로 전송되지 않는지 확인
- `console.log(apiKey)` 형태의 키 노출 코드 없는지 확인
- localStorage 키 이름 일관성 (`pdf-office-api-key-{provider}`)

### Step 5: Next.js 빌드

```bash
npm run build 2>&1 | tail -30
```

## 문제 심각도 분류

| 심각도 | 정의 | 처리 |
|--------|------|------|
| Critical | 빌드 실패, 런타임 크래시, API 키 노출 | 즉시 수정 |
| Major | TypeScript 오류, 기능 작동 안 함 | 즉시 수정 |
| Minor | 경고, 스타일 불일치, aria 누락 | 보고만 |

## 보고서 형식 (_workspace/03_qa/qa-report.md)

```markdown
# QA Report — {날짜}

## 요약
- Critical: N개
- Major: N개  
- Minor: N개
- 빌드: PASS / FAIL

## Critical 문제
### [C-001] {문제 제목}
- 파일: `src/path/to/file.tsx:42`
- 증거: `코드 스니펫`
- 수정: `수정 내용`
- 상태: FIXED / PENDING

## 빌드 결과
\`\`\`
{tsc 출력}
\`\`\`
```

## 완료 기준

- `npx tsc --noEmit` 오류 0개
- `npm run build` 성공
- Critical/Major 문제 모두 FIXED
- `_workspace/03_qa/qa-report.md` 생성됨
