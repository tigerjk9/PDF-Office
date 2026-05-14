---
name: pdf-office-orchestrator
description: "PDF Office 웹서비스 전체 개발을 조율하는 오케스트레이터. PDF 업로드, 페이지 삭제/순서조정/텍스트편집, 파일 병합, PDF→Markdown AI 변환 기능을 Next.js + pdfjs-dist + pdf-lib + Claude API로 구축한다. '개발해줘', '만들어줘', '시작해줘', 'PDF 서비스 구현', 'PDF 웹앱 빌드' 등 개발 착수 요청 시 반드시 이 스킬을 사용. 후속 작업: 결과 수정, 기능 추가, 부분 재실행, 업데이트, 보완, 다시 만들어줘 요청 시에도 반드시 이 스킬을 사용."
---

# PDF Office Orchestrator

PDF 업로드/편집/병합/AI변환 웹서비스를 5개 전문 에이전트로 구축하는 통합 오케스트레이터.

## 실행 모드: 하이브리드 (서브 에이전트)

각 Phase별 실행 모드:
- **Phase 1 (아키텍처)**: 단일 서브 에이전트 (pdf-architect)
- **Phase 2 (개발)**: 병렬 서브 에이전트 3개 (pdf-ui + pdf-engine + pdf-ai-integration)
- **Phase 3 (QA)**: 단일 서브 에이전트 (pdf-qa)

에이전트 간 데이터 전달: 파일 기반 (`_workspace/` 디렉토리)

## 에이전트 구성

| 에이전트 | 타입 | 스킬 | 출력 경로 |
|---------|------|------|---------|
| pdf-architect | general-purpose | pdf-architecture-design | `_workspace/01_architecture/` |
| pdf-ui | general-purpose | pdf-ui-development | `src/app/`, `src/components/` |
| pdf-engine | general-purpose | pdf-processing-engine | `src/lib/pdf/`, `src/lib/store/` |
| pdf-ai-integration | general-purpose | pdf-ai-converter | `src/lib/ai/` |
| pdf-qa | general-purpose | pdf-qa-validation | `_workspace/03_qa/` |

## 워크플로우

### Phase 0: 컨텍스트 확인

1. `_workspace/` 존재 여부 확인
2. 실행 모드 결정:
   - **미존재** → 초기 실행. Phase 1 진행
   - **존재 + 부분 수정 요청** → 해당 에이전트만 재호출 (예: "UI만 다시", "QA 재실행")
   - **존재 + 새 입력** → `_workspace/`를 `_workspace_{YYYYMMDD}/`로 이동 후 Phase 1 진행

### Phase 1: 아키텍처 설계

**실행 모드: 서브 에이전트 (단일)**

```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  description: "PDF Office 아키텍처 설계",
  prompt: """
    당신은 pdf-architect 에이전트입니다.
    에이전트 정의: .claude/agents/pdf-architect.md
    사용할 스킬: .claude/skills/pdf-architecture-design/SKILL.md
    
    두 파일을 모두 읽은 뒤 PDF Office 웹서비스의 아키텍처를 설계하세요.
    
    요구사항:
    - PDF 업로드 (드래그앤드롭, 다중 파일)
    - PDF 뷰어 (페이지 렌더링, 줌)
    - 페이지 관리 (삭제, 순서 변경, 회전)
    - 파일 병합 (2개 이상 PDF 합치기)
    - AI 변환 (PDF→Markdown, Claude/Gemini/GPT 지원)
    
    참고 레포: https://github.com/jkwon-startup/pdfconvert-web
    기술 스택: Next.js 15, TypeScript, Tailwind v4, shadcn/ui, pdfjs-dist, pdf-lib, Zustand
    
    _workspace/01_architecture/ 에 산출물을 저장하세요.
  """
)
```

완료 후: `_workspace/01_architecture/` 파일 존재 확인

### Phase 2: 병렬 개발

**실행 모드: 병렬 서브 에이전트 (3개 동시)**

3개를 동시에 실행한다 (단일 메시지에 3개 Agent 도구 호출):

