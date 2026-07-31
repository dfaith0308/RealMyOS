'use client'

import { useState, useTransition } from 'react'
import {
  previewPushBroadcast,
  sendPushToAll,
  sendPushToTenant,
  type PushBroadcastPreview,
} from '@/actions/admin/push'

type TenantOption = { id: string; name: string; count: number }

/**
 * 전체 발송 UI는 확인 모달 + 서버 confirmed/confirm_phrase 게이트가 필요합니다.
 * ENABLE_BROADCAST_UI=false 이면 모드 선택에서 「전체 발송」을 숨깁니다.
 * (게이트가 준비됐으므로 true — 모달 없이는 서버가 거부)
 */
const ENABLE_BROADCAST_UI = true

export default function PushSendClient({ tenants }: { tenants: TenantOption[] }) {
  const [mode, setMode] = useState<'all' | 'single'>('single')
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('/')
  const [result, setResult] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [preview, setPreview] = useState<PushBroadcastPreview | null>(null)
  const [confirmPhrase, setConfirmPhrase] = useState('')
  const [previewError, setPreviewError] = useState<string | null>(null)

  function handleSend() {
    if (!title.trim() || !body.trim()) return

    if (mode === 'all') {
      setPreviewError(null)
      setConfirmPhrase('')
      setPreview(null)
      start(async () => {
        const res = await previewPushBroadcast()
        if (!res.success) {
          setPreviewError(res.error)
          setConfirmOpen(true)
          return
        }
        setPreview(res.data)
        setConfirmOpen(true)
      })
      return
    }

    if (!tenantId.trim()) return
    start(async () => {
      const res = await sendPushToTenant({ tenant_id: tenantId, title, body, url })
      setResult(res.success ? `✅ 발송 완료 (${res.sent}개 기기)` : `❌ 실패: ${res.error}`)
    })
  }

  function handleConfirmBroadcast() {
    if (!preview) return
    start(async () => {
      const res = await sendPushToAll({
        title,
        body,
        url,
        confirmed: true,
        confirm_phrase: confirmPhrase,
      })
      setConfirmOpen(false)
      setConfirmPhrase('')
      setResult(res.success ? `✅ 전체 발송 완료 (${res.total}개 기기)` : `❌ 실패: ${res.error}`)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 24px' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>발송 대상</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(
            [
              ...(ENABLE_BROADCAST_UI ? [{ value: 'all' as const, label: '전체 발송' }] : []),
              { value: 'single' as const, label: '특정 식당' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: `1px solid ${mode === opt.value ? '#1f5d3a' : '#e5e7eb'}`,
                background: mode === opt.value ? '#1f5d3a' : '#fff',
                color: mode === opt.value ? '#fff' : '#374151',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {!ENABLE_BROADCAST_UI ? (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: '#b45309', background: '#fffbeb', padding: '10px 12px', borderRadius: 8 }}>
            전체 발송은 안전장치 배포 전까지 비활성화되어 있습니다. 특정 식당만 선택하세요.
          </p>
        ) : null}
        {mode === 'all' ? (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: '#b45309' }}>
            전체 발송은 확인 모달에서 대상 목록·확인 문구 입력 후에만 실행됩니다.
          </p>
        ) : (
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            style={{
              marginTop: 12,
              width: '100%',
              padding: '10px 14px',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 13,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              background: '#fff',
            }}
          >
            {tenants.length === 0 ? <option value="">구독 식당 없음</option> : null}
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.count}기기) — {t.id.slice(0, 8)}…
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 24px' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>알림 내용</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목 (예: 식식이 공지)"
            style={{
              padding: '10px 14px',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 13,
              fontFamily: 'inherit',
            }}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="내용 (예: 새로운 식자재가 등록됐습니다)"
            rows={3}
            style={{
              padding: '10px 14px',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 13,
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="클릭 시 이동 URL (예: /buy)"
            style={{
              padding: '10px 14px',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 13,
              fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={
          pending ||
          !title.trim() ||
          !body.trim() ||
          (mode === 'single' && !tenantId.trim())
        }
        style={{
          padding: '14px',
          background: pending ? '#9ca3af' : mode === 'all' ? '#b45309' : '#1f5d3a',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: 15,
          fontWeight: 700,
          cursor: pending ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {pending ? '처리 중...' : mode === 'all' ? '전체 발송 대상 확인…' : '발송'}
      </button>

      {result ? (
        <p
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: result.startsWith('✅') ? '#1f5d3a' : '#dc2626',
            margin: 0,
          }}
        >
          {result}
        </p>
      ) : null}

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              background: '#fff',
              borderRadius: 14,
              padding: '22px 22px 18px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: '#111827' }}>
              전체 발송 확인
            </h2>
            {previewError ? (
              <p style={{ color: '#dc2626', fontSize: 13 }}>{previewError}</p>
            ) : preview ? (
              <>
                <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
                  <strong style={{ color: '#b45309' }}>
                    {preview.total_tenants}개 테넌트, {preview.total_devices}개 기기
                  </strong>
                  에 발송됩니다. 실사용 식당이 포함될 수 있습니다.
                </p>
                <ul
                  style={{
                    margin: '0 0 14px',
                    padding: '10px 12px 10px 28px',
                    background: '#f9fafb',
                    borderRadius: 8,
                    fontSize: 13,
                    color: '#1f2937',
                    maxHeight: 180,
                    overflow: 'auto',
                  }}
                >
                  {preview.tenants.map((t) => (
                    <li key={t.tenant_id} style={{ marginBottom: 4 }}>
                      {t.name} — {t.devices}기기
                    </li>
                  ))}
                </ul>
                <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                  확인을 위해 <code>전체 발송 확인</code> 을 입력하세요
                </label>
                <input
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                  placeholder="전체 발송 확인"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    fontSize: 13,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    marginBottom: 14,
                  }}
                />
              </>
            ) : (
              <p style={{ fontSize: 13, color: '#6b7280' }}>대상 불러오는 중…</p>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setConfirmOpen(false)
                  setConfirmPhrase('')
                }}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                취소
              </button>
              <button
                type="button"
                disabled={
                  pending ||
                  !preview ||
                  preview.total_devices === 0 ||
                  confirmPhrase.trim() !== '전체 발송 확인'
                }
                onClick={handleConfirmBroadcast}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background:
                    pending || confirmPhrase.trim() !== '전체 발송 확인' ? '#d1d5db' : '#b45309',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: pending ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {pending ? '발송 중…' : '정말 전체 발송'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
