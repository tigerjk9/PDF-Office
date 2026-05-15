'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Eye,
  Code2,
  Loader2,
  AlertCircle,
  Sparkles,
  KeyRound,
  History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { MarkdownPreview } from '@/components/ai/MarkdownPreview'
import {
  useAiConverterContract,
  computeDocKey,
  type ConvertScope,
  type ConvertOptions,
} from '@/hooks/useAiConverterContract'
import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'
import type { AIProvider } from '@/lib/types'

/**
 * PROVIDERS 라벨은 server/* 모델 상수와 정확히 정합한다 (R2-1):
 * claude-sonnet-4-6 / gemini-2.5-flash / gpt-4o.
 */
const PROVIDERS: {
  id: AIProvider
  label: string
  model: string
  placeholder: string
}[] = [
  {
    id: 'claude',
    label: 'Claude',
    model: 'Claude Sonnet 4.6',
    placeholder: 'sk-ant-...',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    model: 'Gemini 2.5 Flash',
    placeholder: 'AIza...',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    model: 'GPT-4o',
    placeholder: 'sk-...',
  },
]

const SCOPE_OPTIONS: { id: ConvertScope; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'current', label: '현재 페이지' },
  { id: 'selected', label: '선택 페이지' },
  { id: 'range', label: '범위' },
]

/** 캐시 완료 시각을 한국어로 표시 (예: "5월 15일 14:32"). */
function formatCachedAt(ms: number): string {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms))
  } catch {
    return new Date(ms).toLocaleString('ko-KR')
  }
}

