import { AppShell } from '@/components/layout/AppShell'

/**
 * 홈/엔트리 페이지.
 * 정적 SEO 콘텐츠는 RSC로 유지하고 인터랙티브한 본문은 AppShell 클라이언트 컴포넌트로 위임한다.
 */
export default function HomePage() {
  return (
    <main className="min-h-screen">
      <AppShell />
    </main>
  )
}
