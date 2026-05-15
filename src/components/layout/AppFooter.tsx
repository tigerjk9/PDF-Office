/**
 * 앱 푸터 (R3-3) — tigerjk9/Live-Artifact `site-footer` 형식 재현.
 *
 * 원본 구조(profile-card + footer-meta)와 스타일을 그대로 따르되, 색/토큰은
 * PDF Office 디자인 시스템(globals.css)에 맞게 적응한다. profile-card 의
 * 딥네이비 배경은 원본 정체성이므로 유지(self-host 이미지: public/facilitator.png).
 *
 * 서버 컴포넌트(상호작용 없음) — 정적 마크업.
 */
export function AppFooter() {
  return (
    <footer
      className="mx-auto flex w-full max-w-[1320px] flex-col items-center gap-[22px] border-t border-border px-6 pb-8 pt-9 text-muted-foreground"
      aria-label="사이트 정보"
    >
      <a
        className="group inline-flex min-w-[240px] flex-col items-center gap-1.5 rounded-[14px] bg-[oklch(24%_0.05_264)] px-7 pb-[18px] pt-[22px] shadow-sm transition-transform duration-base ease-out-quart hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        href="https://litt.ly/dot_connector"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="닷커넥터 김진관의 링크 페이지로 이동"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="mb-1 h-16 w-16 rounded-full border-2 border-white/25 object-cover"
          src="/facilitator.png"
          alt="닷커넥터 김진관"
          width={64}
          height={64}
          loading="lazy"
        />
        <span className="text-[0.9375rem] font-bold text-white">
          닷커넥터
          <span className="ml-0.5 font-medium opacity-85">(김진관)</span>
        </span>
        <span className="text-center text-sm text-[oklch(80%_0.03_264)]">
          배움, 나눔, 성장을 추구하는 연결주의자
        </span>
        <span className="mt-1.5 text-xs font-medium tabular-nums tracking-[0.05em] text-[oklch(74%_0.06_264)]">
          litt.ly/dot_connector ↗
        </span>
      </a>

      <div className="flex flex-wrap items-center justify-center gap-[18px] text-xs">
        <span className="tabular-nums">
          갱신{' '}
          <time dateTime="2026-05-15">2026년 5월 15일 KST</time>
        </span>
        <a
          className="font-semibold text-foreground transition-colors duration-fast ease-out-quart hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          href="https://github.com/tigerjk9"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub ↗
        </a>
      </div>
    </footer>
  )
}