export function ConvertPanel() {
  const activeDoc = usePdfStore(selectActiveDoc)
  const selectedPages = usePdfStore((s) => s.selectedPages)
  const currentPageIndex = usePdfStore((s) => s.viewer.currentPageIndex)

  const [provider, setProvider] = useState<AIProvider>('claude')
  const [showKey, setShowKey] = useState(false)
  const [scope, setScope] = useState<ConvertScope>('all')
  // 범위 입력은 1-based 표시값 (사용자 친화). 변환 전 0-based로 변환.
  const [rangeStart, setRangeStart] = useState('1')
  const [rangeEnd, setRangeEnd] = useState('1')

  const {
    markdown,
    isConverting,
    error,
    progress,
    convert,
    cancel,
    setApiKey,
    getApiKey,
    hasCachedResult,
    restoreCached,
    cachedAt,
  } = useAiConverterContract()

  const currentKey = getApiKey(provider) ?? ''
  const providerInfo = PROVIDERS.find((p) => p.id === provider)!

  // P2-7: 활성 문서의 캐시 키 (동결 계약 계산식과 일치).
  const docKey = useMemo(
    () =>
      activeDoc
        ? computeDocKey({
            name: activeDoc.name,
            sizeBytes: activeDoc.sizeBytes,
            pageCount: activeDoc.pageCount,
          })
        : null,
    [activeDoc],
  )

  const hasCache = docKey ? hasCachedResult(docKey) : false
  const cachedTime = docKey ? cachedAt(docKey) : null

  // 문서가 바뀌면 범위 입력 기본값을 전체 범위로 리셋.
  useEffect(() => {
    if (!activeDoc) return
    setRangeStart('1')
    setRangeEnd(String(activeDoc.pageCount))
    setScope('all')
  }, [activeDoc])

  if (!activeDoc) {
    return (
      <div className="flex h-full items-start p-5">
        <p className="max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
          먼저 PDF 문서를 열어야 AI 변환을 사용할 수 있습니다.
        </p>
      </div>
    )
  }

  const pageCount = activeDoc.pageCount

  // 범위 입력 → 0-based 클램프된 { start, end }
  const parseRange = (): { start: number; end: number } => {
    const s = Math.max(1, Math.min(pageCount, parseInt(rangeStart, 10) || 1))
    const e = Math.max(1, Math.min(pageCount, parseInt(rangeEnd, 10) || 1))
    const lo = Math.min(s, e)
    const hi = Math.max(s, e)
    return { start: lo - 1, end: hi - 1 }
  }

  // 선택된 scope가 변환 가능한 상태인지 (선택 페이지 없으면 selected 불가)
  const selectedInvalid = scope === 'selected' && selectedPages.length === 0
  const canConvert = !!currentKey && !isConverting && !selectedInvalid

  const buildOptions = (): ConvertOptions => {
    if (scope === 'current') {
      return { scope, pages: [currentPageIndex], docKey: docKey ?? undefined }
    }
    if (scope === 'selected') {
      return {
        scope,
        pages: [...selectedPages],
        docKey: docKey ?? undefined,
      }
    }
    if (scope === 'range') {
      return {
        scope,
        pageRange: parseRange(),
        docKey: docKey ?? undefined,
      }
    }
    return { scope: 'all', docKey: docKey ?? undefined }
  }

  const handleConvert = () => {
    if (!canConvert) return
    void convert(activeDoc.bytes, provider, buildOptions())
  }

  const handleRestoreCache = () => {
    if (!docKey) return
    void restoreCached(docKey)
  }

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(provider, e.target.value)
  }

  const progressPct = Math.round(progress * 100)
  const hasStreamingText = markdown.length > 0
  const showResultArea = hasStreamingText || isConverting

  return (
    <div className="flex h-full flex-col">
      {/* 설정 영역 */}
      <div className="flex-shrink-0 space-y-4 border-b border-border p-4">
        {/* P2-7: 이전 변환 결과 캐시 배너 */}
        {hasCache && !isConverting && (
          <div className="flex items-center gap-2.5 rounded-md border border-primary-soft-border bg-primary-soft p-2.5 text-xs">
            <History
              className="h-4 w-4 flex-shrink-0 text-primary"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">
                이전 변환 결과가 있습니다
              </p>
              {cachedTime != null && (
                <p className="mt-0.5 text-2xs text-muted-foreground">
                  {formatCachedAt(cachedTime)}에 변환됨
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="flex-shrink-0"
              onClick={handleRestoreCache}
              aria-label="이전 변환 결과 불러오기"
            >
              <History className="h-3 w-3" />
              불러오기
            </Button>
          </div>
        )}

        {/* 제공자 선택 — 세그먼트 컨트롤 */}
        <div>
          <label className="mb-2 block text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            AI 제공자
          </label>
          <div
            className="flex gap-0.5 rounded-md border border-border bg-muted p-0.5"
            role="group"
            aria-label="AI 제공자 선택"
          >
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                disabled={isConverting}
                className={`flex-1 rounded-[5px] px-2 py-1 text-xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                  provider === p.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={provider === p.id}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-2xs text-muted-foreground">
            모델:{' '}
            <span className="font-medium text-foreground">
              {providerInfo.model}
            </span>
          </p>
        </div>

        {/* P2-2: 변환 범위 선택 */}
        <div>
          <label className="mb-2 block text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            변환 범위
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {SCOPE_OPTIONS.map((opt) => {
              const disabled =
                isConverting ||
                (opt.id === 'selected' && selectedPages.length === 0)
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setScope(opt.id)}
                  disabled={disabled}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 ${
                    scope === opt.id
                      ? 'border-primary-soft-border bg-primary-soft text-primary'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  }`}
                  aria-pressed={scope === opt.id}
                >
                  {opt.label}
                  {opt.id === 'selected' && selectedPages.length > 0 && (
                    <span className="ml-1 tabular-nums text-muted-foreground">
                      ({selectedPages.length})
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* scope별 보조 안내/입력 */}
          {scope === 'current' && (
            <p className="mt-2 text-2xs text-muted-foreground">
              현재 페이지({currentPageIndex + 1}p)만 변환합니다.
            </p>
          )}
          {scope === 'selected' && (
            <p className="mt-2 text-2xs text-muted-foreground">
              {selectedPages.length > 0
                ? `선택한 ${selectedPages.length}개 페이지를 변환합니다.`
                : '왼쪽 페이지 패널에서 페이지를 먼저 선택하세요.'}
            </p>
          )}
          {scope === 'range' && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={rangeStart}
                onChange={(e) =>
                  setRangeStart(e.target.value.replace(/[^0-9]/g, ''))
                }
                disabled={isConverting}
                aria-label="시작 페이지"
                className="h-8 w-16 rounded-md border border-input bg-background px-2 text-center text-xs tabular-nums transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
              <span className="text-xs text-muted-foreground" aria-hidden>
                –
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={rangeEnd}
                onChange={(e) =>
                  setRangeEnd(e.target.value.replace(/[^0-9]/g, ''))
                }
                disabled={isConverting}
                aria-label="끝 페이지"
                className="h-8 w-16 rounded-md border border-input bg-background px-2 text-center text-xs tabular-nums transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
              <span className="text-2xs text-muted-foreground">
                / 전체 {pageCount}p
              </span>
            </div>
          )}
        </div>

        {/* API 키 입력 */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <KeyRound
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-hidden
            />
            <label className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              API 키
            </label>
            {currentKey && (
              <Badge variant="default" className="ml-0.5">
                저장됨
              </Badge>
            )}
          </div>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={currentKey}
              onChange={handleKeyChange}
              placeholder={providerInfo.placeholder}
              className="h-9 w-full rounded-md border border-input bg-background px-3 pr-14 text-xs tabular-nums transition-colors placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${providerInfo.model} API 키`}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[5px] px-1.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={showKey ? 'API 키 숨기기' : 'API 키 표시'}
            >
              {showKey ? '숨기기' : '표시'}
            </button>
          </div>
          <p className="mt-1.5 text-2xs text-muted-foreground">
            브라우저에만 저장되며 서버로 전송되지 않습니다.
          </p>
        </div>

        {/* 변환 버튼 */}
        <div className="flex gap-2">
          {isConverting ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={cancel}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              변환 중… (취소)
            </Button>
          ) : (
            <Button
              size="sm"
              className="flex-1"
              onClick={handleConvert}
              disabled={!canConvert}
              aria-label="PDF를 Markdown으로 변환"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Markdown으로 변환
            </Button>
          )}
        </div>

        {/* 진행률 바 (P1-11) */}
        {isConverting && (
          <div className="space-y-1.5" aria-live="polite">
            <Progress
              value={progressPct}
              indeterminate={progressPct === 0}
            />
            <p className="text-2xs tabular-nums text-muted-foreground">
              {progressPct > 0
                ? `변환 중… ${progressPct}%`
                : '변환을 준비하는 중…'}
            </p>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive-soft-border bg-destructive-soft p-2.5 text-xs text-destructive"
          >
            <AlertCircle
              className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
              aria-hidden
            />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* 결과 영역 — 변환 중에도 스트리밍 텍스트를 실시간 노출 (P1-11) */}
      {showResultArea ? (
        <div className="min-h-0 flex-1">
          {hasStreamingText ? (
            <Tabs defaultValue="preview" className="flex h-full flex-col">
              <div className="flex-shrink-0 px-4 py-2.5">
                <TabsList className="w-full">
                  <TabsTrigger value="preview" className="gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    미리보기
                  </TabsTrigger>
                  <TabsTrigger value="raw" className="gap-1.5">
                    <Code2 className="h-3.5 w-3.5" />
                    원본
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent
                value="preview"
                className="mt-0 min-h-0 flex-1 border-t border-border"
              >
                <MarkdownPreview
                  markdown={markdown}
                  fileName={activeDoc.name.replace(/\.pdf$/i, '.md')}
                />
              </TabsContent>
              <TabsContent
                value="raw"
                className="mt-0 min-h-0 flex-1 border-t border-border"
              >
                <ScrollArea className="h-full">
                  <pre className="whitespace-pre-wrap break-words p-4 font-mono text-2xs leading-relaxed text-foreground">
                    {markdown}
                    {isConverting && (
                      <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-primary align-middle" />
                    )}
                  </pre>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex h-full flex-col items-start justify-center gap-3 px-5">
              <span
                className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-primary border-t-transparent"
                aria-hidden
              />
              <p className="max-w-[34ch] text-xs leading-relaxed text-muted-foreground">
                문서를 분석하고 있습니다. 결과가 준비되는 대로 여기에 실시간으로
                표시됩니다.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-start justify-center gap-2 px-5">
          <p className="text-sm font-medium text-foreground">
            변환 결과가 여기에 표시됩니다
          </p>
          <p className="max-w-[36ch] text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">
              {providerInfo.model}
            </span>{' '}
            API 키를 입력한 뒤{' '}
            <span className="font-medium text-foreground">
              Markdown으로 변환
            </span>
            을 누르세요.
          </p>
        </div>
      )}
    </div>
  )
}
