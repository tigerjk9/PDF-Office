'use client'

import { usePdfStore } from '@/lib/store/pdf-store'
import { SinglePageViewer } from '@/components/viewer/SinglePageViewer'
import { ContinuousViewer } from '@/components/viewer/ContinuousViewer'

/**
 * 뷰어 셸 — viewer.viewMode 에 따라 단일/연속 뷰어를 분기한다.
 * 단일 경로는 SinglePageViewer 로 동작 변경 없이 보존(회귀 최소화).
 */
export function PdfViewer() {
  const viewMode = usePdfStore((s) => s.viewer.viewMode)
  if (viewMode === 'continuous') return <ContinuousViewer />
  return <SinglePageViewer />
}
