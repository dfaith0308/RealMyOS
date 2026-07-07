'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSalesScripts, type SalesScript } from '@/actions/sales'
import { sendAligo } from '@/actions/message'
import { createContactLog } from '@/actions/contact'
import { smsByteLength } from '@/lib/sms-byte-length'
import { isSafeNumber } from '@/lib/is-safe-number'

export interface SmsCustomer {
  id: string
  name: string
  phone: string
}

interface Props {
  customers: SmsCustomer[]
  onClose: () => void
  onDone?: (result: { success: number; failed: number }) => void
  title?: string
  memoPrefix?: string
}

function substituteCustomerName(content: string, customerName: string): string {
  return content.replace(/\{\{customer_name\}\}/g, customerName)
}

const DAILY_LIMIT_RE = /일일 SMS 발송 한도/

export default function SmsModal({
  customers,
  onClose,
  onDone,
  title,
  memoPrefix = '문자 발송',
}: Props) {
  const isBulk = customers.length > 1
  const primary = customers[0] ?? null

  const [scripts, setScripts] = useState<SalesScript[]>([])
  const [loadingScripts, setLoadingScripts] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingScripts(true)
      const res = await getSalesScripts('message')
      if (cancelled) return
      const list = res.success ? (res.data ?? []) : []
      setScripts(list)
      if (list.length > 0) setSelectedId(list[0].id)
      if (!res.success) setError(res.error ?? '스크립트를 불러오지 못했습니다.')
      setLoadingScripts(false)
    })()
    return () => { cancelled = true }
  }, [])

  const selectedScript = useMemo(
    () => scripts.find((s) => s.id === selectedId) ?? null,
    [scripts, selectedId],
  )

  const previewName = primary?.name ?? ''
  const previewContent = useMemo(
    () => (selectedScript ? substituteCustomerName(selectedScript.content, previewName) : ''),
    [selectedScript, previewName],
  )

  const previewByteLen = smsByteLength(previewContent)
  const previewSmsType: 'SMS' | 'LMS' = previewByteLen <= 90 ? 'SMS' : 'LMS'

  async function sendOne(
    customer: SmsCustomer,
    script: SalesScript,
    msg: string,
  ): Promise<'ok' | 'fail' | 'limit'> {
    const sendRes = await sendAligo({
      receiver: customer.phone,
      msg,
      customer_id: customer.id,
    })

    if (sendRes.error && DAILY_LIMIT_RE.test(sendRes.error)) {
      return 'limit'
    }

    const messageLogId = sendRes.data?.message_log_id
    if (!messageLogId) return 'fail'

    const contactRes = await createContactLog({
      customer_id: customer.id,
      contact_method: 'message',
      methods: ['message'],
      memo: `[${memoPrefix}] ${script.title}\n\n${msg}`,
      message_log_id: messageLogId,
      send_status: sendRes.success ? 'sent' : 'failed',
    })

    if (!contactRes.success) return 'fail'
    return sendRes.success ? 'ok' : 'fail'
  }

  async function handleSend() {
    if (!selectedScript) {
      setError('발송할 스크립트를 선택해주세요.')
      return
    }
    if (customers.length === 0) {
      setError('발송 대상이 없습니다.')
      return
    }

    setError(null)
    setSending(true)
    setProgress(0)
    setResult(null)

    let success = 0
    let failed = 0

    try {
      for (let i = 0; i < customers.length; i++) {
        const customer = customers[i]
        const msg = substituteCustomerName(selectedScript.content, customer.name).trim()
        if (!msg) {
          failed++
          setProgress(i + 1)
          continue
        }

        const outcome = await sendOne(customer, selectedScript, msg)
        if (outcome === 'limit') {
          setError(`일일 SMS 발송 한도에 도달했습니다. (${success}건 성공, ${failed}건 실패 후 중단)`)
          break
        }
        if (outcome === 'ok') success++
        else failed++
        setProgress(i + 1)
      }

      const final = { success, failed }
      setResult(final)
      if (!isBulk) {
        if (success > 0) onDone?.(final)
        else if (!error) setError('문자 발송에 실패했습니다.')
      }
    } finally {
      setSending(false)
    }
  }

  function handleClose() {
    if (result && isBulk) onDone?.(result)
    onClose()
  }

  const modalTitle = title ?? (
    isBulk
      ? `문자 발송 (${customers.length}명)`
      : primary && isSafeNumber(primary.phone)
        ? '안심번호 — 문자를 보내시겠습니까?'
        : '문자 발송'
  )

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 400,
        padding: 16,
      }}
      onClick={sending ? undefined : handleClose}
      role="presentation"
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          padding: '22px 20px',
          width: '100%',
          maxWidth: 540,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>{modalTitle}</h2>
            {!isBulk && primary && (
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                {primary.name} · {primary.phone}
              </p>
            )}
            {isBulk && (
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#6b7280' }}>
                {customers.map((c) => c.name).slice(0, 5).join(', ')}
                {customers.length > 5 ? ` 외 ${customers.length - 5}명` : ''}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={sending}
            style={{ background: 'none', border: 'none', fontSize: 22, color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{
            background: '#FEF2F2',
            color: '#DC2626',
            border: '1px solid #FECACA',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
            marginBottom: 14,
          }}>
            {error}
          </div>
        )}

        {result && isBulk && (
          <div style={{
            background: '#F0FDF4',
            color: '#15803D',
            border: '1px solid #BBF7D0',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
            marginBottom: 14,
          }}>
            발송 완료 — 성공 {result.success}건 · 실패 {result.failed}건
          </div>
        )}

        {sending && isBulk && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              발송 중… {progress}/{customers.length}
            </div>
            <div style={{ height: 6, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${customers.length ? Math.round((progress / customers.length) * 100) : 0}%`,
                background: '#0f766e',
                transition: 'width 0.2s',
              }} />
            </div>
          </div>
        )}

        {loadingScripts ? (
          <p style={{ fontSize: 13, color: '#6b7280', margin: '12px 0' }}>스크립트 불러오는 중...</p>
        ) : scripts.length === 0 ? (
          <p style={{ fontSize: 13, color: '#6b7280', margin: '12px 0' }}>
            사용 가능한 문자 스크립트가 없습니다. 스크립트관리에서 message 타입 스크립트를 등록해주세요.
          </p>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>스크립트 선택</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {scripts.map((s) => (
                <label
                  key={s.id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: '10px 12px',
                    border: `2px solid ${selectedId === s.id ? '#111827' : '#e5e7eb'}`,
                    borderRadius: 10,
                    cursor: sending ? 'not-allowed' : 'pointer',
                    background: selectedId === s.id ? '#f9fafb' : '#fff',
                    opacity: sending ? 0.6 : 1,
                  }}
                >
                  <input
                    type="radio"
                    name="sms-script"
                    checked={selectedId === s.id}
                    onChange={() => setSelectedId(s.id)}
                    disabled={sending}
                    style={{ marginTop: 3 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{s.title}</div>
                    <div style={{
                      marginTop: 4,
                      fontSize: 12,
                      color: '#6b7280',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.45,
                      maxHeight: 72,
                      overflow: 'hidden',
                    }}>
                      {substituteCustomerName(s.content, previewName || '거래처명')}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {selectedScript && !isBulk && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>미리보기</div>
                <div style={{
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}>
                  {previewContent}
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
                  {previewByteLen} bytes · {previewSmsType}
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={sending}
            style={{
              padding: '10px 16px',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              background: '#fff',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {result && isBulk ? '닫기' : '취소'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || loadingScripts || scripts.length === 0}
              style={{
                padding: '10px 18px',
                border: 'none',
                borderRadius: 8,
                background: sending ? '#9ca3af' : '#0f766e',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: sending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {sending ? (isBulk ? `발송 중 (${progress}/${customers.length})` : '발송 중...') : isBulk ? `발송 (${customers.length}명)` : '발송'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
