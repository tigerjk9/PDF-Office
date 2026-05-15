import type { Config } from 'tailwindcss'

/**
 * 프로 도구형 디자인 시스템 (Linear/Raycast 계열) · 라이트 (R2-4).
 *
 * - 색 토큰은 globals.css 에서 완성된 OKLCH 값으로 정의 → 여기선 var() 그대로 사용.
 *   (기존 `hsl(var(--x))` 채널 래핑 제거: OKLCH 값과 호환되지 않음)
 * - 폰트는 Pretendard 가변(self-host) 우선 (R2-3).
 * - 모듈러 타입 스케일(1.25, major third) + 강한 weight 대비.
 */
const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // 뉴트럴 표면 / 텍스트
        canvas: 'var(--canvas)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        elevated: 'var(--elevated)',
        subtle: 'var(--subtle)',
        'border-strong': 'var(--border-strong)',

        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',

        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
          hover: 'var(--accent-hover)',
          active: 'var(--accent-active)',
          soft: 'var(--accent-soft)',
          'soft-border': 'var(--accent-soft-border)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
          hover: 'var(--danger-hover)',
          soft: 'var(--danger-soft)',
          'soft-border': 'var(--danger-soft-border)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        success: { DEFAULT: 'var(--success)' },
      },
      fontFamily: {
        // --font-pretendard(next/font)가 이미 Apple SD Gothic Neo·Malgun
        // Gothic·system-ui·sans-serif 폴백 체인을 포함 → 중복 재나열 제거.
        sans: ['var(--font-pretendard)'],
      },
      fontSize: {
        // 모듈러 스케일(major third 1.25) — 적은 스텝, 강한 대비
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        xs: ['0.75rem', { lineHeight: '1.1rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.5rem' }],
        md: ['1rem', { lineHeight: '1.6rem' }],
        lg: ['1.1875rem', { lineHeight: '1.6rem', letterSpacing: '-0.011em' }],
        xl: ['1.5rem', { lineHeight: '1.85rem', letterSpacing: '-0.018em' }],
        '2xl': ['2rem', { lineHeight: '2.25rem', letterSpacing: '-0.022em' }],
        '3xl': ['2.75rem', { lineHeight: '2.9rem', letterSpacing: '-0.026em' }],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      transitionTimingFunction: {
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '200ms',
        slow: '320ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'slide-in-from-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-out-to-right': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(100%)' },
        },
        'slide-in-from-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-out-to-left': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-100%)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'scale-out': {
          from: { opacity: '1', transform: 'scale(1)' },
          to: { opacity: '0', transform: 'scale(0.97)' },
        },
        'progress-indeterminate': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(350%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in var(--dur-base) var(--ease-out-quart)',
        'fade-out': 'fade-out 150ms var(--ease-out-quart)',
        'slide-in-from-right':
          'slide-in-from-right var(--dur-slow) var(--ease-out-expo)',
        'slide-out-to-right': 'slide-out-to-right 220ms var(--ease-out-quart)',
        'slide-in-from-left':
          'slide-in-from-left var(--dur-slow) var(--ease-out-expo)',
        'slide-out-to-left': 'slide-out-to-left 220ms var(--ease-out-quart)',
        'scale-in': 'scale-in var(--dur-base) var(--ease-out-quart)',
        'scale-out': 'scale-out 150ms var(--ease-out-quart)',
      },
    },
  },
  plugins: [],
}

export default config
