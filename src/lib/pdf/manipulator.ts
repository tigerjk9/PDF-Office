/**
 * PDF 조작 순수 함수 (pdf-lib)
 *
 * 모든 함수는 `Uint8Array → Promise<Uint8Array>` 순수 함수.
 * pdf-lib는 0-based 페이지 인덱스를 사용한다.
 *
 * 주의: pdfjs(1-based)와 pdf-lib(0-based) 인덱스 변환은 항상 호출 경계에서 처리.
 */

import { PDFDocument, degrees, StandardFonts, rgb } from 'pdf-lib'
import type { PDFFont } from 'pdf-lib'
import { mergeNormalized } from './merge-normalize'
import { embedKoreanFont } from './font-embed'

/**
 * 지정한 페이지 인덱스들을 삭제.
 * 인덱스 시프트를 방지하기 위해 큰 인덱스부터 제거한다.
 *
 * @param bytes 원본 PDF 바이트
 * @param pageIndices 0-based 인덱스 배열 (중복 자동 제거)
 * @returns 페이지 삭제 후 PDF 바이트
 */
export async function deletePages(
  bytes: Uint8Array,
  pageIndices: number[],
): Promise<Uint8Array> {
  if (pageIndices.length === 0) return bytes

  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false })

  // 중복 제거 + 범위 검증
  const pageCount = doc.getPageCount()
  const unique = Array.from(new Set(pageIndices)).filter((i) => i >= 0 && i < pageCount)

  // 모든 페이지 삭제 방지
  if (unique.length >= pageCount) {
    throw new Error('OPERATION_FAILED: 모든 페이지를 삭제할 수 없습니다.')
  }

  // 내림차순 정렬 (높은 인덱스부터 삭제)
  const sorted = [...unique].sort((a, b) => b - a)
  sorted.forEach((i) => doc.removePage(i))

  return doc.save()
}

/**
 * 페이지 순서 변경 (재정렬).
 *
 * @param bytes 원본 PDF 바이트
 * @param newOrder 새 순서. 길이=원본 페이지 수, 값은 0..n-1의 순열
 * @returns 재정렬된 PDF 바이트
 */
export async function reorderPages(
  bytes: Uint8Array,
  newOrder: number[],
): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: false })
  const pageCount = src.getPageCount()

  // 검증: 길이 + 순열 여부
  if (newOrder.length !== pageCount) {
    throw new Error(
      `OPERATION_FAILED: newOrder 길이(${newOrder.length})가 페이지 수(${pageCount})와 다릅니다.`,
    )
  }
  const seen = new Set<number>()
  for (const i of newOrder) {
    if (i < 0 || i >= pageCount || seen.has(i)) {
      throw new Error('OPERATION_FAILED: newOrder는 0..n-1의 순열이어야 합니다.')
    }
    seen.add(i)
  }

  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, newOrder)
  pages.forEach((p) => out.addPage(p))
  return out.save()
}

/**
 * 2개 이상의 PDF 병합 (페이지 크기 정규화 포함).
 * 배열 순서가 결과 PDF의 페이지 순서를 결정.
 *
 * 서로 다른 페이지 크기의 문서를 병합해도 결과 페이지가 제각각으로
 * 섞이지 않도록, 모든 페이지를 공통 타깃 박스에 종횡비 보존·중앙
 * 정렬(letterbox)로 통일한다. 단일 문서/동일 크기 병합은 재스케일
 * 없이 기존과 동일하게 처리한다(merge-normalize.ts 의 빠른 경로).
 *
 * @param bytesArray 병합할 PDF 바이트 배열
 * @returns 병합된 PDF 바이트
 */
export async function mergeDocuments(bytesArray: Uint8Array[]): Promise<Uint8Array> {
  if (bytesArray.length === 0) {
    throw new Error('OPERATION_FAILED: 병합할 문서가 없습니다.')
  }
  if (bytesArray.length === 1) {
    // 단일 문서는 그대로 반환 (copy)
    return bytesArray[0].slice()
  }

  // 다중 문서: 페이지 크기 정규화 병합.
  return mergeNormalized(bytesArray)
}

/**
 * 단일 페이지를 회전.
 *
 * @param bytes 원본 PDF 바이트
 * @param pageIndex 0-based
 * @param deg 회전 각도 (시계 방향)
 * @returns 회전 적용된 PDF 바이트
 */
