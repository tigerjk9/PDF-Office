/**
 * 페이지 추출·분할·삽입·워터마크 순수 함수 (pdf-lib) — P2-5 / P2-8
 *
 * 모든 함수는 `Uint8Array → Promise<Uint8Array>` 순수 함수.
 * pdf-lib는 0-based 페이지 인덱스를 사용한다.
 *
 * manipulator.ts(삭제/순서/병합/회전)와 분리해 파일 비대화를 방지한다.
 * (코딩 규칙: 800줄 이내, 도메인별 분할)
 */

import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'

/** A4 기본 크기 (pt) — 빈 페이지 size 미지정 시 폴백 */
const A4: { width: number; height: number } = { width: 595.28, height: 841.89 }

/**
 * 선택한 페이지 인덱스들만 가진 새 PDF를 생성한다 (추출/분할).
 *
 * - 분할은 "연속 범위 추출"로 커버된다(호출 측이 범위 인덱스 배열 전달).
 * - pageIndices의 순서가 결과 PDF의 페이지 순서를 결정한다.
 *
 * @param bytes 원본 PDF 바이트
 * @param pageIndices 추출할 0-based 인덱스 배열(순서 보존, 중복 자동 제거)
 * @returns 선택 페이지만 가진 새 PDF 바이트
 */
export async function extractPages(
  bytes: Uint8Array,
  pageIndices: number[],
): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: false })
  const pageCount = src.getPageCount()

  // 순서 보존하며 중복 제거 + 범위 검증
  const seen = new Set<number>()
  const valid: number[] = []
  for (const i of pageIndices) {
    if (i >= 0 && i < pageCount && !seen.has(i)) {
      seen.add(i)
      valid.push(i)
    }
  }

  if (valid.length === 0) {
    throw new Error('OPERATION_FAILED: 추출할 유효한 페이지가 없습니다.')
  }

  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, valid)
  pages.forEach((p) => out.addPage(p))
  return out.save()
}

/**
 * 빈 페이지를 atIndex 위치(해당 위치 앞)에 삽입한다.
 *
 * size 미지정 시:
 *  1) atIndex 인접 페이지(있으면 atIndex, 없으면 직전 페이지) 크기,
 *  2) 그래도 없으면 A4.
 *
 * @param bytes 원본 PDF 바이트
 * @param atIndex 삽입 위치 0-based (0=맨 앞, pageCount=맨 뒤)
 * @param size 명시적 페이지 크기(pt). 미지정 시 인접/A4 폴백
 * @returns 빈 페이지가 삽입된 PDF 바이트
 */
export async function insertBlankPage(
  bytes: Uint8Array,
  atIndex: number,
  size?: { width: number; height: number },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false })
  const pageCount = doc.getPageCount()
  const clampedIndex = Math.max(0, Math.min(atIndex, pageCount))

  let dims: { width: number; height: number }
  if (size && size.width > 0 && size.height > 0) {
    dims = size
  } else if (pageCount > 0) {
    // 인접 페이지 크기 사용: 삽입 위치에 페이지가 있으면 그 페이지,
    // 없으면(맨 뒤 삽입) 직전 페이지 크기를 따른다.
    const refIndex = clampedIndex < pageCount ? clampedIndex : clampedIndex - 1
    const ref = doc.getPage(refIndex)
    const refSize = ref.getSize()
    dims = { width: refSize.width, height: refSize.height }
  } else {
    dims = A4
  }

  // insertPage는 해당 인덱스 "앞"에 새 빈 페이지를 만든다.
  doc.insertPage(clampedIndex, [dims.width, dims.height])
  return doc.save()
}

/**
 * 다른 문서(source)의 지정 페이지들을 현재 문서(target)의
 * atIndex 위치(해당 위치 앞)에 삽입한다.
 *
 * @param targetBytes 삽입 대상 PDF 바이트
 * @param sourceBytes 페이지를 가져올 PDF 바이트
 * @param sourcePageIndices source에서 가져올 0-based 인덱스(순서 보존, 중복 제거)
 * @param atIndex target 내 삽입 위치 0-based
 * @returns 페이지가 삽입된 PDF 바이트
 */
export async function insertPagesFromDoc(
  targetBytes: Uint8Array,
  sourceBytes: Uint8Array,
  sourcePageIndices: number[],
  atIndex: number,
): Promise<Uint8Array> {
  const target = await PDFDocument.load(targetBytes, { ignoreEncryption: false })
  const source = await PDFDocument.load(sourceBytes, { ignoreEncryption: false })

  const targetCount = target.getPageCount()
  const sourceCount = source.getPageCount()
  const clampedIndex = Math.max(0, Math.min(atIndex, targetCount))

  // 순서 보존하며 중복 제거 + 범위 검증
  const seen = new Set<number>()
  const valid: number[] = []
  for (const i of sourcePageIndices) {
    if (i >= 0 && i < sourceCount && !seen.has(i)) {
      seen.add(i)
      valid.push(i)
    }
  }

  if (valid.length === 0) {
    throw new Error('OPERATION_FAILED: 삽입할 유효한 소스 페이지가 없습니다.')
  }

  const copied = await target.copyPages(source, valid)
  // copied[0]을 clampedIndex에, 이후 페이지는 순차로 그 뒤에 삽입해 순서 유지.
  copied.forEach((p, offset) => {
    target.insertPage(clampedIndex + offset, p)
  })

  return target.save()
}

/**
 * 모든 페이지에 대각선 반투명 텍스트 워터마크를 그린다 (P2-8).
 * 문서 ID는 호출 측(store)에서 유지한다.
 *
 * @param bytes 원본 PDF 바이트
 * @param text 워터마크 텍스트
 * @param opts opacity(0~1, 기본 0.15) / fontSize(미지정 시 페이지 폭 기반) / rotationDeg(기본 45)
 * @returns 워터마크가 적용된 PDF 바이트
 */
export async function applyWatermark(
  bytes: Uint8Array,
  text: string,
  opts?: { opacity?: number; fontSize?: number; rotationDeg?: number },
): Promise<Uint8Array> {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('OPERATION_FAILED: 워터마크 텍스트가 비어 있습니다.')
  }

  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false })
  const font = await doc.embedFont(StandardFonts.HelveticaBold)

  const opacity = clamp01(opts?.opacity ?? 0.15)
  const rotationDeg = opts?.rotationDeg ?? 45

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    // fontSize 미지정 시 페이지 폭 기준으로 산정(대각선에 적당히 큰 글자).
    const fontSize = opts?.fontSize ?? Math.max(24, Math.min(width, height) * 0.12)

    const textWidth = font.widthOfTextAtSize(trimmed, fontSize)
    const textHeight = font.heightAtSize(fontSize)

    // 회전 각도를 고려해 페이지 중앙에 텍스트의 중심이 오도록 보정.
    const rad = (rotationDeg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const cx = width / 2
    const cy = height / 2
    // drawText의 x,y는 텍스트 baseline 시작점. 텍스트 중심을 페이지 중심에
    // 맞추기 위해 회전 좌표계에서 (-w/2, -h/2) 만큼 평행이동.
    const x = cx - (textWidth / 2) * cos + (textHeight / 2) * sin
    const y = cy - (textWidth / 2) * sin - (textHeight / 2) * cos

    page.drawText(trimmed, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity,
      rotate: degrees(rotationDeg),
    })
  }

  return doc.save()
}

/** 0~1 범위로 클램프 */
function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0.15
  return Math.max(0, Math.min(1, v))
}
