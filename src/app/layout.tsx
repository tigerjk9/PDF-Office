import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Toaster } from 'sonner'
import './globals.css'

/**
 * Pretendard 가변 폰트 self-host (R2-3).
 *
 * `next/font/local` 로 npm `pretendard` 패키지의 가변 woff2 를 인라인·프리로드한다.
 * - FOUT 최소화: `display: swap` + 자동 fallback 메트릭 보정(adjustFontFallback).
 * - CSS 변수 `--font-pretendard` 로 노출 → globals/tailwind 의 sans 스택 선두.
 */
const pretendard = localFont({
  src: '../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2',
  weight: '45 920',
  style: 'normal',
  display: 'swap',
  variable: '--font-pretendard',
  fallback: [
    'Apple SD Gothic Neo',
    'Malgun Gothic',
    'system-ui',
    'sans-serif',
  ],
})

const SITE_URL = 'https://pdf-office-dusky.vercel.app'
const OG_TITLE = 'PDF Office — 브라우저에서 완결되는 PDF 작업'
const OG_DESC =
  'PDF를 브라우저에서 바로 편집·병합·회전하고 AI로 Markdown으로 변환하세요. 파일은 서버로 전송되지 않습니다.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'PDF Office — 브라우저 기반 PDF 편집기',
  description: OG_DESC,
  // og:image / twitter:image 는 opengraph-image.tsx · twitter-image.tsx 가 자동 주입
  openGraph: {
    type: 'website',
    siteName: 'PDF Office',
    locale: 'ko_KR',
    url: '/',
    title: OG_TITLE,
    description: OG_DESC,
  },
  twitter: {
    card: 'summary_large_image',
    title: OG_TITLE,
    description: OG_DESC,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-canvas font-sans text-foreground antialiased">
        {children}
        <Toaster
          position="top-center"
          closeButton
          toastOptions={{
            classNames: {
              toast:
                'rounded-md border border-border bg-background text-foreground shadow-md',
              title: 'text-sm font-medium',
              description: 'text-xs text-muted-foreground',
              actionButton:
                'rounded-md bg-primary text-primary-foreground text-xs',
              cancelButton:
                'rounded-md bg-muted text-muted-foreground text-xs',
              error:
                'border-destructive/30 [&_[data-icon]]:text-destructive',
              success: '[&_[data-icon]]:text-success',
            },
          }}
        />
      </body>
    </html>
  )
}
