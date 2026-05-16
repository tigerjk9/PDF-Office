import { renderOgImage } from './og-render'

// 라우트 세그먼트 설정은 정적 파싱 대상 → 리터럴로 선언(공유 모듈 참조 불가).
export const runtime = 'nodejs'
export const alt = 'PDF Office — 브라우저에서 완결되는 PDF 작업'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return renderOgImage()
}
