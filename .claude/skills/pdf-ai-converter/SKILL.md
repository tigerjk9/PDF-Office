---
name: pdf-ai-converter
description: PDF→Markdown AI 변환 기능을 구현하는 스킬. Anthropic Claude API(claude-opus-4-7), Gemini, OpenAI GPT를 사용한 BYO API Key 모델로 PDF 텍스트를 구조적 Markdown으로 변환하며 스트리밍과 프롬프트 캐싱을 지원한다. AI 변환, API 통합, 스트리밍 응답 구현이 필요하면 반드시 이 스킬을 사용할 것.
---

# PDF AI Converter Skill

## 목표

pdfjs-dist로 추출한 PDF 텍스트를 Claude/Gemini/GPT API로 전송하여
구조적 Markdown으로 변환한다. 클라이언트 사이드에서만 실행 (BYO Key 모델).

## BYO Key 원칙

- API 키는 `localStorage.getItem('pdf-office-api-key-{provider}')` 에 저장
- 모든 API 호출은 브라우저에서 직접 (서버 라우트 없음)
- `dangerouslyAllowBrowser: true` 플래그 사용 (사용자가 키 오너임을 명시)

## 시스템 프롬프트 (prompt.ts)

```typescript
export const SYSTEM_PROMPT = `You are an expert at converting PDF documents to well-structured Markdown.

Rules:
- Use #, ##, ### for headings based on visual hierarchy
- Convert tables to Markdown table syntax
- Preserve numbered and bullet lists
- Wrap code samples in triple backticks with language hint
- Replace images with [Image: description] placeholder
- Remove page numbers, headers, footers, and watermarks
- Preserve all meaningful content
- Output ONLY the Markdown, no commentary`
```

## Claude 구현 (providers/claude.ts)

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from '../prompt'

export async function* streamWithClaude(
  apiKey: string,
  textContent: string
): AsyncGenerator<string, void, unknown> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  
  const stream = client.messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 8096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }  // 프롬프트 캐싱으로 비용 절감
      }
    ],
    messages: [{ role: 'user', content: `Convert this PDF text to Markdown:\n\n${textContent}` }]
  })
  
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      yield chunk.delta.text
    }
  }
}
```

## 청크 분할 전략 (extractor.ts)

긴 PDF는 토큰 한도를 초과할 수 있으므로 페이지 단위로 분할:

```typescript
const MAX_CHARS_PER_CHUNK = 60000  // ~15k 토큰

export function splitIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHARS_PER_CHUNK) return [text]
  
  const chunks: string[] = []
  // 페이지 구분자("\n\n---\n\n")로 분할 시도
  const pages = text.split('\n\n---\n\n')
  let current = ''
  
  for (const page of pages) {
    if ((current + page).length > MAX_CHARS_PER_CHUNK) {
      if (current) chunks.push(current.trim())
      current = page
    } else {
      current += '\n\n---\n\n' + page
    }
  }
  if (current) chunks.push(current.trim())
  return chunks
}
```

## useAiConverter 훅

```typescript
export function useAiConverter() {
  const [markdown, setMarkdown] = useState('')
  const [isConverting, setIsConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)

  const convert = async (pdfBytes: Uint8Array, provider: 'claude' | 'gemini' | 'openai') => {
    const apiKey = localStorage.getItem(`pdf-office-api-key-${provider}`)
    if (!apiKey) { setError('API 키를 입력하세요'); return }
    
    setIsConverting(true)
    setMarkdown('')
    abortRef.current = false

    try {
      // pdfjs로 텍스트 추출
      const text = await extractTextFromPdf(pdfBytes)
      const chunks = splitIntoChunks(text)
      
      let fullMarkdown = ''
      for (const chunk of chunks) {
        if (abortRef.current) break
        for await (const delta of streamWithClaude(apiKey, chunk)) {
          if (abortRef.current) break
          fullMarkdown += delta
          setMarkdown(fullMarkdown)
        }
      }
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setIsConverting(false)
    }
  }

  const cancel = () => { abortRef.current = true }

  return { markdown, isConverting, error, convert, cancel }
}

function getErrorMessage(e: unknown): string {
  const msg = (e as Error).message ?? ''
  if (msg.includes('401')) return 'API 키가 올바르지 않습니다'
  if (msg.includes('429')) return '요청 한도를 초과했습니다. 잠시 후 재시도하세요'
  if (msg.includes('context_length')) return 'PDF가 너무 깁니다. 페이지 범위를 줄여보세요'
  return `변환 오류: ${msg}`
}
```

## 완료 기준

- Claude / Gemini / OpenAI 3개 제공자 구현
- 스트리밍 응답이 실시간으로 UI에 반영
- API 키가 network 요청 로그에서 헤더로만 노출 (쿼리 파라미터 금지)
- 청크 분할 시 chunk 간 연속성 유지 (마크다운이 잘리지 않음)
- 취소 기능 정상 동작
