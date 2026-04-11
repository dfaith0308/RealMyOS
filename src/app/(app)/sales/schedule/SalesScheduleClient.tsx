'use client'

import { useState, useTransition } from 'react'
import { createContactLog } from '@/actions/contact'
import { snoozeSchedule, updateScheduleStatus, createSalesSchedule } from '@/actions/sales'
import type { SalesTarget, SalesScript, SalesSchedule } from '@/actions/sales'
import type { ContactResult, NextActionType } from '@/actions/contact'

const METHOD_LABEL: Record<string, string> = { call: '📞 전화', message: '💬 문자', visit: '🚗 방문' }
const RESULT_LABEL: Record<string, { label: string; color: string }> = {
  connected:  { label: '연결됨',   color: '#16A34A' },
  no_answer:  { label: '부재중',   color: '#6b7280' },
  interested: { label: '관심있음', color: '#2563EB' },
  rejected:   { label: '거절',     color: '#DC2626' },
  scheduled:  { label: '예약됨',   color: '#D97706' },
}

function formatKRW(n: number) { return n > 0 ? n.toLocaleString() + '원' : '-' }
const todayStr = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)

export default function SalesScheduleClient({
  initialTargets, initialScripts, initialSchedules,
}: {
  initialTargets:  SalesTarget[]
  initialScripts:  SalesScript[]
  initialSchedules: SalesSchedule[]
}) {
  const [tab, setTab]         = useState<'priority' | 'scheduled'>('priority')
  const [targets]             = useState(initialTargets)
  const [schedules, setSchedules] = useState(initialSchedules)
  const [activeTarget, setActive] = useState<SalesTarget | null>(null)
  const [activeMethod, setMethod] = useState<'call' | 'message' | 'visit'>('call')
  const [showScript, setShowScript] = useState(false)

  const [result,   setResult]   = useState<ContactResult>('connected')
  const [memo,     setMemo]     = useState('')
  const [nextDate, setNextDate] = useState('')
  const [nextType, setNextType] = useState<NextActionType>('call')
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  // 스케줄 추가 폼
  const [showAddSchedule, setShowAddSchedule] = useState(false)
  const [newScheduleCustomer, setNewScheduleCustomer] = useState('')
  const [newScheduleDate, setNewScheduleDate] = useState(todayStr())
  const [newScheduleAction, setNewScheduleAction] = useState<'call'|'message'|'visit'>('call')
  const [addingSchedule, setAddingSchedule] = useState(false)

  // Snooze
  const [snoozingId, setSnoozingId] = useState<string | null>(null)
  const [doneIds,    setDoneIds]    = useState<Set<string>>(new Set())

  const filteredScripts = initialScripts.filter((s) => s.type === activeMethod)

  async function handleAction(target: SalesTarget, method: 'call' | 'message' | 'visit') {
    setActive(target); setMethod(method); setShowScript(false)
    setResult('connected'); setMemo(''); setNextDate(''); setSaved(false)
    if (method === 'call' && target.phone) window.location.href = `tel:${target.phone}`
  }

  async function handleSave() {
    if (!activeTarget) return
    setSaving(true)
    await createContactLog({
      customer_id: activeTarget.customer_id, contact_method: activeMethod,
      result, memo: memo || undefined,
      next_action_date: nextDate || undefined,
      next_action_type: nextDate ? nextType : undefined,
    })
    setSaving(false); setSaved(true); setActive(null)
  }

  async function handleSnooze(schedule: SalesSchedule) {
    if (snoozingId) return
    setSnoozingId(schedule.id)
    const res = await snoozeSchedule(schedule.id)
    if (res.success && res.data) {
      setSchedules((prev) => prev.map((s) =>
        s.id === schedule.id
          ? {
              ...s,
              scheduled_date: res.data!.new_date,
              snooze_count:   (s.snooze_count ?? 0) + 1,
              original_date:  s.original_date ?? s.scheduled_date,
            }
          : s
      ))
    }
    setSnoozingId(null)
  }

  async function handleDone(id: string) {
    if (doneIds.has(id)) return
    setDoneIds((prev) => new Set(prev).add(id))
    await updateScheduleStatus(id, 'done')
    setSchedules((prev) => prev.map((s) => s.id === id ? { ...s, status: 'done' } : s))
  }

  async function handleAddSchedule() {
    if (!newScheduleCustomer.trim()) return
    setAddingSchedule(true)
    const target = targets.find((t) => t.customer_name.includes(newScheduleCustomer.trim()))
    if (!target) { alert('거래처를 찾을 수 없습니다.'); setAddingSchedule(false); return }
    const res = await createSalesSchedule({
      customer_id: target.customer_id,
      scheduled_date: newScheduleDate,
      action_type: newScheduleAction,
    })
    if (res.success) {
      const newItem: SalesSchedule = {
        id: res.data!.id, customer_id: target.customer_id,
        customer_name: target.customer_name, scheduled_date: newScheduleDate,
        action_type: newScheduleAction, script_id: null,
        status: 'pending', snooze_count: 0, original_date: null, memo: null,
      }
      setSchedules((prev) => [...prev, newItem].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)))
      setShowAddSchedule(false); setNewScheduleCustomer('')
    }
    setAddingSchedule(false)
  }

  const s = styles
  const pendingSchedules = schedules.filter((s) => s.status !== 'done' && s.status !== 'cancelled')
  const doneSchedules    = schedules.filter((s) => s.status === 'done')

  return (
    <div style={s.wrap}>
      <div style={s.titleBar}>
        <h1 style={s.title}>영업 스케쥴</h1>
        {/* 탭 */}
        <div style={{ display: 'flex', gap: 0, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          {([['priority', `우선순위 (${targets.length})`], ['scheduled', `예약 (${pendingSchedules.length})`]] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '7px 16px', border: 'none', fontSize: 13, cursor: 'pointer', background: tab === t ? '#111827' : '#fff', color: tab === t ? '#fff' : '#374151', fontWeight: tab === t ? 600 : 400 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* ── 우선순위 탭 ── */}
        {tab === 'priority' && (
          <div style={{ flex: 1, minWidth: 0 }}>
            {targets.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '60px 0', fontSize: 14 }}>오늘 영업할 거래처가 없습니다.</div>
            ) : targets.map((t, idx) => (
              <div key={t.customer_id} style={{ ...s.card, borderColor: activeTarget?.customer_id === t.customer_id ? '#2563EB' : '#e5e7eb', background: activeTarget?.customer_id === t.customer_id ? '#F0F9FF' : '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: idx < 3 ? '#DC2626' : '#6b7280', minWidth: 24 }}>{idx + 1}위</span>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{t.customer_name}</span>
                  {t.phone && <span style={{ fontSize: 12, color: '#9ca3af' }}>{t.phone}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>점수 {Math.round(t.score)}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                  {t.overdue_amount > 0 && <span style={{ color: '#DC2626', fontWeight: 500 }}>연체 {formatKRW(t.overdue_amount)}</span>}
                  <span>마지막주문 {t.days_since_last_order === 999 ? '없음' : `${t.days_since_last_order}일 전`}</span>
                  {t.days_since_last_contact !== null && <span>마지막연락 {t.days_since_last_contact}일 전</span>}
                </div>
                {t.next_action_date && (
                  <div style={{ fontSize: 11, color: '#D97706', marginBottom: 8 }}>📅 {t.next_action_date} {METHOD_LABEL[t.next_action_type ?? 'call']} 예약</div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['call', 'message', 'visit'] as const).map((m) => (
                    <button key={m} onClick={() => handleAction(t, m)}
                      style={{ padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 500, background: activeTarget?.customer_id === t.customer_id && activeMethod === m ? '#2563EB' : '#f3f4f6', color: activeTarget?.customer_id === t.customer_id && activeMethod === m ? '#fff' : '#374151' }}>
                      {METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 예약 탭 ── */}
        {tab === 'scheduled' && (
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* 추가 버튼 */}
            <div style={{ marginBottom: 12 }}>
              <button onClick={() => setShowAddSchedule((v) => !v)}
                style={{ padding: '7px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>
                + 예약 추가
              </button>
            </div>

            {/* 추가 폼 */}
            {showAddSchedule && (
              <div style={{ border: '1px solid #BFDBFE', borderRadius: 10, padding: 14, marginBottom: 14, background: '#EFF6FF' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input style={{ flex: 2, minWidth: 120, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}
                    placeholder="거래처명"
                    value={newScheduleCustomer}
                    onChange={(e) => setNewScheduleCustomer(e.target.value)} />
                  <input type="date" style={{ padding: '7px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}
                    value={newScheduleDate} onChange={(e) => setNewScheduleDate(e.target.value)} />
                  <select style={{ padding: '7px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}
                    value={newScheduleAction} onChange={(e) => setNewScheduleAction(e.target.value as any)}>
                    <option value="call">📞 전화</option>
                    <option value="message">💬 문자</option>
                    <option value="visit">🚗 방문</option>
                  </select>
                  <button onClick={handleAddSchedule} disabled={addingSchedule}
                    style={{ padding: '7px 14px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
                    {addingSchedule ? '추가 중...' : '추가'}
                  </button>
                </div>
              </div>
            )}

            {/* 예약 목록 */}
            {pendingSchedules.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '60px 0', fontSize: 14 }}>예약된 스케줄이 없습니다.</div>
            ) : pendingSchedules.map((sch) => {
              const isSnoozed   = (sch.snooze_count ?? 0) > 0
              const isSnoozingThis = snoozingId === sch.id
              const isDoneThis     = doneIds.has(sch.id)
              return (
                <div key={sch.id} style={{ ...s.card, borderColor: isSnoozed ? '#FCD34D' : '#e5e7eb', background: isSnoozed ? '#FFFBEB' : '#fff', opacity: isDoneThis ? 0.4 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{sch.customer_name}</span>
                      <span style={{ marginLeft: 10, fontSize: 12, color: '#6b7280' }}>{METHOD_LABEL[sch.action_type]}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: sch.scheduled_date === todayStr() ? '#DC2626' : '#374151' }}>
                        {sch.scheduled_date}
                      </div>
                      {/* Snooze 정보 */}
                      {isSnoozed && (
                        <div style={{ fontSize: 11, color: '#D97706', marginTop: 2 }}>
                          미룸 {sch.snooze_count}회
                          {sch.original_date && ` (원래: ${sch.original_date})`}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 버튼 */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => handleDone(sch.id)} disabled={isDoneThis}
                      style={{ padding: '5px 12px', background: isDoneThis ? '#DCFCE7' : '#f3f4f6', border: 'none', borderRadius: 6, fontSize: 12, cursor: isDoneThis ? 'default' : 'pointer', color: isDoneThis ? '#15803D' : '#374151', fontWeight: isDoneThis ? 600 : 400 }}>
                      {isDoneThis ? '✓ 완료' : '완료'}
                    </button>
                    <button onClick={() => handleSnooze(sch)} disabled={isSnoozingThis || isDoneThis}
                      style={{ padding: '5px 12px', background: isSnoozingThis ? '#FEF3C7' : '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 6, fontSize: 12, cursor: isSnoozingThis || isDoneThis ? 'not-allowed' : 'pointer', color: '#92400E', fontWeight: 500 }}>
                      {isSnoozingThis ? '미루는 중...' : '내일로 미루기'}
                    </button>
                  </div>
                </div>
              )
            })}

            {/* 완료된 스케줄 */}
            {doneSchedules.length > 0 && (
              <div style={{ marginTop: 20, opacity: 0.5 }}>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>완료됨 ({doneSchedules.length})</div>
                {doneSchedules.map((sch) => (
                  <div key={sch.id} style={{ ...s.card, borderColor: '#e5e7eb', background: '#f9fafb' }}>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{sch.customer_name}</span>
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#9ca3af' }}>{METHOD_LABEL[sch.action_type]} · {sch.scheduled_date}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 오른쪽: 행동 기록 패널 */}
        {activeTarget && tab === 'priority' && (
          <div style={{ width: 300, flexShrink: 0 }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
                {METHOD_LABEL[activeMethod]} — {activeTarget.customer_name}
              </div>
              <button onClick={() => setShowScript((v) => !v)}
                style={{ width: '100%', padding: '8px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, cursor: 'pointer', marginBottom: 10, textAlign: 'left', color: '#374151' }}>
                📋 스크립트 {showScript ? '▲' : '▼'}
              </button>
              {showScript && filteredScripts.map((sc) => (
                <div key={sc.id} style={{ padding: '7px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 6, fontSize: 12, cursor: 'pointer' }}
                  onClick={() => setShowScript(false)}>
                  <div style={{ fontWeight: 500, marginBottom: 2 }}>{sc.title}</div>
                  <div style={{ color: '#6b7280', lineHeight: 1.4 }}>{sc.content.replace('{{customer_name}}', activeTarget.customer_name)}</div>
                </div>
              ))}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 5 }}>결과</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(Object.entries(RESULT_LABEL) as [ContactResult, {label:string;color:string}][]).map(([k, v]) => (
                    <button key={k} onClick={() => setResult(k)}
                      style={{ padding: '5px 10px', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: result === k ? v.color : '#f3f4f6', color: result === k ? '#fff' : '#374151', fontWeight: result === k ? 600 : 400 }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, resize: 'vertical', minHeight: 56, boxSizing: 'border-box', marginBottom: 10 }}
                placeholder="메모 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input type="date" style={{ flex: 1, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}
                  value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
                <select style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}
                  value={nextType} onChange={(e) => setNextType(e.target.value as NextActionType)}>
                  <option value="call">전화</option>
                  <option value="message">문자</option>
                  <option value="visit">방문</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setActive(null)}
                  style={{ flex: 1, padding: '9px', border: '1px solid #e5e7eb', borderRadius: 7, background: '#fff', fontSize: 13, cursor: 'pointer' }}>취소</button>
                <button onClick={handleSave} disabled={saving}
                  style={{ flex: 2, padding: '9px', background: saving ? '#93C5FD' : '#111827', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  {saving ? '저장 중...' : saved ? '✓ 저장됨' : '이력 저장'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap:     { maxWidth: 1100, margin: '0 auto', padding: '28px 24px' },
  titleBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title:    { fontSize: 20, fontWeight: 600, margin: 0 },
  card:     { border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 10, transition: 'all 0.1s' },
}