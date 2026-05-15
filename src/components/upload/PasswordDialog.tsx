'use client'

import { useEffect, useState } from 'react'
import { Lock, Loader2, AlertCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface PasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 잠금 해제 대상 파일명(안내용) */
  fileName: string | null
  /** 직전 비밀번호 시도가 실패했는지(재안내) */
  retryFailed: boolean
  /** 잠금 해제 진행 중 */
  unlocking: boolean
  /** 비밀번호 제출 */
  onSubmit: (password: string) => void | Promise<void>
}

/**
 * 암호 PDF 비밀번호 입력 다이얼로그 (P2-8).
 *
 * 업로드 결과가 ENCRYPTED_PDF일 때 표시된다. 비밀번호를 받아
 * 상위(useEncryptedUpload)의 loadEncryptedDocument 흐름으로 위임한다.
 * 틀리면 retryFailed로 재안내한다.
 */
export function PasswordDialog({
  open,
  onOpenChange,
  fileName,
  retryFailed,
  unlocking,
  onSubmit,
}: PasswordDialogProps) {
  const [password, setPassword] = useState('')

  // 다이얼로그가 새로 열릴 때 입력 초기화
  useEffect(() => {
    if (open) setPassword('')
  }, [open])

  const canSubmit = password.length > 0 && !unlocking

  const handleSubmit = () => {
    if (!canSubmit) return
    void onSubmit(password)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // 잠금 해제 진행 중에는 닫지 못하도록
        if (unlocking) return
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-sm gap-0 p-0">
        <DialogHeader className="gap-2.5 p-5">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"
              aria-hidden
            >
              <Lock className="h-3.5 w-3.5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <DialogTitle>암호로 보호된 PDF</DialogTitle>
              <DialogDescription>
                {fileName ? (
                  <>
                    <span className="font-medium text-foreground">
                      {fileName}
                    </span>
                    은(는) 비밀번호로 보호되어 있습니다. 열려면 비밀번호를
                    입력하세요.
                  </>
                ) : (
                  '이 PDF는 비밀번호로 보호되어 있습니다. 열려면 비밀번호를 입력하세요.'
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2 px-5 pb-1">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="PDF 비밀번호"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs transition-colors placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="PDF 비밀번호"
          />
          {retryFailed && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive-soft-border bg-destructive-soft p-2 text-2xs text-destructive"
            >
              <AlertCircle
                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                aria-hidden
              />
              <span>
                비밀번호가 올바르지 않습니다. 다시 확인하고 입력하세요.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-border bg-muted/40 px-5 py-3.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={unlocking}
          >
            취소
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            {unlocking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                여는 중...
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                열기
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
