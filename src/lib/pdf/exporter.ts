/**
 * PDF 내보내기 (다운로드 트리거)
 *
 * Uint8Array → Blob → URL.createObjectURL → <a download> 클릭 → revoke.
 */

/**
 * PDF 바이트를 브라우저 다운로드로 트리거.
 *
 * @param bytes PDF 바이트
 * @param fileName 다운로드 파일명 (.pdf 확장자 자동 보정)
 */
export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  if (typeof window === 'undefined') {
    throw new Error('EXPORT_FAILED: downloadPdf는 브라우저에서만 호출 가능합니다.')
  }

  const safeName = ensurePdfExtension(fileName)
  const blob = bytesToPdfBlob(bytes)
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = safeName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  // 다음 tick에서 revoke (일부 브라우저가 즉시 revoke 시 다운로드 실패)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * PDF 바이트를 Blob으로만 변환 (다운로드는 별도 호출).
 * iframe 미리보기 등에 사용.
 */
export function bytesToPdfBlob(bytes: Uint8Array): Blob {
  // BlobPart 호환을 위해 ArrayBuffer로 정규화.
  // bytes.buffer가 SharedArrayBuffer일 수도 있어 새 ArrayBuffer로 복사.
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  return new Blob([ab], { type: 'application/pdf' })
}

/**
 * Blob → Object URL. 호출 측이 revoke 책임.
 */
export function bytesToObjectUrl(bytes: Uint8Array): string {
  return URL.createObjectURL(bytesToPdfBlob(bytes))
}

/** 파일명에 .pdf 확장자 보장 */
function ensurePdfExtension(name: string): string {
  if (!name) return `document-${Date.now()}.pdf`
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`
}
