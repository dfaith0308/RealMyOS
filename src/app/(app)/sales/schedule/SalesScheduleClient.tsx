'use client'

import { useState } from 'react'
import { createContactLog } from '@/actions/contact'
import type { SalesTarget, SalesScript } from '@/actions/sales'
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

export default function SalesScheduleClient({
  initialTargets, initialScripts,
}: {
  initialTargets: SalesTarget[]
  initialScripts: SalesScript[]
}) {
  const [targets]                   = useState(initialTargets)
  const [activeTarget, setActive]   = useState<SalesTarget | null>(null)
  const [activeMethod, setMethod]   = useState<'call' | 'message' | 'visit'>('call')
  const [showScript, setShowScript] = useState(false)
  const [selectedScript, setSelectedScript] = useState<SalesScript | null>(null)

  // 행동 기록 폼
  const [result, setResult]         = useState<ContactResult>('connected')
  const [memo, setMemo]             = useState('')
  const [nextDate, setNextDate]     = useState('')
  const [nextType, setNextType]     = useState<NextActionType>('call')
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)

  const filteredScripts = initialScripts.filter((s) => s.type === activeMethod)

  async function handleAction(target: SalesTarget, method: 'call' | 'message' | 'visit') {
    setActive(target)
    setMethod(method)
    setShowScript(false)
    setSelectedScript(null)
    setResult('connected')
    setMemo('')
    setNextDate('')
    setSaved(false)

    // 전화: tel: 링크 자동 실행
    if (method === 'call' && target.phone) {
      window.location.href = `tel:${target.phone}`
    }
  }

  async function handleSave() {
    if (!activeTarget) return
    setSaving(true)
    await createContactLog({
      customer_id:       activeTarget.customer_id,
      contact_method:    activeMethod,
      result,
      memo:              memo || undefined,
      next_action_date:  nextDate || undefined,
      next_action_type:  nextDate ? nextType : undefined,
    })
    setSaving(false)
    setSaved(true)
    setActive(null)
  }

  const s = styles
  return (
    <div style={s.wrap}>
      <div style={s.titleBar}>
        <h1 style={s.title}>영업 스케쥴</h1>
        <span style={{ fontSize: 13, color: '#6b7280' }}>오늘 영업할 거래처 {targets.length}곳</span>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* 왼쪽: 거래처 목록 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {targets.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '60px 0', fontSize: 14 }}>
              오늘 영업할 거래처가 없습니다.
            </div>
          ) : (
            targets.map((t, idx) => (
              <div key={t.customer_id} style={{
                ...s.card,
                borderColor: activeTarget?.customer_id === t.customer_id ? '#2563EB' : '#e5e7eb',
                background:  activeTarget?.customer_id === t.customer_id ? '#F0F9FF' : '#fff',
              }}>
                {/* 순위 + 이름 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: idx < 3 ? '#DC2626' : '#6b7280', minWidth: 24 }}>
                    {idx + 1}위
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{t.customer_name}</span>
                  {t.phone && <span style={{ fontSize: 12, color: '#9ca3af' }}>{t.phone}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>점수 {Math.round(t.score)}</span>
                </div>

                {/* 지표 */}
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                  {t.overdue_amount > 0 && (
                    <span style={{ color: '#DC2626', fontWeight: 500 }}>미수금 {formatKRW(t.overdue_amount)}</span>
                  )}
                  <span>마지막주문 {t.days_since_last_order === 999 ? '없음' : `${t.days_since_last_order}일 전`}</span>
                  {t.days_since_last_contact !== null && (
                    <span>마지막연락 {t.days_since_last_contact}일 전</span>
                  )}
                </div>

                {/* 다음 행동 예약 있으면 표시 */}
                {t.next_action_date && (
                  <div style={{ fontSize: 11, color: '#D97706', marginBottom: 8 }}>
                    📅 {t.next_action_date} {METHOD_LABEL[t.next_action_type ?? 'call']} 예약
                  </div>
                )}

                {/* 액션 버튼 */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['call', 'message', 'visit'] as const).map((m) => (
                    <button key={m} onClick={() => handleAction(t, m)}
                      style={{
                        padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 12,
                        cursor: 'pointer', fontWeight: 500,
                        background: activeTarget?.customer_id === t.customer_id && activeMethod === m ? '#2563EB' : '#f3f4f6',
                        color:      activeTarget?.customer_id === t.customer_id && activeMethod === m ? '#fff' : '#374151',
                      }}>
                      {METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 오른쪽: 행동 기록 패널 */}
        {activeTarget && (
          <div style={{ width: 320, flexShrink: 0 }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
                {METHOD_LABEL[activeMethod]} — {activeTarget.customer_name}
              </div>

              {/* 스크립트 */}
              <button onClick={() => setShowScript((v) => !v)}
                style={{ width: '100%', padding: '8px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, cursor: 'pointer', marginBottom: 10, textAlign: 'left', color: '#374151' }}>
                📋 스크립트 보기 {showScript ? '▲' : '▼'}
              </button>

              {showScript && (
                <div style={{ marginBottom: 12 }}>
                  {filteredScripts.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#9ca3af', padding: 8 }}>스크립트 없음</div>
                  ) : (
                    filteredScripts.map((sc) => (
                      <div key={sc.id}
                        onClick={() => setSelectedScript(sc)}
                        style={{
                          padding: '8px 10px', borderRadius: 6, marginBottom: 6, cursor: 'pointer', fontSize: 12,
                          background: selectedScript?.id === sc.id ? '#EFF6FF' : '#f9fafb',
                          border: `1px solid ${selectedScript?.id === sc.id ? '#93C5FD' : '#e5e7eb'}`,
                        }}>
                        <div style={{ fontWeight: 500, marginBottom: 3 }}>{sc.title}</div>
                        <div style={{ color: '#6b7280', lineHeight: 1.4 }}>
                          {sc.content.replace('[거래처명]', activeTarget.customer_name)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* 결과 */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 5 }}>결과</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(Object.entries(RESULT_LABEL) as [ContactResult, { label: string; color: string }][]).map(([k, v]) => (
                    <button key={k} onClick={() => setResult(k)}
                      style={{
                        padding: '5px 10px', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                        background: result === k ? v.color : '#f3f4f6',
                        color:      result === k ? '#fff' : '#374151',
                        fontWeight: result === k ? 600 : 400,
                      }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 메모 */}
              <textarea
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, resize: 'vertical', minHeight: 60, boxSizing: 'border-box', marginBottom: 10 }}
                placeholder="메모 (선택)"
                value={memo}
                onChange={(e) => setMemo(e.target.value)} />

              {/* 다음 행동 */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 5 }}>다음 행동 예약</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="date" style={{ flex: 1, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}
                    value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
                  <select style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}
                    value={nextType} onChange={(e) => setNextType(e.target.value as NextActionType)}>
                    <option value="call">전화</option>
                    <option value="message">문자</option>
                    <option value="visit">방문</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setActive(null)}
                  style={{ flex: 1, padding: '9px', border: '1px solid #e5e7eb', borderRadius: 7, background: '#fff', fontSize: 13, cursor: 'pointer' }}>
                  취소
                </button>
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
  titleBar: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, justifyContent: 'space-between' },
  title:    { fontSize: 20, fontWeight: 600, margin: 0 },
  card:     { border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 10, transition: 'all 0.1s' },
}
