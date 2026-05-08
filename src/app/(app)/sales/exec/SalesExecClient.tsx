'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createContactLog } from '@/actions/contact'
import { updateScheduleStatus, type ExecCenterTarget, type SalesScript } from '@/actions/sales'
import { sendAligo } from '@/actions/message'
import { smsByteLength } from '@/lib/sms-byte-length'

function kstDateOnly(iso: string | null) {
  if (!iso) return '-'
  try { return iso.slice(0, 10) } catch { return '-' }
}

const ACTION_LABEL: Record<string, string> = {
  call: '전화',
  message: '문자',
  visit: '방문',
}

function ScriptPickerModal(props: {
  open: boolean
  title: string
  scripts: SalesScript[]
  onPick: (s: SalesScript) => void
  onClose: () => void
}) {
  if (!props.open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 250 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 18, width: 560, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 900 }}>{props.title}</div>
          <button onClick={props.onClose} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>

        {props.scripts.length === 0 ? (
          <div style={{ padding: '18px 0', color: '#9ca3af', fontSize: 13 }}>
            사용 가능한 스크립트가 없습니다. (sales_scripts)
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {props.scripts.map((s) => (
              <button
                key={s.id}
                onClick={() => props.onPick(s)}
                style={{
                  textAlign: 'left',
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 12,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#111827' }}>{s.title}</div>
                  {s.is_default && (
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#0f766e' }}>DEFAULT</div>
                  )}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {s.content}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SendConfirmModal(props: {
  open: boolean
  receiver: string
  content: string
  byteLen: number
  smsType: 'SMS' | 'LMS'
  safeOnlySms: boolean
  onConfirm: () => void
  onClose: () => void
  isPending: boolean
}) {
  if (!props.open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 260 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 18, width: 520, maxWidth: '95vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 900 }}>발송 확인</div>
          <button onClick={props.onClose} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>

        <div style={{ marginTop: 12, fontSize: 13, color: '#111827', fontWeight: 800 }}>
          수신번호: {props.receiver}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
          길이: {props.byteLen} bytes · 분류: {props.smsType}{props.safeOnlySms ? ' (안심번호: SMS만 허용)' : ''}
        </div>

        <div style={{ marginTop: 12, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5 }}>
          {props.content}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            onClick={props.onClose}
            disabled={props.isPending}
            style={{ padding: '10px 14px', background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
          >
            취소
          </button>
          <button
            onClick={props.onConfirm}
            disabled={props.isPending}
            style={{ padding: '10px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 900, cursor: 'pointer' }}
          >
            {props.isPending ? '발송 중…' : '발송'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SalesExecClient(props: { top: ExecCenterTarget[]; scripts: SalesScript[] }) {
  const router = useRouter()
  const [isPending, startTr] = useTransition()

  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<{ target: ExecCenterTarget; action: 'call' | 'message' | 'visit' } | null>(null)
  const [confirm, setConfirm] = useState<{
    target: ExecCenterTarget
    script: SalesScript
    receiver: string
    content: string
    byteLen: number
    smsType: 'SMS' | 'LMS'
    safeOnlySms: boolean
  } | null>(null)

  const scriptsByType = useMemo(() => {
    const map = new Map<'call' | 'message' | 'visit', SalesScript[]>()
    map.set('call', [])
    map.set('message', [])
    map.set('visit', [])
    for (const s of props.scripts) {
      map.get(s.type)?.push(s)
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    }
    return map
  }, [props.scripts])

  function openPicker(t: ExecCenterTarget, action: 'call' | 'message' | 'visit') {
    setPicked({ target: t, action })
    setOpen(true)
  }

  async function executeWithScript(script: SalesScript) {
    const cur = picked
    if (!cur) return
    const t = cur.target
    const action = cur.action

    startTr(async () => {
      try {
        // 자동 발송 금지: message는 clipboard 기록만
        if (action === 'message') {
          const receiver = t.phone ?? ''
          if (!receiver.trim()) {
            alert('수신번호가 없습니다.')
            return
          }
          const content = script.content.replace(/\{\{customer_name\}\}/g, t.customer_name)
          const byteLen = smsByteLength(content)
          const smsType: 'SMS' | 'LMS' = byteLen <= 90 ? 'SMS' : 'LMS'
          const safeOnlySms = receiver.replace(/[^0-9]/g, '').startsWith('050')
          setConfirm({ target: t, script, receiver, content, byteLen, smsType, safeOnlySms })
          setOpen(false)
          return
        } else {
          const logRes = await createContactLog({
            customer_id: t.customer_id,
            contact_method: action,
            memo: `[실행센터] ${ACTION_LABEL[action]} · ${script.title}\n\n${script.content}`,
            next_action_date: undefined,
            next_action_type: undefined,
          })
          if (!logRes.success) {
            alert(logRes.error ?? '이력 저장 실패')
            return
          }
        }

        // call/visit는 즉시 완료 처리
        if (t.schedule_id) await updateScheduleStatus(t.schedule_id, 'done')
        setOpen(false); setPicked(null)
        router.refresh()
      } finally {
        // no-op
      }
    })
  }

  const top = props.top ?? []

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '20px 18px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827' }}>실행센터</h1>
          <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
            지금 당장 해야 할 것을 즉시 실행합니다. (자동 발송 금지 · 수동 실행만)
          </div>
        </div>
        <Link href="/sales/schedule" style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none', fontWeight: 800 }}>
          영업스케쥴 보기 →
        </Link>
      </div>

      <div style={{ marginTop: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr .8fr .8fr 1.2fr', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          {['거래처', '점수', '추천 행동', '마지막 연락일', ''].map((h) => (
            <div key={h} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 900, color: '#6b7280' }}>{h}</div>
          ))}
        </div>

        {top.length === 0 ? (
          <div style={{ padding: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#111827' }}>아직 연락이 필요한 거래처가 없어요</div>
            <div style={{ marginTop: 8 }}>
              <Link href="/orders" style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none', fontWeight: 800 }}>
                발주 현황 보기 →
              </Link>
            </div>
          </div>
        ) : (
          top.map((t) => (
            <div key={t.customer_id} style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr .8fr .8fr 1.2fr', borderBottom: '1px solid #f3f4f6', alignItems: 'center' }}>
              <div style={{ padding: '12px' }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#111827' }}>{t.customer_name}</div>
                <div style={{ marginTop: 3, fontSize: 12, color: '#9ca3af' }}>
                  주문공백 {t.days_since_last_order}일 · 미연락 {t.days_since_last_contact ?? '-'}일
                </div>
              </div>
              <div style={{ padding: '12px', fontSize: 13, fontWeight: 900, color: '#111827' }}>
                {t.score}
              </div>
              <div style={{ padding: '12px', fontSize: 12, fontWeight: 900, color: '#111827' }}>
                {ACTION_LABEL[t.recommended_action]}
              </div>
              <div style={{ padding: '12px', fontSize: 12, color: '#6b7280' }}>
                {kstDateOnly(t.last_contacted_at)}
              </div>
              <div style={{ padding: '12px', display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  onClick={() => openPicker(t, 'call')}
                  disabled={isPending}
                  style={{ padding: '7px 10px', background: '#111827', color: '#fff', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 900, cursor: 'pointer' }}
                >
                  📞 전화
                </button>
                <button
                  onClick={() => openPicker(t, 'message')}
                  disabled={isPending}
                  style={{ padding: '7px 10px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 900, cursor: 'pointer' }}
                >
                  💬 문자
                </button>
                <Link
                  href={`/orders/new?customer_id=${encodeURIComponent(t.customer_id)}`}
                  style={{ padding: '7px 10px', background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 12, fontWeight: 900, textDecoration: 'none' }}
                >
                  🧾 주문작성
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      <ScriptPickerModal
        open={open}
        title={picked ? `스크립트 선택 — ${picked.target.customer_name} (${ACTION_LABEL[picked.action]})` : '스크립트 선택'}
        scripts={picked ? (scriptsByType.get(picked.action) ?? []) : []}
        onPick={executeWithScript}
        onClose={() => { setOpen(false); setPicked(null) }}
      />

      <SendConfirmModal
        open={!!confirm}
        receiver={confirm?.receiver ?? ''}
        content={confirm?.content ?? ''}
        byteLen={confirm?.byteLen ?? 0}
        smsType={confirm?.smsType ?? 'SMS'}
        safeOnlySms={confirm?.safeOnlySms ?? false}
        isPending={isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm
          if (!c) return
          startTr(async () => {
            const res = await sendAligo({
              receiver: c.receiver,
              msg: c.content,
              customer_id: c.target.customer_id,
            })
            if (res.success) {
              if (c.target.schedule_id) await updateScheduleStatus(c.target.schedule_id, 'done')
              alert('문자 발송 완료')
              setConfirm(null)
              setPicked(null)
              router.refresh()
            } else {
              alert(`발송 실패: ${res.error ?? 'UNKNOWN'}`)
            }
          })
        }}
      />
    </main>
  )
}

