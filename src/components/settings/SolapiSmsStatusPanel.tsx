'use client'

import { useState, useTransition } from 'react'
import { sendAligoTest } from '@/actions/message'

export default function SolapiSmsStatusPanel(props: {
  configured: boolean
  hasSender: boolean
  senderMasked: string | null
}) {
  const [isPending, startTr] = useTransition()
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'err'; msg?: string }>({ kind: 'idle' })

  function testSend() {
    setStatus({ kind: 'idle' })
    startTr(async () => {
      const res = await sendAligoTest()
      if (res.success) setStatus({ kind: 'ok', msg: '테스트 발송 성공' })
      else setStatus({ kind: 'err', msg: res.error ?? '테스트 발송 실패' })
    })
  }

  return (
    <div style={sec.wrap}>
      <div style={sec.title}>영업 채널 설정 — 솔라피(SMS)</div>
      <div style={sec.body}>
        {status.kind === 'err' && <div style={s.err}>{status.msg}</div>}
        {status.kind === 'ok' && <div style={s.ok}>✓ {status.msg}</div>}

        <div style={f.row}>
          <div style={f.labelCol}>
            <span style={f.label}>연동 방식</span>
            <span style={f.hint}>
              API Key / Secret / 발신번호는 서버 환경변수로 관리합니다.
              (SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER)
            </span>
          </div>
          <div style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: props.configured ? '#15803D' : '#DC2626' }}>
            {props.configured ? '구성됨' : '미구성'}
          </div>
        </div>

        <div style={f.row}>
          <div style={f.labelCol}>
            <span style={f.label}>발신번호</span>
            <span style={f.hint}>SOLAPI_SENDER (사전 등록된 발신번호)</span>
          </div>
          <div style={{ flexShrink: 0, fontSize: 13, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
            {props.senderMasked ?? '—'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 16px' }}>
          <button
            type="button"
            onClick={testSend}
            disabled={isPending || !props.configured}
            style={isPending || !props.configured ? s.btnOff : s.btnGhost}
          >
            테스트 발송
          </button>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  err: { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '14px 16px 0' },
  ok: { background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '14px 16px 0' },
  btnGhost: { padding: '10px 18px', background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer' },
  btnOff: { padding: '10px 18px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'not-allowed' },
}

const sec: Record<string, React.CSSProperties> = {
  wrap: { border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' },
  title: { padding: '10px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 12, fontWeight: 600, color: '#374151', letterSpacing: '0.04em' },
  body: { display: 'flex', flexDirection: 'column' },
}

const f: Record<string, React.CSSProperties> = {
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #f3f4f6', gap: 16 },
  labelCol: { display: 'flex', flexDirection: 'column', gap: 3, flex: 1 },
  label: { fontSize: 13, fontWeight: 600, color: '#111827' },
  hint: { fontSize: 11, color: '#9ca3af', lineHeight: 1.4 },
}
