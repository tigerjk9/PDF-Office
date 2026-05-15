'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { pdfjsLib } from '@/lib/pdf/worker-config'
import { usePdfStore } from '@/lib/store/pdf-store'
import type { PdfDocument, RotationDegrees } from '@/lib/types'

/**
 * 한 텍스트 조각의 화면 배치 + PDF pt 좌표.
 *
 * - `screen*` : 캔버스 박스(px, 좌상단 원점) 기준 절대 배치값.
 * - `pdfRect` : PDF pt(좌하단 원점) 기준 영역 — editText 엔진 호출에 사용.
 */
interface TextSpan {
  id: string
  text: string
  /** 캔버스 박스 기준 px (좌상단 원점) */
  screenLeft: number
  screenTop: number
  screenWidth: number
  screenHeight: number
  /** 화면 표시용 폰트 px */
  screenFontPx: number
  /** PDF pt(좌하단 원점) 영역 — editText rect */
  pdfRect: { x: number; y: number; width: number; height: number }
  /** PDF pt 폰트 크기 추정값 */
  pdfFontSize: number
}

interface TextEditLayerProps {
  doc: PdfDocument
  pageIndex: number
  rotation: RotationDegrees
  /** 캔버스 박스 px 크기 + 렌더 scale (PdfViewer boxSize와 동일) */
  box: { w: number; h: number; scale: number }
}

/**
 * 텍스트 편집 오버레이 (R3-2).
 *
 * pdfjs `getTextContent()` 의 각 아이템을 캔버스 박스 위에 절대배치한
 * 클릭 가능한 영역으로 렌더한다. 클릭하면 원문이 채워진 인라인 입력으로
 * 바뀌고, 적용 시 화면 좌표를 PDF pt(좌하단 원점)로 변환해
 * `applyOperation({type:'editText', rect, fontSize})` 를 호출한다.
 *
 * 좌표 변환:
 *  - scale=1, rotation=page.rotation 뷰포트를 별도로 만들어 텍스트 측정.
 *  - 아이템 device 매트릭스 tx = Util.transform(vp.transform, item.transform).
 *    glyph 원점(tx[4],tx[5])은 뷰포트 px(좌상단 원점). 폰트 높이 ≈ hypot(tx[2],tx[3]).
 *  - 화면 배치 = (뷰포트 px) × box.scale  (PdfViewer 렌더 scale 과 정합).
 *  - PDF pt = vp.convertToPdfPoint(x,y) — rotation 을 정확히 역변환.
 *    영역 두 모서리를 변환해 축정렬 bbox 로 rect 산출.
 *
 * 완벽 WYSIWYG 아님(폰트 매칭/리플로우 한계) — 사용 가능 수준 목표.
 */
