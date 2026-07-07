'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createContactLog } from '@/actions/contact'
import { updateScheduleStatus, type ExecCenterTarget, type SalesScript } from '@/actions/sales'
import SmsModal, { type SmsCustomer } from '@/components/sms/SmsModal'

function kstDateOnly(iso: string | null) {
  if (!iso) return '-'
  try { return iso.slice(0, 10) } catch { return '-' }
}

const ACTION_LABEL: Record<string, string> = {
  call: '전화',
  message: '문자',
  visit: '방문',
}

interface SafeCustomer {
  id: string
  name: string
  phone: string
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
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, width: 560, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 900 }}>{props.title}</div>
          <button onClick={props.onClose} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-hint)' }}>✕</button>
        </div>

        {props.scripts.length === 0 ? (
          <div style={{ padding: '18px 0', color: 'var(--text-hint)', fontSize: 13 }}>
            사용 가능한 스크립트가 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {props.scripts.map((s) => (
              <button
                key={s.id}
                onClick={() => props.onPick(s)}
                style={{
                  textAlign: 'left',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
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
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
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

export default function SalesExecClient(props: {
  top: ExecCenterTarget[]
  scripts: SalesScript[]
  safeCustomers: SafeCustomer[]
}) {
  const router = useRouter()
  const [isPending, startTr] = useTransition()
  const [tab, setTab] = useState<'top' | 'safe'>('top')

  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<{ target: ExecCenterTarget; action: 'call' | 'visit' } | null>(null)
  const [smsTargets, setSmsTargets] = useState<SmsCustomer[] | null>(null)
  const [selectedSafe, setSelectedSafe] = useState<Set<string>>(new Set())

  const callScripts = useMemo(() => {
    return props.scripts
      .filter((s) => s.type === 'call')
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }, [props.scripts])

  const safeWithPhone = useMemo(
    () => props.safeCustomers.filter((c) => c.phone.trim()),
    [props.safeCustomers],
  )

  const allSafeSelected = safeWithPhone.length > 0 && safeWithPhone.every((c) => selectedSafe.has(c.id))

  function openPicker(t: ExecCenterTarget, action: 'call' | 'visit') {
    setPicked({ target: t, action })
    setOpen(true)
  }

  function openSms(targets: SmsCustomer[]) {
    if (targets.length === 0) {
      alert('수신번호가 없습니다.')
      return
    }
    setSmsTargets(targets)
  }

  function toggleSafeOne(id: string) {
    setSelectedSafe((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllSafe() {
    if (allSafeSelected) setSelectedSafe(new Set())
    else setSelectedSafe(new Set(safeWithPhone.map((c) => c.id)))
  }

  async function executeWithScript(script: SalesScript) {
    const cur = picked
    if (!cur) return
    const t = cur.target
    const action = cur.action

    startTr(async () => {
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

      if (t.schedule_id) await updateScheduleStatus(t.schedule_id, 'done')
      setOpen(false)
      setPicked(null)
      router.refresh()
    })
  }

  const top = props.top ?? []

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '20px 18px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827' }}>실행센터</h1>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
            지금 당장 해야 할 것을 즉시 실행합니다.
          </div>
        </div>
        <Link href="/sales/schedule" style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none', fontWeight: 800 }}>
          영업스케쥴 보기 →
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setTab('top')}
          style={{
            padding: '8px 16px',
            borderRadius: 20,
            border: '1px solid var(--border)',
            background: tab === 'top' ? '#111827' : 'var(--surface-2)',
            color: tab === 'top' ? '#fff' : '#374151',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          우선 연락 TOP {top.length}
        </button>
        <button
          type="button"
          onClick={() => setTab('safe')}
          style={{
            padding: '8px 16px',
            borderRadius: 20,
            border: '1px solid var(--border)',
            background: tab === 'safe' ? '#0f766e' : 'var(--surface-2)',
            color: tab === 'safe' ? '#fff' : '#374151',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          안심번호 ({safeWithPhone.length})
        </button>
        {tab === 'safe' && selectedSafe.size > 0 && (
          <button
            type="button"
            onClick={() => {
              const targets = safeWithPhone
                .filter((c) => selectedSafe.has(c.id))
                .map((c) => ({ id: c.id, name: c.name, phone: c.phone }))
              openSms(targets)
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#0f766e',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            일괄 발송 ({selectedSafe.size}명)
          </button>
        )}
      </div>

      {tab === 'top' && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr .8fr .8fr 1.2fr', background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}>
            {['거래처', '점수', '추천 행동', '마지막 연락일', ''].map((h) => (
              <div key={h} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 900, color: 'var(--text-muted)' }}>{h}</div>
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
                <div key={t.customer_id} style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr .8fr .8fr 1.2fr', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
                <div style={{ padding: '12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#111827' }}>{t.customer_name}</div>
                  <div style={{ marginTop: 3, fontSize: 12, color: 'var(--text-hint)' }}>
                    주문공백 {t.days_since_last_order}일 · 미연락 {t.days_since_last_contact ?? '-'}일
                  </div>
                </div>
                <div style={{ padding: '12px', fontSize: 13, fontWeight: 900, color: '#111827' }}>
                  {t.score}
                </div>
                <div style={{ padding: '12px', fontSize: 12, fontWeight: 900, color: '#111827' }}>
                  {ACTION_LABEL[t.recommended_action]}
                </div>
                <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-muted)' }}>
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
                    onClick={() => openSms([{ id: t.customer_id, name: t.customer_name, phone: t.phone ?? '' }])}
                    disabled={isPending || !(t.phone ?? '').trim()}
                    style={{ padding: '7px 10px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 900, cursor: 'pointer' }}
                  >
                    💬 문자
                  </button>
                  <Link
                    href={`/orders/new?customer_id=${encodeURIComponent(t.customer_id)}`}
                    style={{ padding: '7px 10px', background: 'var(--surface-2)', color: '#111827', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, fontWeight: 900, textDecoration: 'none' }}
                  >
                    🧾 주문작성
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'safe' && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 1.4fr 1fr 1fr', background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ padding: '10px 12px' }}>
              <input
                type="checkbox"
                checked={allSafeSelected}
                onChange={toggleAllSafe}
                disabled={safeWithPhone.length === 0}
                aria-label="전체 선택"
              />
            </div>
            {['거래처', '연락처', ''].map((h) => (
              <div key={h} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 900, color: 'var(--text-muted)' }}>{h}</div>
            ))}
          </div>

          {safeWithPhone.length === 0 ? (
            <div style={{ padding: 18, textAlign: 'center', fontSize: 13, color: 'var(--text-hint)' }}>
              안심번호(050) 거래처가 없습니다.
            </div>
          ) : (
            safeWithPhone.map((c) => (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '40px 1.4fr 1fr 1fr', borderBottom: '0.5px solid var(--border)', alignItems: 'center' }}>
                <div style={{ padding: '12px' }}>
                  <input
                    type="checkbox"
                    checked={selectedSafe.has(c.id)}
                    onChange={() => toggleSafeOne(c.id)}
                    aria-label={`${c.name} 선택`}
                  />
                </div>
                <div style={{ padding: '12px', fontSize: 13, fontWeight: 700, color: '#111827' }}>{c.name}</div>
                <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-muted)' }}>{c.phone}</div>
                <div style={{ padding: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => openSms([{ id: c.id, name: c.name, phone: c.phone }])}
                    style={{ padding: '7px 10px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 900, cursor: 'pointer' }}
                  >
                    💬 문자
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <ScriptPickerModal
        open={open}
        title={picked ? `스크립트 선택 — ${picked.target.customer_name} (${ACTION_LABEL[picked.action]})` : '스크립트 선택'}
        scripts={callScripts}
        onPick={executeWithScript}
        onClose={() => { setOpen(false); setPicked(null) }}
      />

      {smsTargets && (
        <SmsModal
          customers={smsTargets}
          memoPrefix="실행센터"
          onClose={() => setSmsTargets(null)}
          onDone={() => {
            setSmsTargets(null)
            setSelectedSafe(new Set())
            router.refresh()
          }}
        />
      )}
    </main>
  )
}
