import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PDF Office — Browser-First PDF Editor',
  description:
    'Edit, merge, rotate, and convert PDFs entirely in your browser. AI-powered Markdown export.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 font-sans antialiased text-foreground">
        {children}
      </body>
    </html>
  )
}
