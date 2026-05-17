'use client'

import { usePdfStore } from '@/lib/store/pdf-store'
import { SinglePageViewer } from '@/components/viewer/SinglePageViewer'
import { ContinuousViewer } from '@/components/viewer/ContinuousViewer'

/**
 * 뷰어 셸 — viewer.viewMode 에 따라 뷰어를 분기한다.
 * 'single'만 SinglePageViewer(동작 변경 없이 보존, 회귀 최소화),
 * 'continuous'·'spread'는 ContinuousViewer(spread=2페이지 2-up).
 */
export function PdfViewer() {
  const viewMode = usePdfStore((s) => s.viewer.viewMode)
  if (viewMode === 'single') return <SinglePageViewer />
  return <ContinuousViewer />
}
