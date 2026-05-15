/**
 * 공급자 비의존(provider-agnostic) AI 메시지 표현
 *
 * 클라이언트(extractor/converter)는 이 형태로 "한 번의 변환 요청"을 만든다.
 * 서버 프록시 라우트(src/app/api/ai/convert)가 이 형태를 각 공급자
 * (Claude / OpenAI / Gemini)의 네이티브 페이로드로 변환한다.
 *
 * 텍스트 청크와 비전(스캔 PDF 페이지 이미지) 입력을 동시에 표현할 수 있도록
 * content를 part 배열로 모델링한다.
 *   - { type: 'text', text }            → 일반 텍스트
 *   - { type: 'image', mediaType, data } → base64 PNG/JPEG (data URL 접두어 제외)
 */

/** 텍스트 파트 */
export interface AITextPart {
  type: 'text'
  text: string
}

/** 이미지(비전) 파트 — base64 본문만, "data:image/png;base64," 접두어는 포함하지 않음 */
export interface AIImagePart {
  type: 'image'
  /** MIME 타입 (예: image/png, image/jpeg) */
  mediaType: 'image/png' | 'image/jpeg'
  /** base64 인코딩된 이미지 바이트 (접두어 없음) */
  data: string
}

export type AIContentPart = AITextPart | AIImagePart

/**
 * 단일 변환 호출에 필요한 공급자 비의존 페이로드.
 * 시스템 프롬프트는 전 공급자 공통이라 별도 필드로 둔다.
 */
export interface AIConvertRequest {
  provider: 'claude' | 'gemini' | 'openai'
  /** 사용자 BYO API 키. 서버는 공급자 호출에만 사용하고 저장/로깅하지 않는다. */
  apiKey: string
  /** 공통 시스템 프롬프트 */
  system: string
  /** 사용자 메시지 본문 (텍스트 + 선택적 이미지 파트) */
  content: AIContentPart[]
}

/** data URL 또는 순수 base64에서 mediaType + 본문을 분리한다. */
export function splitDataUrl(input: string): {
  mediaType: AIImagePart['mediaType']
  data: string
} {
  // "data:image/png;base64,XXXX" 형태 처리
  const match = /^data:(image\/(?:png|jpeg));base64,(.*)$/s.exec(input)
  if (match) {
    return {
      mediaType: match[1] as AIImagePart['mediaType'],
      data: match[2],
    }
  }
  // 접두어 없는 순수 base64로 간주 (기본 PNG)
  return { mediaType: 'image/png', data: input }
}

/** 이미지 파트 빌더 — data URL/순수 base64 모두 허용 */
export function imagePart(base64OrDataUrl: string): AIImagePart {
  const { mediaType, data } = splitDataUrl(base64OrDataUrl)
  return { type: 'image', mediaType, data }
}

/** 텍스트 파트 빌더 */
export function textPart(text: string): AITextPart {
  return { type: 'text', text }
}
