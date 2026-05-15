'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

interface MarkdownPreviewProps {
  markdown: string
  fileName?: string
}

export function MarkdownPreview({ markdown, fileName = 'document.md' }: MarkdownPreviewProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 클립보드 접근 실패 시 무시
    }
  }

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full flex-col">
      {/* 액션 바 */}
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-border px-4">
        <span className="text-2xs tabular-nums text-muted-foreground">
          {markdown.length.toLocaleString()}자
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            aria-label="Markdown 클립보드에 복사"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-success" />
                <span className="text-success">복사됨</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>복사</span>
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            aria-label="Markdown 파일 다운로드"
          >
            <Download className="h-3.5 w-3.5" />
            <span>.md 다운로드</span>
          </Button>
        </div>
      </div>

      {/* 렌더링된 Markdown */}
      <ScrollArea className="flex-1">
        <div className="md-prose p-5">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </div>
      </ScrollArea>
    </div>
  )
}
