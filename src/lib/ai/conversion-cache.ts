/**
 * AI 변환 결과 캐시 (P2-7) — AI 도메인 단독 소유
 *
 * pdf-store / conversionResults / partialize는 engine 소유라 절대 건드리지
 * 않는다. 본 모듈은 lib/ai 안에서 자체적으로 IndexedDB를 사용해 문서별
 * 변환 결과를 영속한다.
 *
 * 설계:
 *   - 캐시 키 = `${docName}:${sizeBytes}:${pageCount}` (UI 계약과 정확히 일치)
 *   - 본문(markdown)은 IndexedDB에 저장 (대용량 가능, 비동기)
 *   - hasCachedResult / cachedAt 는 동기 API여야 하므로, 마운트 시
 *     "키 → 메타(provider, completedAt)" 인덱스만 메모리에 적재한다.
 *     본문은 restoreCached 호출 시 비동기로 읽는다.
 *
 * SSR/비브라우저 / IndexedDB 미지원(시크릿 모드 등)에서는 모든 동작이
 * 조용히 no-op (캐시 미스)로 폴백한다 — 변환 기능 자체는 영향 없음.
 */

import type { AIProvider } from '@/lib/types'

/** IndexedDB 데이터베이스 / 스토어 이름 (AI 도메인 전용 네임스페이스) */
const DB_NAME = 'pdf-office-ai'
const STORE_NAME = 'conversion-cache'
const DB_VERSION = 1

/** 캐시 한 건의 영속 형태 (IndexedDB value) */
export interface CachedConversion {
  /** 캐시 키 = `${docName}:${sizeBytes}:${pageCount}` */
  key: string
  /** 변환된 Markdown 본문 */
  markdown: string
  /** 변환에 사용된 제공자 */
  provider: AIProvider
  /** 변환 완료 시각 (epoch ms) */
  completedAt: number
}

/** 본문을 제외한 메모리 인덱스 엔트리 (동기 조회용) */
export interface CacheMeta {
  provider: AIProvider
  completedAt: number
}

/** 캐시 키 빌더 — UI(ConvertPanel)와 정확히 동일한 형식이어야 한다. */
export function buildCacheKey(
  docName: string,
  sizeBytes: number,
  pageCount: number,
): string {
  return `${docName}:${sizeBytes}:${pageCount}`
}

/** 브라우저 IndexedDB 사용 가능 여부 */
function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

let dbPromise: Promise<IDBDatabase | null> | null = null

/** DB 핸들을 1회 열어 캐시한다. 실패 시 null (캐시 비활성 폴백). */
function openDb(): Promise<IDBDatabase | null> {
  if (!idbAvailable()) return Promise.resolve(null)
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return dbPromise
}

/**
 * 메모리 인덱스 — `hasCachedResult` / `cachedAt` 동기 응답용.
 * loadIndex() 가 IndexedDB의 전체 키/메타를 1회 읽어 채운다.
 */
const memIndex = new Map<string, CacheMeta>()
let indexLoaded = false

/**
 * IndexedDB → 메모리 인덱스 적재 (마운트 시 1회 호출).
 * 본문(markdown)은 적재하지 않는다(메모리 절약). 키 + 메타만.
 * 멱등: 여러 번 호출해도 안전.
 */
export async function loadIndex(): Promise<void> {
  if (indexLoaded) return
  const db = await openDb()
  if (!db) {
    indexLoaded = true
    return
  }

  await new Promise<void>((resolve) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction(STORE_NAME, 'readonly')
    } catch {
      resolve()
      return
    }
    const store = tx.objectStore(STORE_NAME)
    const cursorReq = store.openCursor()
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result
      if (cursor) {
        const v = cursor.value as CachedConversion
        if (v && typeof v.key === 'string') {
          memIndex.set(v.key, {
            provider: v.provider,
            completedAt: v.completedAt,
          })
        }
        cursor.continue()
      } else {
        resolve()
      }
    }
    cursorReq.onerror = () => resolve()
  })

  indexLoaded = true
}

/** 동기 — 메모리 인덱스에 키가 있는지 */
export function hasCached(key: string): boolean {
  return memIndex.has(key)
}

/** 동기 — 캐시 완료 시각(ms) 또는 null */
export function cachedAtSync(key: string): number | null {
  return memIndex.get(key)?.completedAt ?? null
}

/** 동기 — 캐시 메타 (provider/completedAt) 또는 null */
export function cachedMeta(key: string): CacheMeta | null {
  return memIndex.get(key) ?? null
}

/**
 * 변환 결과 저장 (비동기). 성공 시 메모리 인덱스도 즉시 갱신해
 * 직후의 동기 조회(hasCached/cachedAtSync)가 일관되게 동작한다.
 */
export async function putCached(entry: CachedConversion): Promise<void> {
  // 메모리 인덱스는 IndexedDB 성공 여부와 무관하게 먼저 갱신해
  // 같은 세션 내 즉시 복원이 가능하도록 한다(시크릿 모드 폴백 포함).
  memIndex.set(entry.key, {
    provider: entry.provider,
    completedAt: entry.completedAt,
  })

  const db = await openDb()
  if (!db) {
    // IndexedDB 불가: 메모리 인덱스 + 세션 본문 폴백만 사용.
    sessionFallback.set(entry.key, entry)
    return
  }

  await new Promise<void>((resolve) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction(STORE_NAME, 'readwrite')
    } catch {
      sessionFallback.set(entry.key, entry)
      resolve()
      return
    }
    const store = tx.objectStore(STORE_NAME)
    try {
      store.put(entry)
    } catch {
      sessionFallback.set(entry.key, entry)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => {
      sessionFallback.set(entry.key, entry)
      resolve()
    }
    tx.onabort = () => {
      sessionFallback.set(entry.key, entry)
      resolve()
    }
  })
}

/**
 * IndexedDB 불가 환경(시크릿 모드 등)에서 같은 세션 동안만 유지되는
 * 본문 폴백. 메모리 인덱스만으로는 본문을 복원할 수 없으므로 필요.
 */
const sessionFallback = new Map<string, CachedConversion>()

/**
 * 캐시된 변환 결과 본문 읽기 (비동기). 없으면 null.
 */
export async function getCached(
  key: string,
): Promise<CachedConversion | null> {
  const sf = sessionFallback.get(key)
  if (sf) return sf

  const db = await openDb()
  if (!db) return null

  return new Promise<CachedConversion | null>((resolve) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction(STORE_NAME, 'readonly')
    } catch {
      resolve(null)
      return
    }
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(key)
    req.onsuccess = () => {
      const v = req.result as CachedConversion | undefined
      resolve(v ?? null)
    }
    req.onerror = () => resolve(null)
  })
}
