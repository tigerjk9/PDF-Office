'use client'

import { useState } from 'react'
import { Eye, Code2, Loader2, AlertCircle, Sparkles, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { MarkdownPreview } from '@/components/ai/MarkdownPreview'
import { useAiConverter } from '@/hooks/useAiConverter'
import { usePdfStore, selectActiveDoc } from '@/lib/store/pdf-store'
import type { AIProvider } from '@/lib/types'

const PROVIDERS: { id: AIProvider; label: string; placeholder: string }[] = [
  { id: 'claude', label: 'Claude', placeholder: 'sk-ant-...' },
  { id: 'gemini', label: 'Gemini', placeholder: 'AIza...' },
  { id: 'openai', label: 'GPT-4o', placeholder: 'sk-...' },
]

export function ConvertPanel() {
  const activeDoc = usePdfStore(selectActiveDoc)
  const [provider, setProvider] = useState<AIProvider>('claude')
  const [showKey, setShowKey] = useState(false)
  const { markdown, isConverting, error, convert, cancel, setApiKey, getApiKey } = useAiConverter()

  const currentKey = getApiKey(provider) ?? ''
  const providerInfo = PROVIDERS.find((p) => p.id === provider)!

  const handleConvert = () => {
    if (!activeDoc) return
    void convert(activeDoc.bytes, provider)
  }

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(provider, e.target.value)
  }

  if (!activeDoc) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Open a PDF document first to use AI conversion.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* 설정 영역 */}
      <div className="flex-shrink-0 space-y-4 border-b p-4">
        {/* 제공자 선택 */}
        <div>
          <label className="mb-2 block text-xs font-medium text-foreground">AI Provider</label>
          <div className="flex gap-1.5">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  provider === p.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-gray-200 bg-white text-foreground hover:bg-gray-50'
                }`}
                aria-pressed={provider === p.id}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* API 키 입력 */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
            <label className="text-xs font-medium text-foreground">API Key</label>
            {currentKey && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                Saved
              </Badge>
            )}
          </div>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={currentKey}
              onChange={handleKeyChange}
              placeholder={providerInfo.placeholder}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 pr-16 text-xs font-mono placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label={`API key for ${providerInfo.label}`}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground focus:outline-none"
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Stored in your browser only — never sent to our servers.
          </p>
        </div>

        {/* 변환 버튼 */}
        <div className="flex gap-2">
          {isConverting ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={cancel}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Converting... (Cancel)
            </Button>
          ) : (
            <Button
              size="sm"
              className="flex-1 gap-1.5"
              onClick={handleConvert}
              disabled={!currentKey || isConverting}
              aria-label="Convert PDF to Markdown"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Convert to Markdown
            </Button>
          )}
        </div>

        {/* 에러 */}
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

      {/* 결과 영역 */}
      {markdown ? (
        <div className="min-h-0 flex-1">
          <Tabs defaultValue="preview" className="flex h-full flex-col">
            <TabsList className="mx-4 mt-3 h-8 flex-shrink-0">
              <TabsTrigger value="preview" className="gap-1.5 text-xs">
                <Eye className="h-3.5 w-3.5" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="raw" className="gap-1.5 text-xs">
                <Code2 className="h-3.5 w-3.5" />
                Raw
              </TabsTrigger>
            </TabsList>
            <TabsContent value="preview" className="min-h-0 flex-1 mt-0 border-t">
              <MarkdownPreview
                markdown={markdown}
                fileName={activeDoc.name.replace(/\.pdf$/i, '.md')}
              />
            </TabsContent>
            <TabsContent value="raw" className="min-h-0 flex-1 mt-0 border-t">
              <ScrollArea className="h-full">
                <pre className="whitespace-pre-wrap break-words p-4 text-[11px] font-mono text-foreground">
                  {markdown}
                </pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div className="max-w-[220px] space-y-2">
            <Sparkles className="mx-auto h-8 w-8 text-gray-300" />
            <p className="text-xs text-muted-foreground">
              Enter your API key and click <strong>Convert to Markdown</strong> to get started.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
