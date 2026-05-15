/**
 * 병합 페이지 크기 정규화 (pdf-lib) — R2-2
 *
 * 서로 다른 페이지 크기의 문서를 병합할 때 페이지가 제각각 크기로
 * 섞이는 문제를 해결한다. 모든 소스 페이지를 공통 타깃 박스에
 * **종횡비 보존하며 맞춤(letterbox, 중앙 정렬)** 한다.
 *
 * 정규화 정책:
 *  1) 타깃 크기 = 전체 소스 페이지 중 **최빈(mode) 크기**.
 *     동률 시 면적이 큰 쪽 우선. (지배 문서 레이아웃 유지 →
 *     A4 다수 + 소수 이형 크기 병합 시 결과는 A4 로 통일)
 *  2) **페이지별 방향(가로/세로) 유지**: 소스가 가로인데 타깃이
 *     세로면(또는 그 반대) 해당 페이지에 한해 타깃 박스의 폭/높이를
 *     교환해 사용 → 가로 콘텐츠가 세로 박스에 짓눌리지 않음.
 *  3) **종횡비 보존 스케일**: scale = min(boxW/srcW, boxH/srcH).
 *     스케일된 페이지를 박스 중앙에 배치(letterbox). 왜곡·잘림 없음.
 *  4) **불필요한 재스케일 회피(빠른 경로)**: 모든 소스 페이지 크기가
 *     타깃과 정확히 동일하면 재임베드 없이 copyPages 로 직접 복사
 *     (단일 문서/동일 크기 병합은 기존과 동일 결과·성능).
 *
 * pdf-lib `embedPage` 는 페이지의 "보이는" 박스(rotation 반영)를
 * 임베드하므로, /Rotate 가 걸린 소스 페이지도 보이는 치수로 처리된다.
 *
 * manipulator.ts(삭제/순서/병합/회전) 비대화를 막기 위해 분리한다.
 * (코딩 규칙: 800줄 이내, 도메인별 분할)
 */

import { PDFDocument } from 'pdf-lib'

/** 부동소수 비교 허용 오차 (pt). 0.5pt 미만은 동일 크기로 본다. */
const SIZE_EPS = 0.5

interface Size {
  width: number
  height: number
}

/** a, b 가 (허용 오차 내) 동일 크기인지. */
function sizeEquals(a: Size, b: Size): boolean {
  return (
    Math.abs(a.width - b.width) < SIZE_EPS &&
    Math.abs(a.height - b.height) < SIZE_EPS
  )
}

/** 크기를 그룹핑용 키로 양자화(반올림). */
function sizeKey(s: Size): string {
  return `${Math.round(s.width)}x${Math.round(s.height)}`
}

/**
 * 전체 소스 페이지 크기에서 타깃 박스를 결정한다.
 *  - 최빈(mode) 크기 선택. 동률 시 면적이 큰 쪽.
 *  - 모든 크기가 유일하면(전부 1회) 면적 최대 페이지가 타깃.
 *
 * @param sizes 모든 소스 페이지의 크기(보이는 치수) 배열
 * @returns 타깃 페이지 박스 크기
 */
export function computeTargetSize(sizes: Size[]): Size {
  if (sizes.length === 0) {
    // 호출 측에서 빈 배열이 들어올 일은 없으나 방어적으로 A4.
    return { width: 595.28, height: 841.89 }
  }

  const groups = new Map<string, { size: Size; count: number }>()
  for (const s of sizes) {
    const key = sizeKey(s)
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
    } else {
      groups.set(key, { size: { width: s.width, height: s.height }, count: 1 })
    }
  }

  let best: { size: Size; count: number } | null = null
  for (const g of groups.values()) {
    if (best === null) {
      best = g
      continue
    }
    const gArea = g.size.width * g.size.height
    const bestArea = best.size.width * best.size.height
    // 더 자주 등장하면 채택, 동률이면 면적 큰 쪽.
    if (g.count > best.count || (g.count === best.count && gArea > bestArea)) {
      best = g
    }
  }

  return best!.size
}

