/**
 * 앱 푸터 (R3-3) — 빈 상태 화면 하단.
 *
 * 기존 딥네이비 profile-card 대신, .impeccable.md(프로 도구형 · 라이트 ·
 * 카드 최소화 · 좌측정렬 · 다크 금지) 에 맞춰 조용한 구획형으로 재설계.
 * 히어로/단계와 동일한 max-w-3xl 컬럼에 좌측 정렬해 한 흐름으로 읽히게 한다.
 * 단일 액센트는 링크 hover 에서만 절제 사용. (self-host: public/facilitator.png)
 *
 * 서버 컴포넌트(상호작용 없음) — 정적 마크업.
 */
export function AppFooter() {
  return (
    <footer
      className="mx-auto w-full max-w-3xl border-t border-border px-6 py-6 text-muted-foreground sm:px-10"
      aria-label="사이트 정보"
    >
      <a
        className="group inline-flex items-center gap-3 rounded-md text-left transition-colors duration-fast ease-out-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        href="https://litt.ly/dot_connector"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="닷커넥터 김진관의 링크 페이지로 이동"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="h-9 w-9 flex-shrink-0 rounded-full object-cover ring-1 ring-border"
          src="/facilitator.png"
          alt="닷커넥터 김진관"
          width={36}
          height={36}
          loading="lazy"
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground transition-colors duration-fast group-hover:text-primary">
            닷커넥터{' '}
            <span className="font-normal text-muted-foreground">
              (김진관)
            </span>
          </span>
          <span className="text-xs leading-relaxed text-muted-foreground">
            배움, 나눔, 성장을 추구하는 연결주의자
          </span>
        </span>
      </a>
    </footer>
  )
}
