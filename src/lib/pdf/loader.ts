/**
 * PDF 파일 로딩 & 메타데이터 파싱 (pdfjs-dist)
 *
 * - Uint8Array 바이트를 받아 pdfjs PDFDocumentProxy를 생성한다.
 * - 페이지 수, 페이지별 viewport(width/height) 메타데이터를 추출한다.
 */

import './worker-config'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

export interface PdfPageMeta {
  index: number
  width: number
  height: number
}

/**
 * pdfjs PDFDocumentProxy 로드.
 *
 * 주의: pdfjs는 입력 Uint8Array를 내부적으로 detach/transfer 할 수 있으므로
 *      재사용 가능한 원본을 유지하려면 호출 측에서 slice() 후 전달할 것.
 */
export async function loadPdfDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  // 방어적 복사: pdfjs가 버퍼를 detach하더라도 원본은 안전
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)

  try {
    return await pdfjsLib.getDocument({
      data: copy,
      // 메모리 절약: 폰트/이미지 캐시 최소화
      disableAutoFetch: false,
      disableStream: false,
    }).promise
  } catch (cause) {
    const err = cause as Error & { name?: string }
    if (err?.name === 'PasswordException') {
      throw new Error('ENCRYPTED_PDF: 암호화된 PDF는 지원되지 않습니다.')
    }
    if (err?.name === 'InvalidPDFException') {
      throw new Error('INVALID_FILE: 유효하지 않은 PDF 파일입니다.')
    }
    throw new Error(`PARSE_FAILED: ${err?.message ?? 'PDF 파싱 실패'}`)
  }
}

/** 페이지 수만 빠르게 조회 */
export async function getPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await loadPdfDocument(bytes)
  const count = doc.numPages
  await doc.destroy()
  return count
}

/**
 * 모든 페이지의 viewport(폭/높이) 메타데이터 수집.
 * scale=1.0 기준 PDF 좌표계(pt) 단위.
 */
export async function getAllPageMeta(bytes: Uint8Array): Promise<PdfPageMeta[]> {
  const doc = await loadPdfDocument(bytes)
  const metas: PdfPageMeta[] = []
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const vp = page.getViewport({ scale: 1.0 })
      metas.push({
        index: i - 1,
        width: vp.width,
        height: vp.height,
      })
      page.cleanup()
    }
  } finally {
    await doc.destroy()
  }
  return metas
}

/**
 * File 객체를 Uint8Array로 변환하는 헬퍼.
 * - 메모리 가드: maxBytes 초과 시 throw.
 */
export async function fileToBytes(file: File, maxBytes = 100 * 1024 * 1024): Promise<Uint8Array> {
  if (file.size > maxBytes) {
    throw new Error(`INVALID_FILE: 파일 크기가 ${Math.round(maxBytes / 1024 / 1024)}MB를 초과합니다.`)
  }
  if (file.type && file.type !== 'application/pdf') {
    throw new Error('INVALID_FILE: PDF 파일이 아닙니다.')
  }
  const buf = await file.arrayBuffer()
  return new Uint8Array(buf)
}
