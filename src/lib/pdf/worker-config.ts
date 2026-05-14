/**
 * pdfjs-dist Worker 설정
 *
 * Next.js 환경에서 PDF.js worker를 CDN에서 로드하여
 * 메인 스레드 UI 블로킹을 방지한다.
 *
 * 이 모듈을 사용하는 모든 파일은 부수효과(side-effect) 임포트로
 * `import './worker-config'`를 호출해야 한다.
 */

import * as pdfjsLib from 'pdfjs-dist'

// 클라이언트 환경에서만 worker 설정 (SSR 안전성)
if (typeof window !== 'undefined') {
  // 한 번만 설정되도록 가드
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
  }
}

export { pdfjsLib }
