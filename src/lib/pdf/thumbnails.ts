/**
 * 증분 썸네일 전략 (P1-9)
 *
 * 문제:
 *   기존 store 는 모든 편집(delete/reorder/rotate) 후 buildDocument 로
 *   pages 메타를 재구성하고 generateThumbnails 로 전 페이지 썸네일을
 *   재렌더했다. 100p 문서에서 1p 만 회전해도 100장 재렌더 → 매우 느림.
 *
 * 해결:
 *   작업 유형별로 기존 썸네일을 최대한 재사용한다.
 *   - rotate : 썸네일 비트맵 재렌더 0장. PageThumbnail 이 CSS
 *              `transform: rotate(page.rotation deg)` 로 회전 표시하므로
 *              rotation 메타만 갱신하면 된다(컴포넌트 계약 보존).
 *   - delete : 살아남은 페이지의 기존 썸네일을 인덱스 리매핑으로 보존.
 *              재렌더 0장.
 *   - reorder: 기존 썸네일을 newOrder 에 맞춰 재배치만. 재렌더 0장.
 *   - merge  : 신규 문서이므로 전체 생성 불가피(store 가 현행 유지).
 *
 * 모든 함수는 순수 함수: 입력 pages 를 변이하지 않고 새 PdfPage[] 반환.
 * pages[].thumbnail / rotation 계약은 usePageManager/PageGrid 기대대로 유지.
 */

import type { PageIndex, PdfPage, RotationDegrees } from '@/lib/types'

/**
 * delete 후 페이지 메타 리매핑.
 *
 * 삭제되지 않은 페이지의 thumbnail/width/height/rotation 을 그대로 보존하고
 * index/docId/selected 만 새 문서 기준으로 재설정한다. 썸네일 재렌더 0장.
 *
 * @param prevPages 삭제 직전 pages (정렬: index 오름차순 가정)
 * @param deletedIndices 삭제된 0-based 인덱스(원본 기준)
 * @param docId 대상 문서 id (유지)
 * @returns 삭제 후 새 pages (index 0..n-1 재부여)
 */
export function remapPagesAfterDelete(
  prevPages: PdfPage[],
  deletedIndices: PageIndex[],
  docId: string,
): PdfPage[] {
  const removed = new Set(deletedIndices)
  return prevPages
    .filter((p) => !removed.has(p.index))
    .map((p, newIndex) => ({
      ...p,
      index: newIndex,
      docId,
      selected: false,
    }))
}

/**
 * reorder 후 페이지 메타 재배치.
 *
 * newOrder[i] = 원본에서 새 i번째 자리에 올 페이지의 원본 인덱스.
 * 기존 썸네일/회전/크기를 새 순서로 옮겨 담는다. 썸네일 재렌더 0장.
 *
 * @param prevPages 재정렬 직전 pages (정렬: index 오름차순 가정)
 * @param newOrder 0..n-1 순열
 * @param docId 대상 문서 id (유지)
 * @returns 재정렬된 새 pages (index 0..n-1 재부여)
 */
export function remapPagesAfterReorder(
  prevPages: PdfPage[],
  newOrder: PageIndex[],
  docId: string,
): PdfPage[] {
  // 원본 인덱스 → page 빠른 조회
  const byIndex = new Map<number, PdfPage>()
  for (const p of prevPages) byIndex.set(p.index, p)

  return newOrder.map((origIndex, newIndex) => {
    const src = byIndex.get(origIndex)
    if (!src) {
      // 방어: 잘못된 newOrder. 빈 페이지 메타로 대체(썸네일 미정).
      return {
        index: newIndex,
        docId,
        thumbnail: undefined,
        selected: false,
        width: 0,
        height: 0,
        rotation: 0 as RotationDegrees,
      }
    }
    return {
      ...src,
      index: newIndex,
      docId,
      selected: false,
    }
  })
}

/**
 * rotate 후 페이지 메타 갱신.
 *
 * 회전된 페이지의 rotation 누적값만 갱신한다. 썸네일 비트맵은
 * 재렌더하지 않는다(PageThumbnail 이 CSS transform 으로 회전 표시,
 * PdfViewer 는 page.rotation 을 pdfjs viewport rotation 으로 전달).
 * 나머지 페이지는 그대로 재사용. 재렌더 0장.
 *
 * @param prevPages 회전 직전 pages
 * @param pageIndex 회전 대상 0-based 인덱스
 * @param deg 추가 회전 각도(시계방향)
 * @returns rotation 만 갱신된 새 pages
 */
export function remapPagesAfterRotate(
  prevPages: PdfPage[],
  pageIndex: PageIndex,
  deg: 90 | 180 | 270,
): PdfPage[] {
  return prevPages.map((p) => {
    if (p.index !== pageIndex) return p
    const next = (((p.rotation ?? 0) + deg) % 360) as RotationDegrees
    return { ...p, rotation: next }
  })
}
