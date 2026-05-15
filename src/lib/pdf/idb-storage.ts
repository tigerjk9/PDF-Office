/**
 * IndexedDB 영속 스토리지 어댑터 (zustand persist 용)
 *
 * 목적:
 *   업로드한 PDF(Uint8Array bytes)와 편집 상태를 새로고침/탭닫기 후에도
 *   복원할 수 있도록 IndexedDB에 무손실 저장한다.
 *
 * 왜 IndexedDB + structured clone 인가?
 *   - localStorage는 문자열만 저장 → Uint8Array를 JSON으로 직렬화하면
 *     바이트가 깨지고 용량(보통 5MB)도 부족하다.
 *   - IndexedDB는 값을 "structured clone"으로 그대로 저장하므로
 *     Uint8Array/ArrayBuffer가 손실 없이 보존된다.
 *
 * zustand v5 PersistStorage 계약:
 *   - getItem(name): StorageValue<S> | null | Promise<...>
 *   - setItem(name, value: StorageValue<S>): void | Promise<void>
 *   - removeItem(name): void | Promise<void>
 *   커스텀 storage 를 쓰면 zustand 는 JSON 직렬화를 하지 않고
 *   StorageValue 객체({ state, version })를 그대로 넘긴다.
 *   → 우리가 IndexedDB에 객체째 저장하면 bytes 가 그대로 살아남는다.
 *   getItem 이 Promise 를 반환하면 zustand 는 비동기 rehydrate 를 수행한다.
 */

import type { PersistStorage, StorageValue } from 'zustand/middleware'

// ---- 상수 -----------------------------------------------------------------

const DB_NAME = 'pdf-office-db'
const DB_VERSION = 1
const STORE_NAME = 'persist'

/** 합산 저장 용량 상한 (byte). 초과 시 오래된 문서부터 제외 */
const MAX_TOTAL_BYTES = 80 * 1024 * 1024 // 80MB

/** setItem 디바운스 (ms). 잦은 상태 변경 시 IndexedDB 쓰기 폭주 방지 */
const WRITE_DEBOUNCE_MS = 400

// ---- 환경 가드 -------------------------------------------------------------

/**
 * IndexedDB 사용 가능 환경인지 판정한다.
 * - SSR / 비브라우저 (Next.js prerender 포함): window/indexedDB 부재 → false
 * - 시크릿 모드 등에서 indexedDB 가 정의돼 있지 않은 경우도 false
 *
 * 이 경우는 "정상 케이스"이므로 호출 측은 스택트레이스 로그 없이
 * 조용히 빈 상태로 동작해야 한다(빌드 로그 오염 방지).
 */
function isIdbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}

// ---- IndexedDB 저수준 래퍼 -------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null

/**
 * IndexedDB 핸들을 1회 열고 캐시한다.
 * 브라우저(IndexedDB 미가용) 환경이 아니면 reject.
 */
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })

  // 실패 시 다음 호출에서 재시도 가능하도록 캐시 무효화
  dbPromise.catch(() => {
    dbPromise = null
  })

  return dbPromise
}

/** key → value 단건 조회 */
async function idbGet<V>(key: string): Promise<V | undefined> {
  const db = await openDb()
  return new Promise<V | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result as V | undefined)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'))
  })
}

/** key ← value 저장 (객체째 structured clone) */
async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB set failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB set aborted'))
  })
}

/** key 삭제 */
async function idbDel(key: string): Promise<void> {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'))
  })
}

// ---- 용량 가드 -------------------------------------------------------------

/**
 * documents 배열의 합산 bytes 크기를 측정한다.
 * bytes 필드가 Uint8Array 인 경우만 byteLength 합산.
 */
function measureDocsBytes(documents: unknown): number {
  if (!Array.isArray(documents)) return 0
  let total = 0
  for (const doc of documents) {
    const b = (doc as { bytes?: unknown })?.bytes
    if (b instanceof Uint8Array) total += b.byteLength
    else if (b instanceof ArrayBuffer) total += b.byteLength
  }
  return total
}

/**
 * 합산 용량이 상한을 넘으면 가장 오래된 문서부터 제외한다.
 * (createdAt 오름차순 정렬 후 누적 합이 상한 이하가 되도록 잘라냄)
 *
 * 불변성 유지: 원본 state 를 변이하지 않고 새 객체를 반환.
 * 반환된 state 는 IndexedDB 에 저장될 값이며, 메모리 스토어 상태는 건드리지 않는다.
 */
