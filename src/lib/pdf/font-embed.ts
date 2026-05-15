/**
 * CJK 폰트 임베드 유틸 (R3 텍스트 편집)
 *
 * 문제:
 *   pdf-lib의 StandardFonts.Helvetica 는 WinAnsi 인코딩만 지원해
 *   한글/CJK/이모지 문자를 그리면 tofu(□)로 깨진다. 표준 14 폰트로는
 *   유니코드 텍스트를 PDF에 새로 그릴 수 없다.
 *
 * 해결:
 *   `@pdf-lib/fontkit` 을 registerFontkit 으로 등록하고, 한글 글리프를
 *   포함한 TrueType 폰트(Pretendard Regular)를 런타임에 fetch 해
 *   서브셋 임베드한다. 폰트 fetch/임베드가 실패하면 호출 측이
 *   Helvetica 로 폴백할 수 있도록 null 을 반환한다(영문은 계속 동작).
 *
 * 폰트 소스:
 *   public/fonts/Pretendard-Regular.ttf
 *   (node_modules/pretendard 의 alternative TTF 를 빌드 산출물로 복사.
 *    OTF/CFF 보다 fontkit TrueType 경로가 안정적이라 TTF 채택.)
 *
 * 성능:
 *   - 폰트 바이트는 모듈 레벨에서 1회 fetch 후 캐시(동일 세션 재사용).
 *   - subset: true 로 사용 글리프만 포함해 결과 PDF 비대화를 억제.
 *
 * 불변성: 입력 PDFDocument 에 폰트를 임베드하는 것은 pdf-lib API의
 * 정상 변이(문서 빌드)이며, 이 모듈 자체는 외부 상태를 변이하지 않는다.
 */

import type { PDFDocument, PDFFont } from 'pdf-lib'

/** 임베드용 한글 TTF 의 정적 경로(public 루트 기준). */
const FONT_URL = '/fonts/Pretendard-Regular.ttf'

/**
 * 폰트 바이트 1회 fetch 캐시.
 * - undefined : 아직 시도 안 함
 * - Promise   : fetch 진행 중/완료(결과 공유)
 * 실패 시 Promise 가 null 로 resolve 되어 호출 측이 폴백한다.
 */
let fontBytesPromise: Promise<ArrayBuffer | null> | undefined

/**
 * 한글 폰트 바이트를 1회만 받아 캐시한다.
 * 브라우저 환경에서만 동작(서버/빌드 시에는 fetch 불가 → null).
 */
async function loadFontBytes(): Promise<ArrayBuffer | null> {
  if (fontBytesPromise) return fontBytesPromise

  fontBytesPromise = (async () => {
    if (typeof fetch === 'undefined') return null
    try {
      const res = await fetch(FONT_URL)
      if (!res.ok) {
        console.warn(
          `[font-embed] 폰트 응답 실패(${res.status}). Helvetica 폴백.`,
        )
        return null
      }
      return await res.arrayBuffer()
    } catch (cause) {
      console.warn(
        '[font-embed] 폰트 로드 실패. 한글이 깨질 수 있어 Helvetica 폴백:',
        cause,
      )
      return null
    }
  })()

  return fontBytesPromise
}

/**
 * 주어진 PDFDocument 에 한글 가능 폰트를 임베드해 PDFFont 를 반환한다.
 * fontkit 등록/폰트 로드/임베드 중 어느 단계든 실패하면 null 을 반환하며,
 * 호출 측은 이를 받아 StandardFonts.Helvetica 로 폴백해야 한다.
 *
 * @param doc 폰트를 임베드할 대상 문서
 * @returns 임베드된 PDFFont, 실패 시 null
 */
export async function embedKoreanFont(
  doc: PDFDocument,
): Promise<PDFFont | null> {
  try {
    // fontkit 은 번들 크기 영향을 줄이기 위해 동적 import.
    const fontkitMod = await import('@pdf-lib/fontkit')
    const fontkit = (fontkitMod as { default?: unknown }).default ?? fontkitMod
    // registerFontkit 은 멱등(동일 인스턴스 재등록 무해).
    doc.registerFontkit(fontkit as Parameters<PDFDocument['registerFontkit']>[0])

    const bytes = await loadFontBytes()
    if (!bytes) return null

    // subset: true → 사용 글리프만 포함(결과 PDF 용량 최소화).
    return await doc.embedFont(bytes, { subset: true })
  } catch (cause) {
    console.warn(
      '[font-embed] 한글 폰트 임베드 실패. Helvetica 폴백:',
      cause,
    )
    return null
  }
}
