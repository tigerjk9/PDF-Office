'use client'

import { ShieldCheck } from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

interface HelpSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 사용 단계 — 카드 그리드 대신 번호·구분선·여백으로 위계 (.impeccable 미학) */
const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: '01',
    title: '업로드',
    body: 'PDF를 작업 영역에 끌어다 놓거나 클릭해 선택합니다. 여러 개를 한 번에 올릴 수 있고, 즉시 브라우저에서 열립니다.',
  },
  {
    n: '02',
    title: '페이지 편집',
    body: '썸네일을 클릭/범위 선택해 삭제·90° 회전·드래그로 순서 재정렬합니다. 선택 페이지를 새 문서로 추출하거나, 빈 페이지·다른 문서의 페이지를 삽입하고, 모든 페이지에 워터마크를 넣을 수 있습니다.',
  },
  {
    n: '03',
    title: '텍스트 편집',
    body: '뷰어 상단의 "텍스트 편집"을 켜면 페이지 위에 텍스트 영역이 표시됩니다. 영역을 클릭해 내용을 고치고 적용하면 해당 자리에 새 텍스트가 그려집니다. (글꼴·줄바꿈은 원본과 완전히 같지 않을 수 있습니다.)',
  },
  {
    n: '04',
    title: '검색',
    body: '헤더의 "검색"으로 문서 전체에서 텍스트를 찾아 해당 페이지로 이동합니다.',
  },
  {
    n: '05',
    title: '병합',
    body: '문서를 2개 이상 올리면 "병합"이 활성화됩니다. 순서를 조정해 하나의 PDF로 합치며, 페이지 크기가 서로 달라도 자동으로 정규화됩니다.',
  },
  {
    n: '06',
    title: 'AI Markdown 변환',
    body: '"Markdown 변환"에서 본인의 API 키(BYO Key)로 PDF를 Markdown으로 변환합니다. Claude Sonnet 4.6 · Gemini 2.5 Flash · GPT-4o를 지원하며, 전체/현재/선택/범위 페이지만 변환할 수 있습니다.',
  },
  {
    n: '07',
    title: '다운로드',
    body: '편집을 마치면 "PDF 다운로드"로 결과 파일을 저장합니다. 변환한 Markdown도 별도로 내려받을 수 있습니다.',
  },
]

/** 키보드 단축키 — tabular-nums 키 캡션, 2열 정의 목록 */
const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ['←', '→'], desc: '이전 / 다음 페이지' },
  { keys: ['Del'], desc: '선택한 페이지 삭제' },
  { keys: ['Ctrl', 'Z'], desc: '실행취소' },
  { keys: ['Ctrl', 'Y'], desc: '다시실행' },
  { keys: ['Ctrl', 'A'], desc: '모든 페이지 선택' },
  { keys: ['Esc'], desc: '선택 해제 / 닫기' },
]

/**
 * 사용 방법 안내 (R3-1).
 *
 * 우측 Sheet. 단계형 안내 + 키보드 단축키 표 + 프라이버시 강조.
 * `.impeccable.md` 프로 도구형 미학: 카드 남발 금지, 번호·구분선·여백으로
 * 위계를 만들고 좌측 정렬·tabular-nums 를 따른다.
 */
export function HelpSheet({ open, onOpenChange }: HelpSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-md"
        aria-describedby="help-sheet-desc"
      >
        <SheetHeader className="flex h-12 flex-shrink-0 flex-row items-center gap-2 border-b border-border px-5">
          <SheetTitle>사용 방법</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <p
            id="help-sheet-desc"
            className="px-5 pb-1 pt-4 text-xs leading-relaxed text-muted-foreground"
          >
            업로드부터 다운로드까지, PDF Office의 전체 흐름을 단계별로
            안내합니다.
          </p>

          {/* 프라이버시 강조 — 핵심 신뢰 가치, 액센트 톤 절제 사용 */}
          <div className="mx-5 mt-3 flex items-start gap-2.5 rounded-md border border-primary-soft-border bg-primary-soft px-3.5 py-3">
            <ShieldCheck
              className="mt-px h-4 w-4 flex-shrink-0 text-primary"
              aria-hidden
            />
            <p className="text-xs leading-relaxed text-foreground">
              모든 처리는 사용자의 브라우저 안에서만 이루어집니다.{' '}
              <span className="font-semibold">
                파일은 서버로 전송되지 않습니다.
              </span>{' '}
              (AI 변환만 본인이 입력한 키로 해당 제공자에 직접 요청합니다.)
            </p>
          </div>

          {/* 단계 — 번호 + 구분선 위계 (카드 그리드 금지) */}
          <ol className="mt-5 flex flex-col">
            {STEPS.map((s, i) => (
              <li
                key={s.n}
                className={
                  'flex gap-3.5 px-5 py-3.5' +
                  (i !== STEPS.length - 1 ? ' border-b border-border' : '')
                }
              >
                <span
                  className="select-none pt-px text-2xs font-semibold tabular-nums tracking-[0.1em] text-primary"
                  aria-hidden
                >
                  {s.n}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    {s.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {/* 키보드 단축키 표 */}
          <section
            className="border-t border-border bg-muted/30 px-5 py-4"
            aria-label="키보드 단축키"
          >
            <h3 className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              키보드 단축키
            </h3>
            <dl className="mt-3 flex flex-col gap-2">
              {SHORTCUTS.map((sc) => (
                <div
                  key={sc.desc}
                  className="flex items-center justify-between gap-3"
                >
                  <dd className="text-xs text-foreground">{sc.desc}</dd>
                  <dt className="flex flex-shrink-0 items-center gap-1">
                    {sc.keys.map((k) => (
                      <kbd
                        key={k}
                        className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border-strong bg-background px-1.5 text-2xs font-medium tabular-nums text-foreground"
                      >
                        {k}
                      </kbd>
                    ))}
                  </dt>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
