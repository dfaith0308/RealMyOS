'use client'

import { useState } from 'react'
import { createContactLog } from '@/actions/contact'
import { snoozeSchedule, updateScheduleStatus, createSalesSchedule } from '@/actions/sales'
import type { SalesTarget, SalesScript, SalesSchedule } from '@/actions/sales'
import type { ContactResult, NextActionType } from '@/actions/contact'

// ============================================================
// 유틸
// ============================================================

const METHOD_LABEL: Record<string, string> = { call: '📞 전화', message: '💬 문자', visit: '🚗 방문' }
const RESULT_LABEL: Record<string, { label: string; color: string }> = {
  connected:  { label: '연결됨',   color: '#16A34A' },
  no_answer:  { label: '부재중',   color: '#6b7280' },
  interested: { label: '관심있음', color: '#2563EB' },
  rejected:   { label: '거절',     color: '#DC2626' },
  scheduled:  { label: '예약됨',   color: '#D97706' },
}

function formatKRW(n: number) { return n > 0 ? n.toLocaleString() + '원' : '-' }

function todayKST() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ============================================================
// 인라인 캘린더 (라이브러리 없음)
// ============================================================

function MiniCalendar({
  selected, onSelect, markedDates,
}: {
  selected: string
  onSelect: (d: string) => void
  markedDates: Set<string>
}) {
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date(selected + 'T00:00:00')
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  const { year, month } = viewDate
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = todayKST()

  function prevMonth() {
    setViewDate(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
    )
  }
  function nextMonth() {
    setViewDate(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
    )
  }

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
  const dayNames   = ['일','월','화','수','목','금','토']

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#6b7280', padding: '2px 6px' }}>‹</button>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{year}년 {monthNames[month]}</span>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#6b7280', padding: '2px 6px' }}>›</button>
      </div>

      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center' }}>
        {dayNames.map((d, i) => (
          <div key={d} style={{ padding: '6px 0', fontSize: 11, color: i === 0 ? '#EF4444' : i === 6 ? '#3B82F6' : '#9ca3af', fontWeight: 500 }}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isSelected = dateStr === selected
          const isToday    = dateStr === today
          const hasSchedule = markedDates.has(dateStr)
          const col = idx % 7

          return (
            <div key={idx} onClick={() => onSelect(dateStr)}
              style={{
                padding: '5px 2px', textAlign: 'center', cursor: 'pointer', position: 'relative',
                background: isSelected ? '#111827' : isToday ? '#EFF6FF' : 'transparent',
                borderRadius: isSelected ? 6 : 0,
              }}>
              <span style={{
                fontSize: 13,
                color: isSelected ? '#fff' : isToday ? '#2563EB' : col === 0 ? '#EF4444' : col === 6 ? '#3B82F6' : '#374151',
                fontWeight: isSelected || isToday ? 700 : 400,
              }}>
                {day}
              </span>
              {hasSchedule && !isSelected && (
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#F59E0B', margin: '1px auto 0' }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export default function SalesScheduleClient({
  initialTargets, initialScripts, initialSchedules,
}: {
  initialTargets:   SalesTarget[]
  initialScripts:   SalesScript[]
  initialSchedules: SalesSchedule[]
}) {
  const [tab, setTab]             = useState<'priority' | 'scheduled'>('priority')
  const [targets]                 = useState(initialTargets)
  const [schedules, setSchedules] = useState(initialSchedules)

  // 캘린더 선택 날짜 (기본: 오늘)
  const [selectedDate, setSelectedDate] = useState(todayKST())

  // 우선순위 탭 — 행동 기록 패널
  const [activeTarget, setActive] = useState<SalesTarget | null>(null)
  const [activeMethod, setMethod] = useState<'call' | 'message' | 'visit'>('call')
  const [showScript,   setShowScript] = useState(false)
  const [result,       setResult]   = useState<ContactResult>('connected')
  const [memo,         setMemo]     = useState('')
  const [nextDate,     setNextDate] = useState('')
  const [nextType,     setNextType] = useState<NextActionType>('call')
  const [saving,       setSaving]   = useState(false)

  // 스케줄 추가 폼
  const [showAdd,          setShowAdd]          = useState(false)
  const [newCustName,      setNewCustName]      = useState('')
  const [newAction,        setNewAction]        = useState<'call'|'message'|'visit'>('call')
  const [addingSchedule,   setAddingSchedule]   = useState(false)

  // Snooze / 완료
  const [snoozingId, setSnoozingId] = useState<string | null>(null)
  const [doneIds,    setDoneIds]    = useState<Set<string>>(new Set())

  const filteredScripts = initialScripts.filter((s) => s.type === activeMethod)

  // 캘린더 점 표시용 날짜 집합
  const markedDates = new Set(
    schedules.filter((s) => s.status !== 'done' && s.status !== 'cancelled').map((s) => s.scheduled_date)
  )

  // 선택 날짜 기준 스케줄
  const daySchedules = schedules.filter(
    (s) => s.scheduled_date === selectedDate && s.status !== 'cancelled'
  )

  // ── 핸들러 ────────────────────────────────────────────────

  async function handleAction(target: SalesTarget, method: 'call' | 'message' | 'visit') {
    setActive(target); setMethod(method); setShowScript(false)
    setResult('connected'); setMemo(''); setNextDate(''); setSaving(false)
    if (method === 'call' && target.phone) window.location.href = `tel:${target.phone}`
  }

  async function handleSave() {
    if (!activeTarget || saving) return
    setSaving(true)
    await createContactLog({
      customer_id: activeTarget.customer_id, contact_method: activeMethod,
      result, memo: memo || undefined,
      next_action_date: nextDate || undefined,
      next_action_type: nextDate ? nextType : undefined,
    })
    setSaving(false); setActive(null)
  }

  async function handleSnooze(sch: SalesSchedule) {
    if (snoozingId) return
    setSnoozingId(sch.id)
    const res = await snoozeSchedule(sch.id)
    if (res.success && res.data) {
      setSchedules((prev) => prev.map((s) =>
        s.id === sch.id ? { ...s, scheduled_date: res.data!.new_date, snooze_count: (s.snooze_count ?? 0) + 1, original_date: s.original_date ?? s.scheduled_date } : s
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
    if (!newCustName.trim() || addingSchedule) return
    setAddingSchedule(true)
    const target = targets.find((t) => t.customer_name.includes(newCustName.trim()))
    if (!target) { alert('거래처를 찾을 수 없습니다.'); setAddingSchedule(false); return }
    const res = await createSalesSchedule({ customer_id: target.customer_id, scheduled_date: selectedDate, action_type: newAction })
    if (res.success) {
      setSchedules((prev) => [...prev, { id: res.data!.id, customer_id: target.customer_id, customer_name: target.customer_name, scheduled_date: selectedDate, action_type: newAction, script_id: null, status: 'pending', snooze_count: 0, original_date: null, memo: null }])
      setShowAdd(false); setNewCustName('')
    }
    setAddingSchedule(false)
  }

  const pendingCount = schedules.filter((s) => s.status !== 'done' && s.status !== 'cancelled').length

  // ── 렌더 ─────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system, "Noto Sans KR", sans-serif' }}>
      {/* 헤더 + 탭 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>영업 스케쥴</h1>
        <div style={{ display: 'flex', gap: 0, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          {([['priority', `우선순위 (${targets.length})`], ['scheduled', `예약 (${pendingCount})`]] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '7px 18px', border: 'none', fontSize: 13, cursor: 'pointer', background: tab === t ? '#111827' : '#fff', color: tab === t ? '#fff' : '#374151', fontWeight: tab === t ? 600 : 400 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 우선순위 탭 ── */}
      {tab === 'priority' && (
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {targets.length === 0
              ? <div style={{ textAlign: 'center', color: '#9ca3af', padding: '60px 0', fontSize: 14 }}>오늘 영업할 거래처가 없습니다.</div>
              : targets.map((t, idx) => (
                <div key={t.customer_id} style={{ border: `1px solid ${activeTarget?.customer_id === t.customer_id ? '#2563EB' : '#e5e7eb'}`, borderRadius: 10, padding: 14, marginBottom: 10, background: activeTarget?.customer_id === t.customer_id ? '#F0F9FF' : '#fff' }}>
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
                  {t.next_action_date && <div style={{ fontSize: 11, color: '#D97706', marginBottom: 8 }}>📅 {t.next_action_date} {METHOD_LABEL[t.next_action_type ?? 'call']} 예약</div>}
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

          {/* 행동 기록 패널 */}
          {activeTarget && (
            <div style={{ width: 300, flexShrink: 0 }}>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{METHOD_LABEL[activeMethod]} — {activeTarget.customer_name}</div>
                <button onClick={() => setShowScript((v) => !v)}
                  style={{ width: '100%', padding: '8px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, cursor: 'pointer', marginBottom: 10, textAlign: 'left' }}>
                  📋 스크립트 {showScript ? '▲' : '▼'}
                </button>
                {showScript && filteredScripts.map((sc) => (
                  <div key={sc.id} style={{ padding: '7px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 6, fontSize: 12, cursor: 'pointer' }}>
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
                    <option value="call">전화</option><option value="message">문자</option><option value="visit">방문</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setActive(null)} style={{ flex: 1, padding: '9px', border: '1px solid #e5e7eb', borderRadius: 7, background: '#fff', fontSize: 13, cursor: 'pointer' }}>취소</button>
                  <button onClick={handleSave} disabled={saving}
                    style={{ flex: 2, padding: '9px', background: saving ? '#93C5FD' : '#111827', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    {saving ? '저장 중...' : '이력 저장'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 예약 탭: 캘린더 + 리스트 ── */}
      {tab === 'scheduled' && (
        <div style={{ display: 'flex', gap: 20 }}>
          {/* 왼쪽: 캘린더 */}
          <div style={{ width: 280, flexShrink: 0 }}>
            <MiniCalendar
              selected={selectedDate}
              onSelect={setSelectedDate}
              markedDates={markedDates}
            />
            <button onClick={() => setSelectedDate(todayKST())}
              style={{ width: '100%', marginTop: 8, padding: '7px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: '#374151' }}>
              오늘로 이동
            </button>
          </div>

          {/* 오른쪽: 선택 날짜 스케줄 리스트 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: selectedDate === todayKST() ? '#2563EB' : '#374151' }}>
                {selectedDate} {selectedDate === todayKST() && <span style={{ fontSize: 11, color: '#2563EB' }}>오늘</span>}
              </div>
              <button onClick={() => setShowAdd((v) => !v)}
                style={{ padding: '6px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                + 예약 추가
              </button>
            </div>

            {/* 추가 폼 */}
            {showAdd && (
              <div style={{ border: '1px solid #BFDBFE', borderRadius: 10, padding: 12, marginBottom: 12, background: '#EFF6FF' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={{ flex: 1, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}
                    placeholder="거래처명" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} />
                  <select style={{ padding: '7px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}
                    value={newAction} onChange={(e) => setNewAction(e.target.value as any)}>
                    <option value="call">📞</option><option value="message">💬</option><option value="visit">🚗</option>
                  </select>
                  <button onClick={handleAddSchedule} disabled={addingSchedule}
                    style={{ padding: '7px 14px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
                    추가
                  </button>
                </div>
              </div>
            )}

            {/* 스케줄 리스트 */}
            {daySchedules.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: 14, border: '1px dashed #e5e7eb', borderRadius: 10 }}>
                {selectedDate}에 예약된 스케줄이 없습니다.
              </div>
            ) : daySchedules.map((sch) => {
              const isSnoozed      = (sch.snooze_count ?? 0) > 0
              const isSnoozingThis = snoozingId === sch.id
              const isDoneThis     = sch.status === 'done' || doneIds.has(sch.id)
              return (
                <div key={sch.id} style={{ border: `1px solid ${isSnoozed ? '#FCD34D' : '#e5e7eb'}`, borderRadius: 10, padding: 14, marginBottom: 10, background: isDoneThis ? '#f9fafb' : isSnoozed ? '#FFFBEB' : '#fff', opacity: isDoneThis ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{sch.customer_name}</span>
                      <span style={{ marginLeft: 10, fontSize: 12, color: '#6b7280' }}>{METHOD_LABEL[sch.action_type]}</span>
                    </div>
                    {isSnoozed && (
                      <div style={{ fontSize: 11, color: '#D97706', textAlign: 'right' }}>
                        미룸 {sch.snooze_count}회
                        {sch.original_date && <div>(원래: {sch.original_date})</div>}
                      </div>
                    )}
                  </div>
                  {!isDoneThis && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleDone(sch.id)}
                        style={{ padding: '5px 12px', background: '#f3f4f6', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                        완료
                      </button>
                      <button onClick={() => handleSnooze(sch)} disabled={isSnoozingThis}
                        style={{ padding: '5px 12px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 6, fontSize: 12, cursor: isSnoozingThis ? 'not-allowed' : 'pointer', color: '#92400E' }}>
                        {isSnoozingThis ? '미루는 중...' : '내일로 미루기'}
                      </button>
                    </div>
                  )}
                  {isDoneThis && <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 500 }}>✓ 완료</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