function enforceCapacity<S>(state: S): S {
  const s = state as { documents?: unknown; activeDocId?: unknown }
  if (!Array.isArray(s.documents) || s.documents.length === 0) return state

  const total = measureDocsBytes(s.documents)
  if (total <= MAX_TOTAL_BYTES) return state

  // 오래된 순(createdAt asc)으로 정렬한 사본
  const byAge = [...s.documents].sort((a, b) => {
    const ca = Number((a as { createdAt?: number })?.createdAt ?? 0)
    const cb = Number((b as { createdAt?: number })?.createdAt ?? 0)
    return ca - cb
  })

  // 최신부터 누적해 상한 이하인 문서만 유지
  const keptReversed: unknown[] = []
  let acc = 0
  for (let i = byAge.length - 1; i >= 0; i--) {
    const doc = byAge[i]
    const b = (doc as { bytes?: unknown })?.bytes
    const size =
      b instanceof Uint8Array
        ? b.byteLength
        : b instanceof ArrayBuffer
          ? b.byteLength
          : 0
    if (acc + size > MAX_TOTAL_BYTES && keptReversed.length > 0) continue
    acc += size
    keptReversed.unshift(doc)
  }

  const dropped = s.documents.length - keptReversed.length
  if (dropped > 0) {
    console.warn(
      `[idb-storage] 저장 용량 상한(${Math.round(
        MAX_TOTAL_BYTES / 1024 / 1024,
      )}MB) 초과: 오래된 문서 ${dropped}건을 영속 저장에서 제외합니다.`,
    )
  }

  // activeDocId 가 제외된 문서를 가리키면 보정
  const keptIds = new Set(
    keptReversed.map((d) => (d as { id?: unknown })?.id),
  )
  const nextActive = keptIds.has(s.activeDocId)
    ? s.activeDocId
    : ((keptReversed[keptReversed.length - 1] as { id?: unknown })?.id ?? null)

  return { ...state, documents: keptReversed, activeDocId: nextActive } as S
}

// ---- zustand PersistStorage 어댑터 ----------------------------------------

let writeTimer: ReturnType<typeof setTimeout> | null = null
let pendingWrite: { key: string; value: StorageValue<unknown> } | null = null

/** IndexedDB 쓰기가 성공적으로 settle 될 때마다 호출되는 리스너 */
const settledListeners = new Set<() => void>()

/**
 * 영속 저장 1회가 디스크에 반영 완료될 때 알림을 받는다.
 * 스토어는 이를 이용해 "미반영(dirty)" 플래그를 정확히 해제한다.
 * @returns 구독 해제 함수
 */
export function onPersistSettled(cb: () => void): () => void {
  settledListeners.add(cb)
  return () => settledListeners.delete(cb)
}

function notifySettled(): void {
  for (const cb of settledListeners) {
    try {
      cb()
    } catch {
      /* 리스너 오류는 영속 로직과 무관 — 무시 */
    }
  }
}

/**
 * 디바운스된 IndexedDB 쓰기.
 * 마지막 호출만 실제 기록(state 는 항상 최신 스냅샷).
 */
function scheduleWrite(key: string, value: StorageValue<unknown>): void {
  pendingWrite = { key, value }
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    const job = pendingWrite
    pendingWrite = null
    writeTimer = null
    if (!job) return
    idbSet(job.key, job.value)
      .then(() => notifySettled())
      .catch((e) => {
        console.warn('[idb-storage] 영속 저장 실패:', e)
      })
  }, WRITE_DEBOUNCE_MS)
}

/**
 * 페이지 이탈 직전 등 즉시 flush 가 필요할 때 호출.
 * 대기 중인 디바운스 쓰기를 동기 트리거(완료는 비동기)한다.
 */
export function flushPersist(): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  const job = pendingWrite
  pendingWrite = null
  if (job) {
    idbSet(job.key, job.value)
      .then(() => notifySettled())
      .catch((e) => {
        console.warn('[idb-storage] flush 저장 실패:', e)
      })
  }
}

/**
 * zustand persist 용 IndexedDB 스토리지.
 *
 * - getItem: Promise 반환 → zustand 비동기 rehydrate 경로 사용.
 *            저장된 값이 없으면 null.
 * - setItem: 용량 가드 적용 후 디바운스 저장. JSON 직렬화 없음(bytes 보존).
 * - removeItem: 키 삭제.
 *
 * SSR(서버) 환경에서는 IndexedDB 가 없으므로 모든 작업이 안전하게 no-op/실패 흡수.
 */
export function createIdbStorage<S>(): PersistStorage<S> {
  return {
    getItem: async (name: string): Promise<StorageValue<S> | null> => {
      // SSR/비IndexedDB 환경은 정상 케이스 — 조용히 빈 상태로 시작.
      // (스택트레이스 로그 금지: Next.js prerender 빌드 로그 오염 방지)
      if (!isIdbAvailable()) return null
      try {
        const val = await idbGet<StorageValue<S>>(name)
        return val ?? null
      } catch (e) {
        console.warn('[idb-storage] 복원 실패(무시하고 빈 상태로 시작):', e)
        return null
      }
    },

    setItem: (name: string, value: StorageValue<S>): void => {
      // SSR/비IndexedDB 환경은 정상 케이스 — 조용히 no-op.
      if (!isIdbAvailable()) return
      try {
        // 용량 가드: 저장될 state 만 잘라낸다(메모리 스토어 불변).
        const guarded: StorageValue<S> = {
          ...value,
          state: enforceCapacity(value.state),
        }
        scheduleWrite(name, guarded as StorageValue<unknown>)
      } catch (e) {
        console.warn('[idb-storage] 저장 스케줄 실패:', e)
      }
    },

    removeItem: async (name: string): Promise<void> => {
      // SSR/비IndexedDB 환경은 정상 케이스 — 조용히 no-op.
      if (!isIdbAvailable()) return
      try {
        await idbDel(name)
      } catch (e) {
        console.warn('[idb-storage] 삭제 실패:', e)
      }
    },
  }
}
