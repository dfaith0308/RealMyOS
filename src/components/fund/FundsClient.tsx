'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateDailyFundPlan, completeFundTransfer } from '@/actions/fund'
import { formatKRW } from '@/lib/calc'
import type { Account, FundRule, FundTransfer } from '@/actions/fund'

interface Props {
  today: string
  accounts: Account[]
  rules: FundRule[]
  plan: FundTransfer[]
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: '대기',     color: '#6b7280', bg: '#F3F4F6' },
  completed: { label: '완료',     color: '#15803D', bg: '#F0FDF4' },
  partial:   { label: '부분이행', color: '#B45309', bg: '#FFFBEB' },
  overdue:   { label: '미납',     color: '#B91C1C', bg: '#FEF2F2' },
}

export default function FundsClient({ today, accounts, rules, plan: initPlan }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [plan, setPlan] = useState(initPlan)
  const [actualAmounts, setActualAmounts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const totalPlanned = plan.reduce((s, t) => s + t.planned_amount, 0)
  const totalActual  = plan.filter((t) => t.actual_amount !== null)
                           .reduce((s, t) => s + (t.actual_amount ?? 0), 0)
  const pendingCount    = plan.filter((t) => t.status === 'pending').length
  const totalUnexecuted = plan.reduce((s, t) => {
    const actual = t.actual_amount ?? 0
    return s + Math.max(0, t.planned_amount - actual)
  }, 0)

  function handleGenerate() {
    setError(null)
    startTransition(async () => {
      const r = await generateDailyFundPlan(today)
      if (r.success) router.refresh()
      else setError(r.error ?? '생성 실패')
    })
  }

  function handleComplete(transfer_id: string) {
    const raw = actualAmounts[transfer_id]
    const amount = raw ? Number(raw) : 0
    if (isNaN(amount) || amount < 0) { setError('유효한 금액을 입력해주세요.'); return }

    startTransition(async () => {
      const r = await completeFundTransfer(transfer_id, amount)
      if (r.success) router.refresh()
      else setError(r.error ?? '처리 실패')
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <div style={s.err}>{error}</div>}

      {/* 요약 */}
      <div style={s.summaryRow}>
        <div style={s.summaryCard}>
          <span style={s.summaryLabel}>오늘 계획</span>
          <span style={s.summaryVal}>{formatKRW(totalPlanned)}</span>
        </div>
        <div style={s.summaryCard}>
          <span style={s.summaryLabel}>이행 완료</span>
          <span style={{ ...s.summaryVal, color: '#15803D' }}>{formatKRW(totalActual)}</span>
        </div>
        <div style={s.summaryCard}>
          <span style={s.summaryLabel}>대기</span>
          <span style={{ ...s.summaryVal, color: pendingCount > 0 ? '#B45309' : '#15803D' }}>
            {pendingCount}건
          </span>
        </div>
        <div style={s.summaryCard}>
          <span style={s.summaryLabel}>미이행</span>
          <span style={{ ...s.summaryVal, color: totalUnexecuted > 0 ? '#B91C1C' : '#15803D' }}>
            {formatKRW(totalUnexecuted)}
          </span>
        </div>
      </div>

      {/* 계획 생성 버튼 */}
      {plan.length === 0 && (
        <div style={s.emptyBox}>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 12px 0' }}>
            오늘 자금 계획이 없습니다.
          </p>
          {rules.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>먼저 자금 규칙을 설정해주세요.</p>
          ) : (
            <button style={isPending ? s.btnOff : s.btn}
              onClick={handleGenerate} disabled={isPending}>
              {isPending ? '생성 중...' : '📋 오늘 자금 계획 생성'}
            </button>
          )}
        </div>
      )}

      {/* 자금 계획 목록 */}
      {plan.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>오늘 이체 목록</h2>
            <button style={{ ...s.btn, padding: '6px 12px', fontSize: 12 }}
              onClick={handleGenerate} disabled={isPending}>
              새로고침
            </button>
          </div>

          {plan.map((t) => {
            const cfg = STATUS_CFG[t.status] ?? STATUS_CFG.pending
            return (
              <div key={t.id} style={s.card}>
                <div style={s.cardTop}>
                  <div>
                    <span style={s.ruleName}>{t.rule_name}</span>
                    <span style={s.accountName}>{t.account_name}</span>
                  </div>
                  <span style={{ ...s.badge, color: cfg.color, background: cfg.bg }}>
                    {cfg.label}
                  </span>
                </div>

                <div style={s.amounts}>
                  <div>
                    <span style={s.amtLabel}>계획</span>
                    <span style={s.amtVal}>{formatKRW(t.planned_amount)}</span>
                  </div>
                  {t.carry_over_amount > 0 && (
                    <div title="전일 미이행 금액 이월">
                      <span style={{ ...s.amtLabel, color: '#B45309' }}>이월 ↗</span>
                      <span style={{ ...s.amtVal, color: '#B45309', fontSize: 12 }}>
                        +{formatKRW(t.carry_over_amount)}
                      </span>
                    </div>
                  )}
                  {t.actual_amount !== null && (
                    <div>
                      <span style={s.amtLabel}>실행</span>
                      <span style={{ ...s.amtVal, color: '#15803D' }}>
                        {formatKRW(t.actual_amount)}
                      </span>
                    </div>
                  )}
                </div>

                {t.status !== 'completed' && t.date === today && (
                  <div style={s.actionRow}>
                    <input style={s.input} type="number"
                      value={actualAmounts[t.id] ?? ''}
                      onChange={(e) => setActualAmounts((p) => ({ ...p, [t.id]: e.target.value }))}
                      placeholder={`${formatKRW(t.planned_amount)} 이체`}
                      min={0} />
                    <button style={isPending ? s.btnOff : s.completeBtn}
                      onClick={() => handleComplete(t.id)} disabled={isPending}>
                      이체 완료
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 계좌 현황 */}
      {accounts.length > 0 && (
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px 0' }}>계좌 현황</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {accounts.map((a) => (
              <div key={a.id} style={s.accountRow}>
                <div>
                  <span style={s.accountRowName}>{a.account_name}</span>
                  <span style={s.accountRowBank}>{a.bank_name}</span>
                  {a.purpose_name && (
                    <span style={s.purposeBadge}>{a.purpose_name}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  err:            { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13 },
  summaryRow:     { display: 'flex', gap: 8 },
  summaryCard:    { flex: 1, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 },
  summaryLabel:   { fontSize: 11, color: '#9ca3af', fontWeight: 500 },
  summaryVal:     { fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  emptyBox:       { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '32px 24px', textAlign: 'center' },
  btn:            { padding: '9px 18px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnOff:         { padding: '9px 18px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'not-allowed' },
  completeBtn:    { padding: '8px 14px', background: '#15803D', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  card:           { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 },
  cardTop:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  ruleName:       { fontSize: 14, fontWeight: 600, color: '#111827', marginRight: 8 },
  accountName:    { fontSize: 12, color: '#6b7280' },
  badge:          { padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 },
  amounts:        { display: 'flex', gap: 20 },
  amtLabel:       { fontSize: 11, color: '#9ca3af', display: 'block', marginBottom: 2 },
  amtVal:         { fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums' },
  actionRow:      { display: 'flex', gap: 8 },
  input:          { flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none' },
  accountRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 },
  accountRowName: { fontSize: 13, fontWeight: 500, marginRight: 8 },
  accountRowBank: { fontSize: 12, color: '#9ca3af' },
  purposeBadge:   { marginLeft: 8, padding: '1px 6px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: 4, fontSize: 11 },
}