import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'PDF Office — 브라우저 기반 PDF 편집기',
  description:
    'PDF를 브라우저에서 바로 편집·병합·회전하고 AI로 Markdown으로 변환하세요. 파일은 서버로 전송되지 않습니다.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 font-sans antialiased text-foreground">
        {children}
        <Toaster richColors closeButton position="top-center" />
      </body>
    </html>
  )
}
