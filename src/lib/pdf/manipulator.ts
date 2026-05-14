/**
 * PDF 조작 순수 함수 (pdf-lib)
 *
 * 모든 함수는 `Uint8Array → Promise<Uint8Array>` 순수 함수.
 * pdf-lib는 0-based 페이지 인덱스를 사용한다.
 *
 * 주의: pdfjs(1-based)와 pdf-lib(0-based) 인덱스 변환은 항상 호출 경계에서 처리.
 */

import { PDFDocument, degrees, StandardFonts, rgb } from 'pdf-lib'

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
 * 2개 이상의 PDF 병합.
 * 배열 순서가 결과 PDF의 페이지 순서를 결정.
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

  const merged = await PDFDocument.create()
  for (const bytes of bytesArray) {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false })
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    pages.forEach((p) => merged.addPage(p))
  }
  return merged.save()
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

/**
 * 페이지 내 텍스트 교체.
 *
 * pdf-lib은 기존 텍스트를 직접 수정할 수 없으므로,
 * 1) targetText 영역을 흰 사각형으로 덮고,
 * 2) replacementText를 표준 폰트(Helvetica)로 동일 위치에 그린다.
 *
 * 한계:
 *  - 텍스트 위치는 pdfjs로 추출한 좌표에 의존 (별도 호출 필요)
 *  - 폰트 매칭 불완전 (한글/특수문자/원본 폰트 유실 가능)
 *  - 다중 라인 텍스트 교체는 단일 라인 가정
 *
 * @param bytes PDF 바이트
 * @param pageIndex 0-based
 * @param target 교체 대상 텍스트 좌표 정보
 * @param replacement 새 텍스트
 * @returns 텍스트 교체 후 PDF 바이트 + 교체 성공 여부
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
): Promise<{ bytes: Uint8Array; replaced: boolean }> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false })
  if (pageIndex < 0 || pageIndex >= doc.getPageCount()) {
    throw new Error(`OPERATION_FAILED: 페이지 인덱스 ${pageIndex} 범위 초과.`)
  }
  const page = doc.getPage(pageIndex)
  const font = await doc.embedFont(StandardFonts.Helvetica)

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

  return { bytes: await doc.save(), replaced: true }
}

/**
 * 페이지 개수 조회 (pdf-lib 기준).
 * loader.ts의 getPageCount(pdfjs)와 동일한 결과를 반환해야 한다.
 */
export async function getPageCountPdfLib(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false })
  return doc.getPageCount()
}