/**
 * 소스 페이지 방향에 맞춰 타깃 박스를 조정한다.
 * 소스가 가로(width>height)인데 타깃이 세로면(또는 반대) 박스를 회전
 * (폭/높이 교환)해 방향을 유지한다. 정사각형(차이 미미)은 그대로 둔다.
 */
function orientedBox(target: Size, src: Size): Size {
  const srcLandscape = src.width > src.height + SIZE_EPS
  const srcPortrait = src.height > src.width + SIZE_EPS
  const targetLandscape = target.width > target.height + SIZE_EPS
  const targetPortrait = target.height > target.width + SIZE_EPS

  const orientationMismatch =
    (srcLandscape && targetPortrait) || (srcPortrait && targetLandscape)

  return orientationMismatch
    ? { width: target.height, height: target.width }
    : { width: target.width, height: target.height }
}

/**
 * 여러 PDF 를 **통일된 페이지 크기로 정규화하며** 병합한다.
 *
 * 모든 소스 페이지가 (타깃과) 동일 크기면 재임베드 없이 copyPages 로
 * 직접 복사한다(기존 병합과 동일 결과·성능). 크기가 섞여 있으면 각
 * 페이지를 타깃 박스에 종횡비 보존·중앙 정렬로 letterbox 배치한다.
 *
 * @param bytesArray 병합할 PDF 바이트 배열(2개 이상, 순서=결과 순서)
 * @returns 정규화 병합된 PDF 바이트
 */
export async function mergeNormalized(
  bytesArray: Uint8Array[],
): Promise<Uint8Array> {
  // 1) 모든 소스 문서 로드 + 페이지 크기 수집(보이는 치수).
  const sources: { doc: PDFDocument; sizes: Size[] }[] = []
  for (const bytes of bytesArray) {
    // eslint-disable-next-line no-await-in-loop
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false })
    const sizes = doc.getPages().map((p) => {
      const { width, height } = p.getSize()
      return { width, height }
    })
    sources.push({ doc, sizes })
  }

  const allSizes = sources.flatMap((s) => s.sizes)
  const target = computeTargetSize(allSizes)

  // 모든 페이지가 타깃과 동일 크기면 빠른 경로(재임베드 회피).
  const allUniform = allSizes.every((s) => sizeEquals(s, target))

  const merged = await PDFDocument.create()

  if (allUniform) {
    for (const { doc } of sources) {
      // eslint-disable-next-line no-await-in-loop
      const pages = await merged.copyPages(doc, doc.getPageIndices())
      pages.forEach((p) => merged.addPage(p))
    }
    return merged.save()
  }

  // 2) 크기 혼재 — 각 페이지를 타깃 박스에 letterbox 배치.
  for (const { doc, sizes } of sources) {
    const indices = doc.getPageIndices()
    // 같은 문서 내 페이지들을 한 번에 임베드(성능).
    // eslint-disable-next-line no-await-in-loop
    const embedded = await merged.embedPages(doc.getPages())

    for (let i = 0; i < indices.length; i += 1) {
      const src = sizes[i]
      const box = orientedBox(target, src)

      const newPage = merged.addPage([box.width, box.height])

      const ep = embedded[i]
      // 종횡비 보존 스케일(letterbox): 박스를 넘지 않도록 min 사용.
      const scale =
        src.width > 0 && src.height > 0
          ? Math.min(box.width / src.width, box.height / src.height)
          : 1
      const drawW = src.width * scale
      const drawH = src.height * scale
      // 중앙 정렬 오프셋.
      const x = (box.width - drawW) / 2
      const y = (box.height - drawH) / 2

      newPage.drawPage(ep, {
        x,
        y,
        width: drawW,
        height: drawH,
      })
    }
  }

  return merged.save()
}
