/**
 * 연속 뷰어 2페이지(2-up) 행 그룹핑 — 순수 함수.
 *
 * 단순 2-up(표지 오프셋 없음): [0,1] / [2,3] / [4,5] …,
 * 홀수 끝 페이지는 단독 행 [iN].
 * cols<=1 이면 각 아이템을 단독 행([x])으로 반환해
 * 1열·2열 렌더 경로를 동일 "행 배열" 구조로 통일한다.
 * 순수·결정적(부수효과 없음).
 */
export function groupIntoRows<T>(items: T[], cols: number): T[][] {
  if (cols <= 1) return items.map((x) => [x])
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols))
  }
  return rows
}
