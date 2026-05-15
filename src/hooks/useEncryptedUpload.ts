/**
 * useEncryptedUpload — 암호 PDF 업로드 재시도 흐름 (P2-8, UI 전용)
 *
 * 흐름:
 *   1. DropZone이 loadDocuments(files) 호출 (기존 동작 — 회귀 없음).
 *   2. 로드 실패로 store.error.code === 'ENCRYPTED_PDF'가 되면,
 *      이 훅이 직전에 시도한 File 객체를 보관하고 비밀번호 다이얼로그를 연다.
 *   3. 사용자가 비밀번호 입력 → store.loadEncryptedDocument(file, password)
 *      (동결 계약 — types.ts에 이미 선언됨, 구현은 engine 병렬 착륙).
 *   4. 실패 시 다시 ENCRYPTED_PDF 에러 → 재안내(다이얼로그 유지).
 *
 * 파일 소유권: store/lib 미수정. 계약 액션을 소비만 한다.
 * DropZone은 수정하지 않고, 이 훅을 AppShell에 마운트해
 * store.error 변화를 구독하는 방식으로 결합한다.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { usePdfStore } from '@/lib/store/pdf-store'

export interface UseEncryptedUploadReturn {
  /** 비밀번호 다이얼로그 표시 여부 */
  passwordOpen: boolean
  setPasswordOpen: (open: boolean) => void
  /** 잠금 해제를 시도할 파일 이름(안내용) */
  encryptedFileName: string | null
  /** 직전 시도가 비밀번호 오류였는지(재안내 문구용) */
  retryFailed: boolean
  /** 잠금 해제 진행 중 */
  unlocking: boolean
  /** 비밀번호로 잠금 해제 시도 */
  submitPassword: (password: string) => Promise<void>
  /** 외부에서 마지막 시도 파일을 등록(드롭존 우회용, 선택) */
  registerCandidate: (file: File) => void
}

/**
 * react-dropzone을 거치는 업로드 File을 가로채기 위해,
 * window 레벨에서 마지막으로 선택/드롭된 PDF File을 추적한다.
 * (DropZone 미수정 원칙 — change/drop 이벤트를 캡처 단계에서 관찰)
 */
function useLastPickedFile(): React.MutableRefObject<File | null> {
  const ref = useRef<File | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const remember = (file: File | undefined | null) => {
      if (file && file.type === 'application/pdf') {
        ref.current = file
      } else if (file && /\.pdf$/i.test(file.name)) {
        ref.current = file
      }
    }

    const onChange = (e: Event) => {
      const target = e.target as HTMLInputElement | null
      const f = target?.files?.[0]
      remember(f)
    }
    const onDrop = (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0]
      remember(f)
    }

    // 캡처 단계에서 관찰만(기존 핸들러 동작에 영향 없음)
    window.addEventListener('change', onChange, true)
    window.addEventListener('drop', onDrop, true)
    return () => {
      window.removeEventListener('change', onChange, true)
      window.removeEventListener('drop', onDrop, true)
    }
  }, [])

  return ref
}

export function useEncryptedUpload(): UseEncryptedUploadReturn {
  const error = usePdfStore((s) => s.error)
  const isLoading = usePdfStore((s) => s.isLoading)
  const loadEncryptedDocument = usePdfStore((s) => s.loadEncryptedDocument)
  const clearError = usePdfStore((s) => s.clearError)

  const lastFileRef = useLastPickedFile()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [encryptedFile, setEncryptedFile] = useState<File | null>(null)
  const [retryFailed, setRetryFailed] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  // 우리가 잠금 해제 시도 중일 때 발생하는 에러는 "재시도 실패"로 구분
  const attemptingRef = useRef(false)

  // store.error가 ENCRYPTED_PDF로 바뀌면 비밀번호 다이얼로그를 띄운다.
  useEffect(() => {
    if (error?.code !== 'ENCRYPTED_PDF') return
    const candidate = lastFileRef.current
    if (candidate) setEncryptedFile(candidate)
    if (attemptingRef.current) {
      // 비밀번호 재시도가 틀린 경우
      setRetryFailed(true)
      attemptingRef.current = false
    } else {
      setRetryFailed(false)
    }
    setPasswordOpen(true)
    // 배너 중복 노출 방지: 다이얼로그로 흐름을 인계하고 전역 에러는 정리.
    clearError()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  const registerCandidate = useCallback((file: File) => {
    setEncryptedFile(file)
  }, [])

  const submitPassword = useCallback(
    async (password: string) => {
      const file = encryptedFile ?? lastFileRef.current
      if (!file || !password) return
      setUnlocking(true)
      attemptingRef.current = true
      try {
        await loadEncryptedDocument(file, password)
        // 성공 판정: 에러가 다시 ENCRYPTED_PDF가 아니면 닫는다.
        const stillEncrypted =
          usePdfStore.getState().error?.code === 'ENCRYPTED_PDF'
        if (!stillEncrypted) {
          attemptingRef.current = false
          setRetryFailed(false)
          setEncryptedFile(null)
          setPasswordOpen(false)
        }
        // 여전히 ENCRYPTED_PDF면 위 useEffect가 retryFailed=true로 재안내.
      } finally {
        setUnlocking(false)
      }
    },
    [encryptedFile, lastFileRef, loadEncryptedDocument],
  )

  return {
    passwordOpen,
    setPasswordOpen,
    encryptedFileName: encryptedFile?.name ?? null,
    retryFailed,
    unlocking: unlocking || (isLoading && attemptingRef.current),
    submitPassword,
    registerCandidate,
  }
}
