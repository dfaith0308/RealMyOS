'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import {
  addDeliveryMessageExclusion,
  previewDeliveryMessage,
  releaseDeliveryMessageExclusion,
  resendFailedDeliveryMessages,
  runDeliveryEventsNow,
  saveDeliveryMessageSettings,
  searchTenantsForDeliveryMessages,
  sendSelectedDeliveryMessages,
  type DeliveryMessageDashboard,
  type MessageSettingsRow,
} from '@/actions/admin/delivery-messages'
import s from '../../../admin-shared.module.css'

const PLATFORM_SCOPE = '00000000-0000-0000-0000-000000000000'
const BRAND = '#1f5d3a'
const DANGER = '#b91c1c'
const MUTED = '#6b7280'

const STATUS_LABEL: Record<string, string> = {
  pending_approval: '발송 대기',
  skipped: '발송 안 함',
  sending: '발송 중(확인 필요)',
  kakao_success: '카카오 성공',
  sms_fallback_success: '카카오 실패 → 문자 성공',
  both_failed: '카카오 실패 → 문자 실패',
  failed: '전체 실패',
  test_simulated: '테스트 모드 기록',
}

const REASON_LABEL: Record<string, string> = {
  disabled: '사용 안 함',
  excluded: '제외 대상',
  already_sent: '이미 전달됨',
  sending: '발송 중',
  not_active_order: '취소·환불 주문',
}

function summaryText(sum: { requested: number; claimed: number; statuses: Record<string, number>; not_claimed: { reason: string }[]; test_mode: boolean; test_reason: string | null }) {
  const parts = Object.entries(sum.statuses).map(([k, v]) => `${STATUS_LABEL[k] ?? k} ${v}`)
  const skipped = sum.not_claimed.length ? ` · 대상 아님 ${sum.not_claimed.length}` : ''
  const test = sum.test_mode ? ` (테스트 모드: ${sum.test_reason})` : ''
  return `요청 ${sum.requested} · 처리 ${sum.claimed}${parts.length ? ' · ' + parts.join(' · ') : ''}${skipped}${test}`
}

