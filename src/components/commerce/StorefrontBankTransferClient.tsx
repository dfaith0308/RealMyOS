'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import {
  getStorefrontBankTransferSettingsAdmin,
  updateStorefrontBankTransferSettings,
} from '@/actions/admin/storefront-bank-transfer'
import type { StorefrontBankTransferSettings } from '@/lib/storefront-bank-transfer'
import s from '@/app/(admin)/admin-shared.module.css'

export default function StorefrontBankTransferClient({
  initial,
}: {
  initial: StorefrontBankTransferSettings | null
}) {
  const [pending, startTransition] = useTransition()
  const [bankName, setBankName] = useState(initial?.bank_name ?? '')
  const [accountNumber, setAccountNumber] = useState(initial?.account_number ?? '')
  const [accountHolder, setAccountHolder] = useState(initial?.account_holder ?? '')
  const [notice, setNotice] = useState(initial?.notice ?? '')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; variant: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFieldError(null)
    startTransition(async () => {
      const r = await updateStorefrontBankTransferSettings({
        bank_name: bankName,
        account_number: accountNumber,
        account_holder: accountHolder,
        notice,
      })
      if (!r.success) {
        setFieldError(r.error ?? '저장 실패')
        setToast({ text: r.error ?? '저장 실패', variant: 'error' })
        return
      }
      setToast({ text: '저장되었습니다', variant: 'success' })
      const reload = await getStorefrontBankTransferSettingsAdmin()
      if (reload.success && reload.data?.parsed) {
        setBankName(reload.data.parsed.bank_name)
        setAccountNumber(reload.data.parsed.account_number)
        setAccountHolder(reload.data.parsed.account_holder)
        setNotice(reload.data.parsed.notice)
      } else if (reload.success && !reload.data?.parsed) {
        setBankName('')
        setAccountNumber('')
        setAccountHolder('')
        setNotice('')
      }
    })
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div className={s.headerBetween} style={{ marginBottom: 16 }}>
        <div>
          <h1 className={s.title}>스토어 무통장 입금</h1>
          <p className={s.subtitle}>
            식당OS 체크아웃에서 무통장 선택 시 주문 완료 화면에 표시됩니다. 키:{' '}
            <code className={s.code}>storefront_bank_transfer</code>
          </p>
        </div>
        <Link href="/admin/commerce/orders" className={s.ghostBtn}>
          주문 처리
        </Link>
      </div>

      {toast ? (
        <div
          role="status"
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            color: '#fff',
            background: toast.variant === 'success' ? '#15803d' : '#b91c1c',
          }}
        >
          {toast.text}
        </div>
      ) : null}

      {fieldError ? (
        <div className={s.panel} style={{ borderColor: 'var(--ds-border-danger, #fecaca)', marginBottom: 12 }}>
          <p style={{ margin: 0, color: 'var(--ds-text-danger, #b91c1c)', fontSize: 14 }}>{fieldError}</p>
        </div>
      ) : null}

      <form className={s.panel} onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>은행명</span>
          <input
            className={s.input}
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            autoComplete="off"
            disabled={pending}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>계좌번호</span>
          <input
            className={s.input}
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            autoComplete="off"
            disabled={pending}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>예금주</span>
          <input
            className={s.input}
            value={accountHolder}
            onChange={(e) => setAccountHolder(e.target.value)}
            autoComplete="off"
            disabled={pending}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>입금 안내 문구</span>
          <textarea
            className={s.input}
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            rows={4}
            disabled={pending}
            style={{ minHeight: 96, resize: 'vertical' }}
          />
        </label>
        <p className={s.cellMutedSm} style={{ margin: 0 }}>
          은행명·계좌번호·예금주를 모두 비우면 저장 시 식당 화면에 &quot;계좌 정보 준비 중&quot; 안내만 표시됩니다. 셋 중 일부만
          입력할 수 없습니다.
        </p>
        <div className={s.actionsRow}>
          <button type="submit" className={s.primaryBtn} disabled={pending}>
            {pending ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </div>
  )
}
