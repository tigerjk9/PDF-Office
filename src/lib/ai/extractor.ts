/**
 * PDF 텍스트 추출 (pdfjs-dist 기반)
 *
 * AI 변환의 입력을 만드는 단계. pdfjs-dist의 textContent API로 페이지별
 * 텍스트를 뽑아 PAGE_SEPARATOR(`\n\n---\n\n`)로 결합한 문자열을 반환한다.
 *
 * 주의:
 *   - Engine 에이전트의 pdfjs-renderer.ts가 이미 존재할 경우 그쪽을 우선
 *     사용해야 하지만, 본 AI 모듈은 호출 측이 어디서든 사용할 수 있도록
 *     pdfjs-dist를 직접 동적 import 한다.
 *   - Next.js App Router의 SSR 컨텍스트에서는 워커가 동작하지 않으므로
 *     반드시 클라이언트 컴포넌트/이벤트 핸들러에서만 호출할 것.
 */

import { PAGE_SEPARATOR } from './prompt'

/**
 * PDF 바이너리에서 모든 페이지의 텍스트를 추출한다.
 * 페이지 사이에는 PAGE_SEPARATOR를 삽입해 splitIntoChunks가 페이지 경계에서
 * 분할할 수 있도록 한다.
 *
 * @param bytes PDF 바이너리 (Uint8Array)
 * @returns 페이지 결합 텍스트
 */
export async function extractTextFromPdf(bytes: Uint8Array): Promise<string> {
  // 동적 import — pdfjs-dist는 번들 크기가 크고 워커가 브라우저 전용.
  const pdfjs = await import('pdfjs-dist')

  // 워커 설정 (clienthand-only).
  // 호출 측이 미리 GlobalWorkerOptions.workerSrc를 설정했다면 그대로 유지.
  if (
    typeof window !== 'undefined' &&
    !pdfjs.GlobalWorkerOptions.workerSrc
  ) {
    // 동일 버전의 워커 파일을 동적으로 로드.
    // bundler가 workerPort/workerSrc를 처리하지 못하는 경우의 안전한 fallback.
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  }

  // pdfjs는 입력 Uint8Array를 내부에서 transfer해 비울 수 있으므로 복사본 전달.
  const data = bytes.slice()

  const loadingTask = pdfjs.getDocument({ data })
  const pdf = await loadingTask.promise

  try {
    const pageTexts: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      try {
        const content = await page.getTextContent()
        const text = content.items
          .map((it) => {
            // TextItem 또는 TextMarkedContent
            // TextItem만 'str' 필드를 갖는다.
            if (typeof (it as { str?: unknown }).str === 'string') {
              return (it as { str: string }).str
            }
            return ''
          })
          .join(' ')
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
        pageTexts.push(text)
      } finally {
        page.cleanup()
      }
    }
    return pageTexts.join(PAGE_SEPARATOR)
  } finally {
    await pdf.cleanup().catch(() => {})
    await pdf.destroy().catch(() => {})
  }
}