export default function DeliveryMessagesClient({ data }: { data: DeliveryMessageDashboard }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'pending' | 'failed' | 'sent' | 'skipped' | 'test'>('all')

  function run<T>(fn: () => Promise<{ success: boolean; error?: string; data?: T }>, ok: (d: T | undefined) => string) {
    setMsg(null)
    startTransition(async () => {
      const r = await fn()
      setMsg(r.success ? { ok: true, text: ok(r.data) } : { ok: false, text: r.error ?? '실패' })
      if (r.success) {
        setSelected(new Set())
        router.refresh()
      }
    })
  }

  const rows = useMemo(
    () =>
      data.rows.filter((r) => {
        if (filter === 'pending') return r.status === 'pending_approval'
        if (filter === 'failed') return r.status === 'both_failed' || r.status === 'failed'
        if (filter === 'sent') return r.status === 'kakao_success' || r.status === 'sms_fallback_success'
        if (filter === 'skipped') return r.status === 'skipped' || (!r.eligible && r.ineligible_reason !== 'already_sent')
        if (filter === 'test') return r.status === 'test_simulated'
        return true
      }),
    [data.rows, filter],
  )

  const platform = data.settings.find((x) => x.scope_tenant_id === PLATFORM_SCOPE) ?? null
  const supplierSettings = data.settings.filter((x) => x.scope_tenant_id !== PLATFORM_SCOPE)

  return (
    <>
      {msg ? <p style={{ fontSize: 13, color: msg.ok ? BRAND : DANGER, margin: '0 0 12px' }}>{msg.text}</p> : null}

      <section className={s.kpiCard} style={{ marginBottom: 16, borderColor: data.safety.test_mode ? '#f59e0b' : undefined }}>
        <h2 className={s.kpiTitle}>발송 안전장치</h2>
        <p style={{ fontSize: 13, margin: '8px 0 0', lineHeight: 1.7 }}>
          {data.safety.test_mode ? (
            <>
              <strong style={{ color: '#b45309' }}>테스트 모드</strong> — 실제로 보내지 않고 시도만 기록합니다. 이유: {data.safety.test_reason}
            </>
          ) : (
            <strong style={{ color: BRAND }}>실제 발송 모드</strong>
          )}
          <br />
          알림톡 템플릿: {data.safety.kakao_template ? '설정됨 — 알림톡 먼저 시도' : '없음 — 문자로 바로 보냅니다'}
        </p>
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, color: MUTED, cursor: 'pointer' }}>알림톡 템플릿 심사용 원문</summary>
          <pre style={{ fontSize: 12, background: '#f7f6f2', padding: 10, borderRadius: 8, whiteSpace: 'pre-wrap' }}>{data.alimtalk_template_text}</pre>
        </details>
      </section>

      <SettingsEditor key={platform?.updated_at ?? 'new-platform'} initial={platform} scopeId={PLATFORM_SCOPE} scopeName="플랫폼 기본값" pending={pending} run={run} />
      {supplierSettings.map((st) => (
        <SettingsEditor key={st.scope_tenant_id + (st.updated_at ?? '')} initial={st} scopeId={st.scope_tenant_id} scopeName={st.scope_name} pending={pending} run={run} />
      ))}
      <SupplierScopeAdder pending={pending} run={run} existing={new Set(data.settings.map((x) => x.scope_tenant_id))} />

      <section className={s.kpiCard} style={{ margin: '16px 0' }}>
        <h2 className={s.kpiTitle}>발송 현황</h2>
        <p style={{ fontSize: 14, margin: '8px 0', lineHeight: 1.8 }}>
          전체 <strong>{data.counts.total}</strong> · 전달 <strong style={{ color: BRAND }}>{data.counts.delivered_ok}</strong> · 실패{' '}
          <strong style={{ color: DANGER }}>{data.counts.failed}</strong> · 발송 대기 <strong>{data.counts.pending}</strong> · 발송 안 함{' '}
          <strong>{data.counts.skipped}</strong> · 테스트 기록 <strong>{data.counts.test}</strong>
          {data.counts.sending ? <> · 발송 중(확인 필요) <strong style={{ color: DANGER }}>{data.counts.sending}</strong></> : null}
          {' · '}처리 전 사건 <strong>{data.counts.unprocessed_events}</strong>
        </p>
        <div className={s.actionsRow} style={{ flexWrap: 'wrap', gap: 6 }}>
          <button type="button" className={s.ghostBtn} disabled={pending} onClick={() => run(runDeliveryEventsNow, (d) => `사건 ${d?.processed ?? 0}건 처리${d?.auto_send ? ' · 자동 발송 ' + summaryText(d.auto_send) : ''}`)}>
            지금 한 번 돌려보기
          </button>
          <button
            type="button"
            className={s.primaryBtn}
            disabled={pending || selected.size === 0}
            onClick={() => {
              if (window.confirm(`선택한 ${selected.size}건을 발송할까요? 대상이 아닌 주문(이미 전달·제외·사용 안 함)은 자동으로 빠집니다.`)) {
                run(() => sendSelectedDeliveryMessages([...selected]), (d) => (d ? summaryText(d) : '완료'))
              }
            }}
          >
            선택 발송 ({selected.size})
          </button>
          <button
            type="button"
            className={s.ghostBtn}
            disabled={pending || data.counts.failed === 0}
            onClick={() => {
              if (window.confirm('실패한 주문만 골라 다시 보낼까요?')) run(resendFailedDeliveryMessages, (d) => (d ? summaryText(d) : '완료'))
            }}
          >
            실패만 재발송 ({data.counts.failed})
          </button>
        </div>
        <nav className={s.actionsRow} style={{ flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {(
            [
              ['all', '전체'],
              ['pending', '발송 대기'],
              ['failed', '실패'],
              ['sent', '전달'],
              ['skipped', '발송 안 함'],
              ['test', '테스트 기록'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className={filter === k ? s.primaryBtn : s.ghostBtn} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </nav>
      </section>

      {rows.length === 0 ? (
        <p style={{ fontSize: 14, color: MUTED }}>해당하는 주문이 없습니다</p>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr className={s.theadRow}>
                <th className={s.th} />
                <th className={s.th}>주문번호</th>
                <th className={s.th}>식당</th>
                <th className={s.th}>보내는 분(공급자)</th>
                <th className={s.th}>발송 결과</th>
                <th className={s.th}>대상 판정</th>
                <th className={s.th}>마지막 시도</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.commerce_order_id}>
                  <td className={s.td}>
                    <input
                      type="checkbox"
                      disabled={!r.eligible}
                      checked={selected.has(r.commerce_order_id)}
                      onChange={(e) =>
                        setSelected((cur) => {
                          const next = new Set(cur)
                          if (e.target.checked) next.add(r.commerce_order_id)
                          else next.delete(r.commerce_order_id)
                          return next
                        })
                      }
                    />
                  </td>
                  <td className={s.td}>{r.order_number ?? r.commerce_order_id.slice(0, 8)}</td>
                  <td className={s.td}>{r.restaurant_name ?? '—'}</td>
                  <td className={s.td}>{r.supplier_name ?? '식식이(복수·미지정)'}</td>
                  <td className={s.td}>
                    {r.status ? STATUS_LABEL[r.status] ?? r.status : '처리 전'}
                    {r.last_failure ? <div className={s.cellMutedXs} style={{ color: DANGER }}>{r.last_failure}</div> : null}
                    {r.skip_reason ? <div className={s.cellMutedXs}>{REASON_LABEL[r.skip_reason] ?? r.skip_reason}</div> : null}
                  </td>
                  <td className={s.td} style={{ color: r.eligible ? BRAND : MUTED }}>
                    {r.eligible ? `대상 (${r.send_mode === 'auto' ? '자동' : '확인 후 발송'})` : REASON_LABEL[r.ineligible_reason ?? ''] ?? r.ineligible_reason}
                  </td>
                  <td className={s.tdNowrap}>
                    {r.last_attempt_at ? new Date(r.last_attempt_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Exclusions data={data} pending={pending} run={run} />
    </>
  )
}

type RunFn = <T>(fn: () => Promise<{ success: boolean; error?: string; data?: T }>, ok: (d: T | undefined) => string) => void

function SettingsEditor({
  initial,
  scopeId,
  scopeName,
  pending,
  run,
}: {
  initial: MessageSettingsRow | null
  scopeId: string
  scopeName: string
  pending: boolean
  run: RunFn
}) {
  const [enabled, setEnabled] = useState(initial?.enabled ?? false)
  const [mode, setMode] = useState<'manual_confirm' | 'auto'>(initial?.send_mode ?? 'manual_confirm')
  const [sender, setSender] = useState(initial?.sender_display ?? '')
  const [thanks, setThanks] = useState(initial?.thank_you_message ?? '')
  const [preview, setPreview] = useState<{ text: string; violation: string | null } | null>(null)
  const [previewPending, startPreview] = useTransition()

  const input = { scope_tenant_id: scopeId, enabled, send_mode: mode, sender_display: sender, thank_you_message: thanks }

  return (
    <section className={s.kpiCard} style={{ marginBottom: 12 }}>
      <h2 className={s.kpiTitle}>
        설정 — {scopeName}
        {scopeId !== PLATFORM_SCOPE ? <span style={{ fontWeight: 400, fontSize: 12, color: MUTED }}> (이 공급자가 단독으로 보내는 주문에 기본값 대신 적용)</span> : null}
        {!initial ? <span style={{ fontWeight: 400, fontSize: 12, color: MUTED }}> — 아직 저장 전: 발송 안 함</span> : null}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        <label style={{ fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> 사용
        </label>
        <div style={{ fontSize: 13, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', gap: 6 }}>
            <input type="radio" checked={mode === 'manual_confirm'} onChange={() => setMode('manual_confirm')} /> 확인 후 발송 (기본)
          </label>
          <label style={{ display: 'inline-flex', gap: 6 }}>
            <input type="radio" checked={mode === 'auto'} onChange={() => setMode('auto')} /> 자동 발송
          </label>
        </div>
        <input className={s.input} placeholder="보내는 분 표기 (비우면 공급자 상호 또는 식식이)" maxLength={40} value={sender} onChange={(e) => setSender(e.target.value)} />
        <textarea
          className={s.input}
          style={{ minHeight: 70 }}
          placeholder="감사 메시지 (비우면 기본 문구) — 링크·전화번호·광고 문구는 저장되지 않습니다"
          maxLength={300}
          value={thanks}
          onChange={(e) => setThanks(e.target.value)}
        />
        <div className={s.actionsRow} style={{ gap: 6 }}>
          <button
            type="button"
            className={s.ghostBtn}
            disabled={previewPending}
            onClick={() =>
              startPreview(async () => {
                const r = await previewDeliveryMessage({ ...input, supplier_name: scopeId === PLATFORM_SCOPE ? null : scopeName })
                setPreview(r.success && r.data ? r.data : { text: '', violation: r.error ?? '미리보기 실패' })
              })
            }
          >
            미리보기
          </button>
          <button type="button" className={s.primaryBtn} disabled={pending} onClick={() => run(() => saveDeliveryMessageSettings(input), () => `${scopeName} 설정을 저장했습니다`)}>
            저장
          </button>
        </div>
        {preview ? (
          <div>
            {preview.violation ? <p style={{ fontSize: 12, color: DANGER, margin: '0 0 6px' }}>{preview.violation}</p> : null}
            {preview.text ? <pre style={{ fontSize: 12, background: '#f7f6f2', padding: 10, borderRadius: 8, whiteSpace: 'pre-wrap', margin: 0 }}>{preview.text}</pre> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function SupplierScopeAdder({ pending, run, existing }: { pending: boolean; run: RunFn; existing: Set<string> }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<{ id: string; name: string | null }[]>([])
  const [busy, start] = useTransition()
  return (
    <section className={s.kpiCard} style={{ marginBottom: 12 }}>
      <h2 className={s.kpiTitle}>공급자별 설정 추가</h2>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <input className={s.input} style={{ flex: '1 1 200px' }} placeholder="공급자 상호 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <button
          type="button"
          className={s.ghostBtn}
          disabled={busy || !q.trim()}
          onClick={() => start(async () => setRows((await searchTenantsForDeliveryMessages(q, 'supplier')).data?.rows ?? []))}
        >
          검색
        </button>
      </div>
      {rows.map((r) => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}>
          <span>{r.name}</span>
          {existing.has(r.id) ? (
            <span style={{ color: MUTED }}>설정 있음</span>
          ) : (
            <button
              type="button"
              className={s.ghostBtn}
              disabled={pending}
              onClick={() =>
                run(
                  () => saveDeliveryMessageSettings({ scope_tenant_id: r.id, enabled: false, send_mode: 'manual_confirm', sender_display: r.name ?? '', thank_you_message: '' }),
                  () => `${r.name} 설정을 만들었습니다 (사용 안 함 상태)`,
                )
              }
            >
              설정 만들기
            </button>
          )}
        </div>
      ))}
    </section>
  )
}

function Exclusions({ data, pending, run }: { data: DeliveryMessageDashboard; pending: boolean; run: RunFn }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<{ id: string; name: string | null }[]>([])
  const [reason, setReason] = useState('')
  const [busy, start] = useTransition()
  return (
    <section className={s.kpiCard} style={{ marginTop: 16 }}>
      <h2 className={s.kpiTitle}>제외 대상 식당 ({data.exclusions.length})</h2>
      {data.exclusions.map((x) => (
        <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6, gap: 8 }}>
          <span>
            {x.tenant_name ?? x.tenant_id} — {x.reason}
          </span>
          <button type="button" className={s.ghostBtn} disabled={pending} onClick={() => run(() => releaseDeliveryMessageExclusion(x.id), () => '제외를 해제했습니다')}>
            해제
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        <input className={s.input} style={{ flex: '1 1 160px' }} placeholder="식당 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <input className={s.input} style={{ flex: '1 1 160px' }} placeholder="제외 사유 (필수)" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
        <button
          type="button"
          className={s.ghostBtn}
          disabled={busy || !q.trim()}
          onClick={() => start(async () => setRows((await searchTenantsForDeliveryMessages(q, 'restaurant')).data?.rows ?? []))}
        >
          검색
        </button>
      </div>
      {rows.map((r) => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}>
          <span>{r.name}</span>
          <button type="button" className={s.ghostBtn} disabled={pending || !reason.trim()} onClick={() => run(() => addDeliveryMessageExclusion(r.id, reason), () => `${r.name} 을(를) 제외했습니다`)}>
            제외
          </button>
        </div>
      ))}
    </section>
  )
}
