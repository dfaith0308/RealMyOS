'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createContactLog } from '@/actions/contact'
import { executeMessage, updateScheduleStatus, type ExecCenterTarget, type SalesScript } from '@/actions/sales'

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

export default function SalesExecClient(props: { top: ExecCenterTarget[]; scripts: SalesScript[] }) {
  const router = useRouter()
  const [isPending, startTr] = useTransition()

  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<{ target: ExecCenterTarget; action: 'call' | 'message' | 'visit' } | null>(null)

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
          const execRes = await executeMessage({
            customer_id: t.customer_id,
            script_id: script.id,
            content: script.content.replace(/\{\{customer_name\}\}/g, t.customer_name),
            channel: 'clipboard',
            contact_method: 'message',
          })
          if (!execRes.success) {
            alert(execRes.error ?? '실행 실패')
            return
          }
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

        // 스케줄 완료 처리 (있을 때만)
        if (t.schedule_id) {
          await updateScheduleStatus(t.schedule_id, 'done')
        }

        setOpen(false)
        setPicked(null)
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
    </main>
  )
}