**에이전트 2-A: UI 개발**
```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  description: "PDF Office UI 컴포넌트 구현",
  prompt: """
    당신은 pdf-ui 에이전트입니다.
    에이전트 정의: .claude/agents/pdf-ui.md
    사용할 스킬: .claude/skills/pdf-ui-development/SKILL.md
    
    먼저 두 파일을 읽으세요. 그 다음:
    1. _workspace/01_architecture/ 의 모든 파일을 읽으세요
    2. 스킬 가이드에 따라 UI 컴포넌트를 구현하세요
    3. 완료 후 _workspace/02_ui/done.md 에 구현한 파일 목록을 기록하세요
    
    주의: src/ 경로가 없으면 Next.js 프로젝트를 먼저 초기화하세요.
  """
)
```

**에이전트 2-B: PDF 엔진 개발**
```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  description: "PDF 처리 엔진 구현",
  prompt: """
    당신은 pdf-engine 에이전트입니다.
    에이전트 정의: .claude/agents/pdf-engine.md
    사용할 스킬: .claude/skills/pdf-processing-engine/SKILL.md
    
    먼저 두 파일을 읽으세요. 그 다음:
    1. _workspace/01_architecture/ 의 api-interfaces.ts와 state-design.md를 읽으세요
    2. 스킬 가이드에 따라 PDF 엔진과 Zustand 스토어를 구현하세요
    3. 완료 후 _workspace/02_engine/done.md 에 구현한 파일 목록을 기록하세요
  """
)
```

**에이전트 2-C: AI 통합 개발**
```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  description: "AI 변환 기능 구현",
  prompt: """
    당신은 pdf-ai-integration 에이전트입니다.
    에이전트 정의: .claude/agents/pdf-ai-integration.md
    사용할 스킬: .claude/skills/pdf-ai-converter/SKILL.md
    
    먼저 두 파일을 읽으세요. 그 다음:
    1. _workspace/01_architecture/ 의 api-interfaces.ts를 읽으세요
    2. 스킬 가이드에 따라 AI 변환 모듈을 구현하세요
    3. 완료 후 _workspace/02_ai/done.md 에 구현한 파일 목록을 기록하세요
  """
)
```

3개 에이전트 모두 완료 후 다음 Phase 진행.

### Phase 3: QA 검증

**실행 모드: 서브 에이전트 (단일)**

```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  description: "PDF Office QA 검증",
  prompt: """
    당신은 pdf-qa 에이전트입니다.
    에이전트 정의: .claude/agents/pdf-qa.md
    사용할 스킬: .claude/skills/pdf-qa-validation/SKILL.md
    
    먼저 두 파일을 읽으세요. 그 다음:
    1. _workspace/ 의 모든 done.md 파일을 읽어 구현 현황 파악
    2. 스킬의 검증 체크리스트를 모두 실행
    3. Critical/Major 문제 즉시 수정
    4. npx tsc --noEmit 실행
    5. _workspace/03_qa/qa-report.md 생성
    
    최종 목표: TypeScript 오류 0개, 빌드 PASS
  """
)
```

### Phase 4: 완료 보고

사용자에게 최종 보고:
1. 생성된 파일 목록 (`_workspace/03_qa/qa-report.md` 요약)
2. 개발 서버 시작 방법: `npm run dev`
3. 남은 수동 작업 (API 키 설정 등)
4. 피드백 요청

## 에러 핸들링

- Phase 1 실패: `_workspace/01_architecture/` 없으면 재실행 1회
- Phase 2 에이전트 실패: `done.md` 없는 에이전트만 개별 재호출
- Phase 3 빌드 실패: QA 에이전트에 "빌드 오류 수정" 모드로 재호출

## 테스트 시나리오

### 정상 흐름
1. "PDF 웹 서비스 개발 시작해줘" → 전체 파이프라인 실행
2. 각 Phase 완료 확인 → 빌드 PASS → 완료 보고

### 부분 재실행
1. "UI 부분만 다시 만들어줘" → Phase 0에서 _workspace 감지 → pdf-ui 에이전트만 재호출
2. "QA 다시 실행해줘" → pdf-qa 에이전트만 재호출

### 에러 흐름
1. TypeScript 오류 발생 → QA 에이전트가 수정 → 재컴파일
2. Phase 2 에이전트 하나 실패 → 해당 에이전트만 재시도
