/**
 * 편집 히스토리 스택 (P1-8 Undo/Redo)
 *
 * 목적:
 *   삭제/회전/순서변경/병합 작업을 되돌릴 수 있도록 작업 직전 상태의
 *   스냅샷을 보관한다. 스냅샷은 복원에 필요한 최소 상태만 담는다.
 *
 * 설계 — 대칭 RestorePoint 모델:
 *   undo/redo 를 비대칭 분기로 다루지 않고, 스냅샷을 "이 상태로 되돌려라"
 *   는 자기완결 복원점(RestorePoint)으로 표현한다.
 *
 *   RestorePoint = {
 *     docId,                 // 영향 문서 id
 *     doc,                   // 그 문서의 복원 대상 전체 스냅샷.
 *                            //   null → "이 문서는 존재하지 않아야 함"(제거)
 *     prevActiveDocId,       // 복원 후 활성 문서
 *     prevCurrentPageIndex,  // 복원 후 뷰어 페이지
 *   }
 *
 *   - delete/reorder/rotate: 작업 직전 문서 전체(bytes + pages + rotation +
 *     이미 렌더된 thumbnail)를 doc 에 보관 → 복원 시 썸네일 재렌더 0장.
 *   - merge(새 문서 추가): 추가 직전엔 그 문서가 없었으므로 doc=null.
 *     undo 는 추가 문서를 제거하고, redo 는 "undo 시점의 현재 상태"
 *     스냅샷(= 병합 결과 문서 전체)을 다시 적용 → 재렌더 0장.
 *
 * 불변성: 모든 함수는 새 객체/배열을 반환하며 입력을 변이하지 않는다.
 * 영속 제외: 이 스택은 zustand persist partialize 에 넣지 않는다(스토어 책임).
 */

import type { DocId, PdfDocument } from '@/lib/types'

/** 히스토리 스택 최대 단계(메모리/IndexedDB 용량 가드와 정합) */
export const MAX_HISTORY = 20

/**
 * 자기완결 복원점.
 * "docId 문서를 doc 상태로 만들고(또는 doc=null 이면 제거),
 *  활성/뷰어 컨텍스트를 prev* 로 되돌려라."
 */
export interface RestorePoint {
  /** 영향받은 문서 id */
  docId: DocId
  /**
   * 복원 대상 문서 스냅샷(bytes + pages + rotation + thumbnail 포함).
   * null 이면 "이 문서는 존재하지 않아야 함" → documents 에서 제거.
   */
  doc: PdfDocument | null
  /** 복원 후 활성 문서 id */
  prevActiveDocId: DocId | null
  /** 복원 후 뷰어 현재 페이지 인덱스 */
  prevCurrentPageIndex: number
}

/** 히스토리 한 항목 = 복원점 */
export type HistorySnapshot = RestorePoint

/**
 * 불변 히스토리 상태.
 * undo: 가장 최근 작업이 배열 끝(top).
 * redo: undo 로 되돌린 항목이 쌓이는 곳. 새 작업 수행 시 비운다.
 */
export interface HistoryState {
  undo: HistorySnapshot[]
  redo: HistorySnapshot[]
}

/** 빈 히스토리 */
export function emptyHistory(): HistoryState {
  return { undo: [], redo: [] }
}

/** 상한 초과 시 가장 오래된(앞쪽) 항목 제거 */
function trim(stack: HistorySnapshot[]): HistorySnapshot[] {
  return stack.length > MAX_HISTORY
    ? stack.slice(stack.length - MAX_HISTORY)
    : stack
}

/**
 * 새 작업을 수행하기 직전에 호출.
 * 스냅샷을 undo 스택에 push 하고 redo 스택을 비운다.
 * undo 스택이 상한을 넘으면 가장 오래된 항목을 잘라낸다.
 *
 * 불변성: 입력 history 를 변이하지 않고 새 HistoryState 반환.
 */
export function pushSnapshot(
  history: HistoryState,
  snapshot: HistorySnapshot,
): HistoryState {
  return { undo: trim([...history.undo, snapshot]), redo: [] }
}

/**
 * undo 1단계 결과를 계산한다.
 * undo 스택 top 을 꺼내고, redo 스택에 보관할 "현재 상태 복원점"을 받는다.
 *
 * @param history 현재 히스토리
 * @param currentSnapshotForRedo undo 실행 시점의 현재 상태(redo 용)
 * @returns 꺼낸 스냅샷과 다음 히스토리. 비어있으면 null.
 */
export function popUndo(
  history: HistoryState,
  currentSnapshotForRedo: HistorySnapshot,
): { snapshot: HistorySnapshot; next: HistoryState } | null {
  if (history.undo.length === 0) return null
  const snapshot = history.undo[history.undo.length - 1]
  return {
    snapshot,
    next: {
      undo: history.undo.slice(0, -1),
      redo: trim([...history.redo, currentSnapshotForRedo]),
    },
  }
}

/**
 * redo 1단계 결과를 계산한다.
 * redo 스택 top 을 꺼내고, undo 스택에 되돌릴 복원점을 다시 쌓는다.
 *
 * @param history 현재 히스토리
 * @param currentSnapshotForUndo redo 실행 시점의 현재 상태(undo 용)
 * @returns 꺼낸 스냅샷과 다음 히스토리. 비어있으면 null.
 */
export function popRedo(
  history: HistoryState,
  currentSnapshotForUndo: HistorySnapshot,
): { snapshot: HistorySnapshot; next: HistoryState } | null {
  if (history.redo.length === 0) return null
  const snapshot = history.redo[history.redo.length - 1]
  return {
    snapshot,
    next: {
      undo: trim([...history.undo, currentSnapshotForUndo]),
      redo: history.redo.slice(0, -1),
    },
  }
}

/** undo 가능 여부 */
export function canUndo(history: HistoryState): boolean {
  return history.undo.length > 0
}

/** redo 가능 여부 */
export function canRedo(history: HistoryState): boolean {
  return history.redo.length > 0
}
