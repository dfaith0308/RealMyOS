'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { getSalesScripts, type SalesScript } from '@/actions/sales'
import { sendAligo } from '@/actions/message'
import { createContactLog } from '@/actions/contact'
import { smsByteLength } from '@/lib/sms-byte-length'
import { isSafeNumber } from '@/lib/is-safe-number'

interface Props {
  customerId: string
  customerName: string
  phone: string
  onClose: () => void
  onSent: () => void
}

function substituteCustomerName(content: string, customerName: string): string {
  return content.replace(/\{\{customer_name\}\}/g, customerName)
}

export default function SafeNumberSmsModal({
  customerId,
  customerName,
  phone,
  onClose,
  onSent,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [scripts, setScripts] = useState<SalesScript[]>([])
  const [loadingScripts, setLoadingScripts] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const previewContent = useMemo(
    () => (selectedScript ? substituteCustomerName(selectedScript.content, customerName) : ''),
    [selectedScript, customerName],
  )

  const byteLen = smsByteLength(previewContent)
  const smsType: 'SMS' | 'LMS' = byteLen <= 90 ? 'SMS' : 'LMS'
  const safeOnlySms = isSafeNumber(phone)
  const lmsBlocked = safeOnlySms && smsType === 'LMS'

  function handleSend() {
    if (!selectedScript) {
      setError('발송할 스크립트를 선택해주세요.')
      return
    }
    if (lmsBlocked) {
      setError('안심번호는 단문(SMS, 90바이트 이하)만 발송할 수 있습니다.')
      return
    }

    setError(null)
    startTransition(async () => {
      const msg = previewContent.trim()
      if (!msg) {
        setError('메시지 내용이 비어 있습니다.')
        return
      }

      const sendRes = await sendAligo({
        receiver: phone,
        msg,
        customer_id: customerId,
      })

      const messageLogId = sendRes.data?.message_log_id
      if (!messageLogId) {
        setError(sendRes.error ?? '발송 로그 저장에 실패했습니다.')
        return
      }

      const contactRes = await createContactLog({
        customer_id: customerId,
        contact_method: 'message',
        methods: ['message'],
        memo: `[안심번호 등록] ${selectedScript.title}\n\n${msg}`,
        message_log_id: messageLogId,
        send_status: sendRes.success ? 'sent' : 'failed',
      })

      if (!contactRes.success) {
        setError(contactRes.error ?? '영업 이력 저장에 실패했습니다.')
        return
      }

      if (!sendRes.success) {
        setError(sendRes.error ?? '문자 발송에 실패했습니다. 이력은 저장되었습니다.')
        return
      }

      onSent()
    })
  }

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
      onClick={onClose}
      role="presentation"
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          padding: '22px 20px',
          width: '100%',
          maxWidth: 520,
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
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
              안심번호 감지 — 문자를 보내시겠습니까?
            </h2>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
              {customerName} · {phone}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
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
                    cursor: 'pointer',
                    background: selectedId === s.id ? '#f9fafb' : '#fff',
                  }}
                >
                  <input
                    type="radio"
                    name="safe-sms-script"
                    checked={selectedId === s.id}
                    onChange={() => setSelectedId(s.id)}
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
                      {substituteCustomerName(s.content, customerName)}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {selectedScript && (
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
                <div style={{ marginTop: 6, fontSize: 11, color: lmsBlocked ? '#DC2626' : '#6b7280' }}>
                  {byteLen} bytes · {smsType}
                  {safeOnlySms ? ' (안심번호: SMS만 허용)' : ''}
                  {lmsBlocked ? ' — 내용이 너무 깁니다. 스크립트를 줄여주세요.' : ''}
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
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
            나중에
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={isPending || loadingScripts || scripts.length === 0 || lmsBlocked}
            style={{
              padding: '10px 18px',
              border: 'none',
              borderRadius: 8,
              background: isPending || lmsBlocked ? '#9ca3af' : '#0f766e',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: isPending || lmsBlocked ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {isPending ? '발송 중...' : '발송'}
          </button>
        </div>
      </div>
    </div>
  )
}
