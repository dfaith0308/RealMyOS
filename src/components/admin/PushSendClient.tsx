'use client'

import { useState, useTransition } from 'react'
import { sendPushToAll, sendPushToTenant } from '@/actions/admin/push'

export default function PushSendClient() {
  const [mode, setMode] = useState<'all' | 'single'>('all')
  const [tenantId, setTenantId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('/')
  const [result, setResult] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function handleSend() {
    if (!title.trim() || !body.trim()) return
    start(async () => {
      if (mode === 'all') {
        const res = await sendPushToAll({ title, body, url })
        setResult(res.success ? `✅ 전체 발송 완료 (${res.total}개 기기)` : `❌ 실패: ${res.error}`)
      } else {
        if (!tenantId.trim()) return
        const res = await sendPushToTenant({ tenant_id: tenantId, title, body, url })
        setResult(res.success ? `✅ 발송 완료 (${res.sent}개 기기)` : `❌ 실패: ${res.error}`)
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 24px' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>발송 대상</p>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { value: 'all', label: '전체 발송' },
            { value: 'single', label: '특정 식당' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value as 'all' | 'single')}
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
        {mode === 'single' ? (
          <input
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="테넌트 ID 입력"
            style={{
              marginTop: 12,
              width: '100%',
              padding: '10px 14px',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 13,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        ) : null}
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
        disabled={pending || !title.trim() || !body.trim()}
        style={{
          padding: '14px',
          background: pending ? '#9ca3af' : '#1f5d3a',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: 15,
          fontWeight: 700,
          cursor: pending ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {pending ? '발송 중...' : mode === 'all' ? '전체 발송' : '발송'}
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
    </div>
  )
}
