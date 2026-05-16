/**
 * 활성 문서용 pdfjs PDFDocumentProxy 공유 캐시.
 *
 * 배경: renderer.renderPageToCanvas 는 호출마다 loadPdfDocument(bytes) →
 * doc.destroy() 로 전체 PDF를 재파싱한다. 연속 스크롤은 동시에 여러 페이지를
 * 렌더하고 스크롤마다 재렌더하므로 재파싱이 치명적이다.
 *
 * 키잉: docId 가 아니라 bytes 참조(identity)로 키잉한다. 편집(delete/rotate/
 * reorder/insert/watermark)은 동일 docId 로 '새 bytes' 를 만들므로 docId
 * 키잉은 stale 렌더를 유발한다. loader.loadPdfDocument 는 입력 bytes 를
 * 내부 방어 복사하므로(원본 detach 안 됨) 스토어의 bytes 참조는 안정적 →
 * WeakMap<Uint8Array> 키가 정확하고 GC 친화적이다.
 *
 * 메모리 상한: 활성 bytes 1개만 유지. 새 bytes 를 acquire 하면 이전 1개를
 * 강제 destroy 한다(참조 카운트와 무관 — 활성 문서 전환/편집 시 이전 문서
 * 슬롯들은 이미 cancel/unmount 되는 흐름).
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadPdfDocument } from './loader'

interface Entry {
  bytes: Uint8Array
  promise: Promise<PDFDocumentProxy>
  refs: number
}

const cache = new WeakMap<Uint8Array, Entry>()
/** 현재 활성(가장 최근 acquire) bytes — 상한 1개 유지용 */
let activeKey: Uint8Array | null = null
let activeEntry: Entry | null = null

async function destroyEntry(entry: Entry): Promise<void> {
  try {
    const doc = await entry.promise
    await doc.destroy()
  } catch {
    // 로드 실패 또는 이미 destroy 된 경우 — 무시
  }
}

/**
 * bytes 에 대한 PDFDocumentProxy 를 획득(없으면 1회 로드). 참조 +1.
 * 다른 bytes 였다면 이전 활성 항목을 즉시 destroy(상한 1개).
 *
 * 계약(중요): 동시에 논리적 소유자는 1개만 가정한다. 새 bytes 를 acquire 하면
 * 이전 활성 항목을 refs 와 무관하게 destroy 하므로, 소유자는 bytes 전환 시
 * 자신의 doc 참조를 먼저 버리고(setDoc(null) 등) 진행 중 렌더를 cancel 한 뒤
 * 다음 bytes 를 acquire 해야 한다. (ContinuousViewer 의 effect cleanup →
 * release+doc=null+slot cancel → 새 effect 에서 acquire 순서가 이를 보장.)
 */
export function acquirePdfDoc(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  let entry = cache.get(bytes)
  if (!entry) {
    entry = { bytes, promise: loadPdfDocument(bytes), refs: 0 }
    cache.set(bytes, entry)
  }
  entry.refs += 1

  if (activeKey !== bytes) {
    const prev = activeEntry
    if (prev && prev !== entry) {
      void destroyEntry(prev)
      cache.delete(prev.bytes)
    }
    activeKey = bytes
    activeEntry = entry
  }
  return entry.promise
}

/** 참조 -1. 0이 되면 destroy(단, 현재 활성 항목이면 다음 전환까지 보존). */
export function releasePdfDoc(bytes: Uint8Array): void {
  const entry = cache.get(bytes)
  if (!entry) return
  entry.refs = Math.max(0, entry.refs - 1)
  if (entry.refs === 0 && activeEntry !== entry) {
    void destroyEntry(entry)
    cache.delete(bytes)
  }
}