export async function rotatePage(
  bytes: Uint8Array,
  pageIndex: number,
  deg: 90 | 180 | 270,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false })
  if (pageIndex < 0 || pageIndex >= doc.getPageCount()) {
    throw new Error(`OPERATION_FAILED: 페이지 인덱스 ${pageIndex} 범위 초과.`)
  }
  const page = doc.getPage(pageIndex)
  // 기존 회전 각도에 누적 (pdf-lib은 누적치 보존)
  const current = page.getRotation().angle ?? 0
  const total = ((current + deg) % 360) as 0 | 90 | 180 | 270
  page.setRotation(degrees(total))
  return doc.save()
}

/** replacement 에 WinAnsi(표준 14 폰트) 범위를 벗어나는 문자가 있는가. */
function hasNonWinAnsi(text: string): boolean {
  // Helvetica(WinAnsi)는 대략 U+00FF 이하만 안전. 그 외(한글/CJK/이모지 등)
  // 가 하나라도 있으면 임베드 폰트가 필요하다.
  for (const ch of text) {
    if (ch.codePointAt(0)! > 0xff) return true
  }
  return false
}

/**
 * 페이지 내 텍스트 교체 (R3 텍스트 편집).
 *
 * pdf-lib은 기존 텍스트를 직접 수정할 수 없으므로,
 * 1) target 영역을 흰 사각형으로 덮고(redact),
 * 2) replacement 를 동일 위치에 새로 그린다.
 *
 * 폰트 선택:
 *  - 한글/CJK/유니코드 문자가 포함되면 `@pdf-lib/fontkit` 으로 Pretendard
 *    TTF 를 서브셋 임베드해 그린다(tofu 방지).
 *  - 폰트 로드/임베드 실패 시 StandardFonts.Helvetica 로 폴백한다.
 *    이 경우 영문/숫자는 정상 표시되지만 비-WinAnsi 문자는 깨질 수 있어
 *    `warning` 을 함께 반환한다(영문만 있으면 폴백이어도 무해).
 *
 * 한계:
 *  - 텍스트 위치는 pdfjs로 추출한 좌표(rect)에 의존 (호출 측 책임).
 *  - 원본 폰트/스타일은 보존되지 않음(Pretendard 또는 Helvetica로 통일).
 *  - 단일 라인 가정. redact 는 흰색 — 배경이 흰색이 아니면 잔흔 가능.
 *
 * @param bytes PDF 바이트
 * @param pageIndex 0-based
 * @param target 교체 대상 텍스트 좌표 정보
 * @param replacement 새 텍스트
 * @returns 교체 후 PDF 바이트 + 교체 성공 여부 + (폴백 시) 경고
 */
export async function replaceTextAtRect(
  bytes: Uint8Array,
  pageIndex: number,
  target: {
    /** 텍스트 영역 X 좌표 (PDF pt) */
    x: number
    /** 텍스트 영역 Y 좌표 (PDF pt, 하단 원점) */
    y: number
    /** 영역 너비 */
    width: number
    /** 영역 높이 */
    height: number
    /** 폰트 크기 (대략 height 기준) */
    fontSize?: number
  },
  replacement: string,
): Promise<{ bytes: Uint8Array; replaced: boolean; warning?: string }> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false })
  if (pageIndex < 0 || pageIndex >= doc.getPageCount()) {
    throw new Error(`OPERATION_FAILED: 페이지 인덱스 ${pageIndex} 범위 초과.`)
  }
  const page = doc.getPage(pageIndex)

  // 폰트 선택: 한글 폰트 임베드 시도 → 실패 시 Helvetica 폴백.
  let font: PDFFont | null = await embedKoreanFont(doc)
  let warning: string | undefined
  if (!font) {
    font = await doc.embedFont(StandardFonts.Helvetica)
    // 임베드 실패 + 비-WinAnsi 문자 → 깨질 수 있음을 알린다.
    if (hasNonWinAnsi(replacement)) {
      warning =
        '한글 폰트를 불러오지 못해 일부 문자가 깨질 수 있습니다(영문/숫자는 정상).'
    }
  }

  // 1) 기존 텍스트 영역을 흰 사각형으로 덮기
  page.drawRectangle({
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
    color: rgb(1, 1, 1),
    borderColor: rgb(1, 1, 1),
    borderWidth: 0,
  })

  // 2) 새 텍스트 그리기
  const fontSize = target.fontSize ?? Math.max(8, Math.min(target.height * 0.85, 24))
  page.drawText(replacement, {
    x: target.x,
    y: target.y + (target.height - fontSize) / 2,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
    maxWidth: target.width,
  })

  return { bytes: await doc.save(), replaced: true, warning }
}

/**
 * 페이지 개수 조회 (pdf-lib 기준).
 * loader.ts의 getPageCount(pdfjs)와 동일한 결과를 반환해야 한다.
 */
export async function getPageCountPdfLib(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false })
  return doc.getPageCount()
}
