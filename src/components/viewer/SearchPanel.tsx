'use client'

import { useCallback, useState } from 'react'
import { Search, Loader2, AlertCircle, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { searchText } from '@/lib/pdf/search'
import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'

interface SearchResult {
  pageIndex: number
  snippet: string
}

/**
 * 텍스트 검색 패널 (P2-8).
 *
 * - `searchText(activeDoc.bytes, query)` (엔진 동결 계약 lib import) 호출.
 * - 결과 리스트(페이지 번호 + 스니펫). 클릭 시 `setCurrentPage`로 점프.
 * - 캔버스 하이라이트는 범위 외(요구사항) — 페이지 점프로 충분.
 *
 * lib/pdf/search.ts는 import 소비만 한다(수정 금지).
 */
export function SearchPanel() {
  const activeDoc = usePdfStore(selectActiveDoc)
  const setCurrentPage = usePdfStore((s) => s.setCurrentPage)
  const currentPageIndex = usePdfStore((s) => s.viewer.currentPageIndex)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const runSearch = useCallback(async () => {
    if (!activeDoc) return
    const needle = query.trim()
    if (!needle) {
      setResults([])
      setSearched(false)
      return
    }
    setIsSearching(true)
    setError(null)
    try {
      const found = await searchText(activeDoc.bytes, needle)
      setResults(found)
      setSearched(true)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : '검색 중 오류가 발생했습니다.',
      )
      setResults([])
      setSearched(true)
    } finally {
      setIsSearching(false)
    }
  }, [activeDoc, query])

  if (!activeDoc) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        먼저 PDF 문서를 열어야 검색을 사용할 수 있습니다.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* 검색 입력 */}
      <div className="flex-shrink-0 space-y-3 border-b p-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void runSearch()
              }
            }}
            placeholder="문서에서 검색할 텍스트 입력 후 Enter"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="문서 텍스트 검색"
          />
        </div>
        <Button
          size="sm"
          className="w-full gap-1.5"
          onClick={() => void runSearch()}
          disabled={isSearching || query.trim().length === 0}
        >
          {isSearching ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              검색 중...
            </>
          ) : (
            <>
              <Search className="h-3.5 w-3.5" />
              검색
            </>
          )}
        </Button>
        {searched && !isSearching && !error && (
          <p className="text-[10px] text-muted-foreground">
            {results.length > 0
              ? `${results.length}개 페이지에서 찾았습니다.`
              : '일치하는 결과가 없습니다.'}
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* 결과 리스트 */}
      <ScrollArea className="min-h-0 flex-1">
        {results.length > 0 ? (
          <ul className="space-y-1.5 p-3" aria-label="검색 결과">
            {results.map((r) => (
              <li key={r.pageIndex}>
                <button
                  type="button"
                  onClick={() => setCurrentPage(r.pageIndex)}
                  className={`flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    r.pageIndex === currentPageIndex
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:bg-accent'
                  }`}
                  aria-label={`${r.pageIndex + 1}페이지로 이동`}
                >
                  <FileText
                    className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <Badge
                      variant="outline"
                      className="h-4 px-1.5 text-[10px]"
                    >
                      {r.pageIndex + 1}페이지
                    </Badge>
                    <p className="mt-1 line-clamp-3 break-words text-[11px] text-muted-foreground">
                      {r.snippet}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <p className="text-xs text-muted-foreground">
              {searched && !isSearching
                ? '다른 검색어로 다시 시도해 보세요.'
                : '검색어를 입력하면 결과가 여기에 표시됩니다.'}
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
