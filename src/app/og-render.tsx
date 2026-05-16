import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * OG/Twitter 공용 이미지 렌더러.
 *
 * Next.js 메타데이터 라우트(opengraph-image.tsx · twitter-image.tsx)는
 * 라우트 세그먼트 설정(runtime/size/contentType/alt)을 **각 파일에 리터럴**로
 * 정적 선언해야 한다(re-export 불가). 무거운 렌더 로직만 여기서 공유한다.
 *
 * 빈 상태 히어로를 1200×630 으로 재현 — .impeccable.md 프로 도구형:
 * 라이트 배경·좌측 액센트 레일·단일 액센트("변환")만·카드/그라데이션 없음.
 * Pretendard 정적 OTF 를 node_modules 에서 읽어 임베드(한글 렌더).
 * 색은 실측 sRGB hex (Satori 의 oklch/lab 파싱 불안정 회피).
 */

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_ALT = 'PDF Office — 브라우저에서 완결되는 PDF 작업'

const FONT_DIR = 'node_modules/pretendard/dist/public/static'

export async function renderOgImage() {
  const [bold, semibold] = await Promise.all([
    readFile(join(process.cwd(), FONT_DIR, 'Pretendard-Bold.otf')),
    readFile(join(process.cwd(), FONT_DIR, 'Pretendard-SemiBold.otf')),
  ])

  const c = {
    canvas: '#f9fafc',
    fg: '#1a1f29',
    muted: '#646974',
    primary: '#2d62e3',
    border: '#e1e3e6',
    surface: '#fcfdfe',
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          backgroundColor: c.canvas,
          fontFamily: 'Pretendard',
          padding: '72px 88px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 64,
            right: 88,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 24,
            fontWeight: 600,
            color: c.muted,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 32,
              height: 32,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 9,
              backgroundColor: c.primary,
              color: '#ffffff',
              fontSize: 17,
              fontWeight: 700,
            }}
          >
            P
          </div>
          PDF Office
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            height: '100%',
            paddingLeft: 36,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 150,
              bottom: 150,
              width: 8,
              borderRadius: 9999,
              backgroundColor: c.primary,
            }}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: 28,
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: 2,
              color: c.primary,
            }}
          >
            <div
              style={{
                display: 'flex',
                width: 10,
                height: 10,
                borderRadius: 9999,
                backgroundColor: c.primary,
              }}
            />
            브라우저에서 완결되는 PDF 작업
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 86,
              fontWeight: 700,
              lineHeight: 1.14,
              letterSpacing: -2.5,
              color: c.fg,
              marginBottom: 40,
            }}
          >
            <div style={{ display: 'flex' }}>PDF를 열고, 다듬고,</div>
            <div style={{ display: 'flex' }}>
              <span style={{ color: c.primary }}>변환</span>
              <span>하세요.</span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              alignSelf: 'flex-start',
              border: `1px solid ${c.border}`,
              backgroundColor: c.surface,
              borderRadius: 9999,
              padding: '16px 28px',
              fontSize: 26,
              color: c.muted,
            }}
          >
            <div
              style={{
                display: 'flex',
                width: 22,
                height: 22,
                borderRadius: 7,
                backgroundColor: c.primary,
              }}
            />
            <div style={{ display: 'flex' }}>
              모든 처리는 브라우저 안에서만 ·&nbsp;
              <span style={{ color: c.fg, fontWeight: 600 }}>
                파일은 서버로 전송되지 않습니다
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Pretendard', data: bold, weight: 700, style: 'normal' },
        { name: 'Pretendard', data: semibold, weight: 600, style: 'normal' },
      ],
    },
  )
}
