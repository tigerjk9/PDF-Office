import { renderOgImage } from './og-render'

// Twitter 카드 이미지 — OG 와 동일 디자인. 라우트 설정은 리터럴로 선언.
export const runtime = 'nodejs'
export const alt = 'PDF Office — 브라우저에서 완결되는 PDF 작업'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function TwitterImage() {
  return renderOgImage()
}