export function TextEditLayer({
  doc,
  pageIndex,
  rotation,
  box,
}: TextEditLayerProps) {
  const applyOperation = usePdfStore((s) => s.applyOperation)
  const isLoading = usePdfStore((s) => s.isLoading)

  const [spans, setSpans] = useState<TextSpan[]>([])
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [applying, setApplying] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // 페이지/회전/스케일이 바뀌면 텍스트 레이어를 다시 측정한다.
  useEffect(() => {
    let cancelled = false
    setEditingId(null)
    setExtractError(null)

    const extract = async () => {
      setExtracting(true)
      try {
        // 원본 보호: pdfjs 가 버퍼를 detach 할 수 있으므로 복사본 전달.
        const copy = new Uint8Array(doc.bytes.byteLength)
        copy.set(doc.bytes)
        const pdf = await pdfjsLib.getDocument({ data: copy }).promise
        try {
          const page = await pdf.getPage(pageIndex + 1)
          // scale=1 뷰포트 — convertToPdfPoint 가 rotation 까지 역변환.
          const vp = page.getViewport({ scale: 1, rotation })
          const content = await page.getTextContent()

          const next: TextSpan[] = []
          let n = 0
          for (const item of content.items) {
            if (!('str' in item)) continue
            const str = item.str
            if (!str || !str.trim()) continue

            // device(뷰포트 px, 좌상단 원점) 매트릭스.
            const tx = pdfjsLib.Util.transform(
              vp.transform,
              item.transform,
            )
            // glyph 베이스라인 원점 (뷰포트 px)
            const originX = tx[4]
            const originY = tx[5]
            // 폰트 높이(뷰포트 px) ≈ 변환 행렬의 y 스케일 크기.
            const fontPx = Math.hypot(tx[2], tx[3]) || item.height || 10
            const widthPx =
              item.width != null && item.width > 0
                ? item.width * Math.hypot(vp.transform[0], vp.transform[1])
                : str.length * fontPx * 0.5
            // 텍스트 박스 좌상단 (뷰포트 px). baseline 위로 fontPx 만큼.
            const boxLeftVp = originX
            const boxTopVp = originY - fontPx

            // 화면 배치 = 뷰포트 px × 렌더 scale (PdfViewer 와 동일).
            const screenLeft = boxLeftVp * box.scale
            const screenTop = boxTopVp * box.scale
            const screenWidth = Math.max(widthPx * box.scale, 6)
            const screenHeight = Math.max(fontPx * box.scale, 6)

            // PDF pt: 뷰포트 px 두 모서리를 PDF 좌표로 역변환.
            // (좌상단/우하단 → 축정렬 bbox. rotation 은 vp 가 흡수.)
            const p1 = vp.convertToPdfPoint(boxLeftVp, boxTopVp)
            const p2 = vp.convertToPdfPoint(
              boxLeftVp + widthPx,
              boxTopVp + fontPx,
            )
            const minX = Math.min(p1[0], p2[0])
            const minY = Math.min(p1[1], p2[1])
            const maxX = Math.max(p1[0], p2[0])
            const maxY = Math.max(p1[1], p2[1])
            // PDF pt 폰트 크기 — scale=1 이므로 fontPx 가 거의 pt.
            const pdfFontSize = Math.max(
              6,
              Math.min(Math.round(fontPx), 96),
            )

            // pdfRect 를 한 줄 크기로 클램프 (버그1 방어 심화).
            // 상류 변환이 과대평가돼도 엔진 redact 가 인접/다중 라인을
            // 침범하지 않도록 폭/높이를 단단히 제한해 전달한다.
            const rawW = Math.max(maxX - minX, 1)
            const rawH = Math.max(maxY - minY, 1)
            const safeRect = {
              x: minX,
              y: minY,
              width: Math.min(rawW, pdfFontSize * Math.max(str.length, 1) * 1.2),
              height: Math.min(rawH, pdfFontSize * 1.6),
            }

            next.push({
              id: `s${n++}`,
              text: str,
              screenLeft,
              screenTop,
              screenWidth,
              screenHeight,
              screenFontPx: Math.max(screenHeight * 0.82, 6),
              pdfRect: safeRect,
              pdfFontSize,
            })
          }
          page.cleanup()
          if (!cancelled) setSpans(next)
        } finally {
          await pdf.destroy()
        }
      } catch (cause) {
        if (!cancelled) {
          setSpans([])
          setExtractError(
            cause instanceof Error
              ? cause.message
              : '텍스트 레이어를 불러오지 못했습니다.',
          )
        }
      } finally {
        if (!cancelled) setExtracting(false)
      }
    }

    void extract()
    return () => {
      cancelled = true
    }
  }, [doc.bytes, doc.id, pageIndex, rotation, box.scale])

  // 편집 진입 시 입력에 포커스 + 전체 선택.
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  const beginEdit = useCallback((span: TextSpan) => {
    setEditingId(span.id)
    setDraft(span.text)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setDraft('')
  }, [])

  const commitEdit = useCallback(
    async (span: TextSpan) => {
      const nextText = draft
      if (applying) return
      if (nextText === span.text) {
        cancelEdit()
        return
      }
      setApplying(true)
      try {
        const result = await applyOperation({
          type: 'editText',
          docId: doc.id,
          pageIndex,
          targetText: span.text,
          replacementText: nextText,
          rect: span.pdfRect,
          fontSize: span.pdfFontSize,
        })
        if (result.success) {
          toast.success('텍스트를 수정했습니다', {
            description: result.warning
              ? result.warning
              : '변경 내용이 페이지에 반영되었습니다.',
          })
          setEditingId(null)
          setDraft('')
        } else {
          toast.error('텍스트 수정에 실패했습니다', {
            description:
              result.error?.message ?? '알 수 없는 오류가 발생했습니다.',
          })
        }
      } catch (cause) {
        toast.error('텍스트 수정에 실패했습니다', {
          description:
            cause instanceof Error
              ? cause.message
              : '예기치 못한 오류가 발생했습니다.',
        })
      } finally {
        setApplying(false)
      }
    },
    [draft, applying, applyOperation, cancelEdit, doc.id, pageIndex],
  )

  const busy = applying || isLoading

  return (
    <div
      className="absolute inset-0 z-10"
      style={{ width: box.w, height: box.h }}
      role="group"
      aria-label="텍스트 편집 레이어"
    >
      {/* 안내 배지 — 측정 중/빈 상태/오류 */}
      {extracting && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-2.5 py-1 text-2xs text-muted-foreground shadow-sm">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            텍스트 분석 중…
          </span>
        </div>
      )}
      {!extracting && extractError && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-destructive-soft-border bg-destructive-soft px-2.5 py-1 text-2xs text-destructive shadow-sm">
            {extractError}
          </span>
        </div>
      )}
      {!extracting && !extractError && spans.length === 0 && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-2.5 py-1 text-2xs text-muted-foreground shadow-sm">
            이 페이지에서 편집 가능한 텍스트를 찾지 못했습니다(스캔/이미지
            PDF일 수 있음).
          </span>
        </div>
      )}

      {spans.map((span) => {
        const isEditing = editingId === span.id
        if (isEditing) {
          return (
            <div
              key={span.id}
              className="absolute flex items-center gap-1"
              style={{
                left: span.screenLeft,
                top: span.screenTop,
                minWidth: Math.max(span.screenWidth, 80),
              }}
            >
              <input
                ref={inputRef}
                value={draft}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void commitEdit(span)
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelEdit()
                  }
                  e.stopPropagation()
                }}
                aria-label={`텍스트 편집: ${span.text}`}
                className="h-7 w-full rounded-md border border-primary bg-background px-2 text-xs text-foreground shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                onClick={() => void commitEdit(span)}
                disabled={busy}
                aria-label="텍스트 변경 적용"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {applying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={busy}
                aria-label="텍스트 편집 취소"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border-strong bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          )
        }
        return (
          <button
            key={span.id}
            type="button"
            onClick={() => beginEdit(span)}
            disabled={busy}
            title={span.text}
            aria-label={`텍스트 편집: ${span.text}`}
            className="absolute cursor-text rounded-[2px] border border-transparent text-left ring-1 ring-primary/25 transition-colors hover:bg-primary-soft/70 hover:ring-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              left: span.screenLeft,
              top: span.screenTop,
              width: span.screenWidth,
              height: span.screenHeight,
            }}
          >
            <span className="sr-only">{span.text}</span>
          </button>
        )
      })}
    </div>
  )
}
