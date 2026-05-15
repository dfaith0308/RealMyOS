'use client'

import { useState, useTransition } from 'react'
import { saveAligoSettings, sendAligoTest } from '@/actions/message'

export default function AligoSettingsForm(props: {
  initial: { aligo_user_id?: string; aligo_api_key?: string; aligo_sender?: string }
}) {
  const [isPending, startTr] = useTransition()
  const [userId, setUserId] = useState(props.initial.aligo_user_id ?? '')
  const [apiKey, setApiKey] = useState(props.initial.aligo_api_key ?? '')
  const [sender, setSender] = useState(props.initial.aligo_sender ?? '')
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'err'; msg?: string }>({ kind: 'idle' })

  function save() {
    setStatus({ kind: 'idle' })
    startTr(async () => {
      const res = await saveAligoSettings({
        aligo_user_id: userId,
        aligo_api_key: apiKey,
        aligo_sender: sender,
      })
      if (res.success) setStatus({ kind: 'ok', msg: '저장되었습니다.' })
      else setStatus({ kind: 'err', msg: res.error ?? '저장 실패' })
    })
  }

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
      <div style={sec.title}>영업 채널 설정 — 알리고(SMS)</div>
      <div style={sec.body}>
        {status.kind === 'err' && <div style={s.err}>{status.msg}</div>}
        {status.kind === 'ok' && <div style={s.ok}>✓ {status.msg}</div>}

        <Field label="알리고 사용자 ID" value={userId} onChange={setUserId} placeholder="예: my_aligo_id" />
        <Field label="알리고 API Key" value={apiKey} onChange={setApiKey} placeholder="예: xxxxxxxxxx" />
        <Field label="발신번호" value={sender} onChange={setSender} placeholder="예: 01012345678" />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 16px' }}>
          <button
            type="button"
            onClick={testSend}
            disabled={isPending}
            style={isPending ? s.btnOff : s.btnGhost}
          >
            테스트 발송
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            style={isPending ? s.btnOff : s.btn}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

function Field(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div style={f.row}>
      <div style={f.labelCol}>
        <span style={f.label}>{props.label}</span>
        <span style={f.hint}>settings 테이블에 저장됩니다. API Key는 클라이언트에 노출되지 않습니다.</span>
      </div>
      <div style={{ flexShrink: 0, width: 220 }}>
        <input
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          style={f.input}
        />
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  err: { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '14px 16px 0' },
  ok: { background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '14px 16px 0' },
  btn: { padding: '10px 18px', background: '#111827', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer' },
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
  hint: { fontSize: 11, color: '#9ca3af' },
  input: { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' },
}

