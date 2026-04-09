'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createAccount, createFundRule, createAccountPurpose,
  toggleAccount, toggleFundRule, toggleAccountPurpose,
  getFundPreview,
} from '@/actions/fund'
import type { Account, FundRule, AccountPurpose, FundPreviewResult } from '@/actions/fund'
import { formatKRW } from '@/lib/calc'

interface Props {
  accounts:       Account[]
  purposes:       AccountPurpose[]
  activePurposes: AccountPurpose[]
  rules:          FundRule[]
  preview:        FundPreviewResult | null
}

export default function FundSettingsClient({ accounts, purposes, activePurposes, rules, preview: initPreview }: Props) {
  const router   = useRouter()
  const [isPending, startTransition] = useTransition()
  const [preview, setPreview] = useState<FundPreviewResult | null>(initPreview)
  const [error, setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // 계좌 추가 form
  const [newBank, setNewBank]     = useState('')
  const [newAccNum, setNewAccNum] = useState('')
  const [newAccName, setNewAccName] = useState('')
  const [newPurpId, setNewPurpId] = useState('')

  // 목적 추가
  const [newPurpName, setNewPurpName] = useState('')

  // 규칙 추가
  const [ruleAccId,  setRuleAccId]  = useState('')
  const [ruleName,   setRuleName]   = useState('')
  const [ruleType,   setRuleType]   = useState<'fixed' | 'percentage'>('fixed')
  const [ruleAmount, setRuleAmount] = useState('')
  const [rulePriority, setRulePriority] = useState('0')

  function notify(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(null), 2500) }
  function run(fn: () => Promise<void>) {
    setError(null)
    startTransition(async () => { try { await fn() } catch (e: any) { setError(e.message) } })
  }

  function addAccount() {
    run(async () => {
      const r = await createAccount({ bank_name: newBank, account_number: newAccNum, account_name: newAccName, purpose_id: newPurpId || undefined })
      if (!r.success) { setError(r.error ?? '실패'); return }
      setNewBank(''); setNewAccNum(''); setNewAccName(''); setNewPurpId('')
      notify('계좌가 추가됐습니다.'); router.refresh()
    })
  }

  function addPurpose() {
    run(async () => {
      const r = await createAccountPurpose(newPurpName)
      if (!r.success) { setError(r.error ?? '실패'); return }
      setNewPurpName(''); notify('목적이 추가됐습니다.'); router.refresh()
    })
  }

  function addRule() {
    run(async () => {
      const amt = Number(ruleAmount)
      if (!ruleAccId) { setError('계좌를 선택해주세요.'); return }
      if (!ruleName.trim()) { setError('규칙명을 입력해주세요.'); return }
      if (!amt || amt <= 0) { setError('금액을 입력해주세요.'); return }
      if (ruleType === 'percentage' && amt > 100) { setError('비율은 100% 이하.'); return }
      const r = await createFundRule({ account_id: ruleAccId, rule_name: ruleName, calculation_type: ruleType, amount: amt, priority: Number(rulePriority) })
      if (!r.success) { setError(r.error ?? '실패'); return }
      setRuleAccId(''); setRuleName(''); setRuleAmount(''); setRulePriority('0')
      const pv = await getFundPreview(); if (pv.success && pv.data) setPreview(pv.data)
      notify('규칙이 추가됐습니다.'); router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error   && <div style={s.err}>{error}</div>}
      {success && <div style={s.ok}>{success}</div>}

      {/* ── 미리보기 ─────────────────────────────────── */}
      {preview && (
        <Card title="📊 일 이체 미리보기">
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            <div style={s.kpi}>
              <span style={s.kpiLabel}>이번달 매출</span>
              <span style={s.kpiVal}>{formatKRW(preview.monthly_sales)}</span>
            </div>
            <div style={s.kpi}>
              <span style={s.kpiLabel}>이번달 영업일</span>
              <span style={s.kpiVal}>{preview.biz_days}일</span>
            </div>
            <div style={s.kpi}>
              <span style={s.kpiLabel}>일 이체 합계</span>
              <span style={{ ...s.kpiVal, color: preview.warnings.length > 0 ? '#B91C1C' : '#15803D' }}>
                {formatKRW(preview.total_daily)}
              </span>
            </div>
          </div>

          {/* 규칙별 미리보기 */}
          <div style={s.tableWrap}>
            {preview.rules.map((r) => (
              <div key={r.rule_id} style={{ ...s.row, opacity: r.is_active ? 1 : 0.45 }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{r.rule_name}</span>
                  <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>
                    {r.account_name} · {r.calculation_type === 'fixed' ? `월 ${r.amount.toLocaleString()}원` : `매출 ${r.amount}%`}
                  </span>
                </div>
                <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: r.is_active ? 600 : 400, color: r.is_active ? '#111827' : '#9ca3af' }}>
                  {r.is_active ? `${formatKRW(r.daily_amount)}/일` : '비활성'}
                </span>
              </div>
            ))}
          </div>

          {/* 경고 */}
          {preview.warnings.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {preview.warnings.map((w, i) => (
                <div key={i} style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#B45309' }}>
                  ⚠️ {w}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── 자금 목적 ─────────────────────────────────── */}
      <Card title="💼 자금 목적">
        <div style={s.tableWrap}>
          {purposes.map((p) => (
            <div key={p.id} style={s.row}>
              <span style={{ fontSize: 13, color: p.is_active ? '#111827' : '#9ca3af', textDecoration: p.is_active ? 'none' : 'line-through' }}>{p.name}</span>
              <Toggle active={p.is_active} disabled={isPending}
                onToggle={() => run(async () => { await toggleAccountPurpose(p.id, !p.is_active); router.refresh() })} />
            </div>
          ))}
        </div>
        <div style={s.addRow}>
          <input style={s.input} value={newPurpName}
            onChange={(e) => setNewPurpName(e.target.value)} placeholder="새 목적명" />
          <button style={isPending ? s.btnOff : s.btn} onClick={addPurpose} disabled={isPending}>추가</button>
        </div>
      </Card>

      {/* ── 계좌 관리 ─────────────────────────────────── */}
      <Card title="🏦 계좌 관리">
        <div style={s.tableWrap}>
          {accounts.map((a) => (
            <div key={a.id} style={s.row}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 500, color: a.is_active ? '#111827' : '#9ca3af' }}>{a.account_name}</span>
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>{a.bank_name} {a.account_number}</span>
                {a.purpose_name && <span style={s.purposeTag}>{a.purpose_name}</span>}
              </div>
              <Toggle active={a.is_active} disabled={isPending}
                onToggle={() => run(async () => { await toggleAccount(a.id, !a.is_active); const pv = await getFundPreview(); if (pv.success && pv.data) setPreview(pv.data); router.refresh() })} />
            </div>
          ))}
          {accounts.length === 0 && <p style={s.empty}>등록된 계좌가 없습니다.</p>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          <input style={s.input} value={newBank} onChange={(e) => setNewBank(e.target.value)} placeholder="은행명" />
          <input style={s.input} value={newAccNum} onChange={(e) => setNewAccNum(e.target.value)} placeholder="계좌번호" />
          <input style={s.input} value={newAccName} onChange={(e) => setNewAccName(e.target.value)} placeholder="계좌 별칭" />
          <select style={s.input} value={newPurpId} onChange={(e) => setNewPurpId(e.target.value)}>
            <option value="">목적 선택 (선택)</option>
            {activePurposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <button style={{ ...( isPending ? s.btnOff : s.btn ), marginTop: 8, width: '100%' }} onClick={addAccount} disabled={isPending}>
          계좌 추가
        </button>
      </Card>

      {/* ── 자금 규칙 ─────────────────────────────────── */}
      <Card title="⚙️ 자금 규칙">
        <div style={s.tableWrap}>
          {rules.map((r) => (
            <div key={r.id} style={s.row}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 500, color: r.is_active ? '#111827' : '#9ca3af' }}>{r.rule_name}</span>
                <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>
                  {r.account_name} · {r.calculation_type === 'fixed' ? `월 ${r.amount.toLocaleString()}원` : `매출의 ${r.amount}%`}
                </span>
              </div>
              <Toggle active={r.is_active} disabled={isPending}
                onToggle={() => run(async () => { await toggleFundRule(r.id, !r.is_active); const pv = await getFundPreview(); if (pv.success && pv.data) setPreview(pv.data); router.refresh() })} />
            </div>
          ))}
          {rules.length === 0 && <p style={s.empty}>등록된 규칙이 없습니다.</p>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          <input style={s.input} value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="규칙명 (예: 세금 적립)" />
          <select style={s.input} value={ruleAccId} onChange={(e) => setRuleAccId(e.target.value)}>
            <option value="">계좌 선택</option>
            {accounts.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
          </select>

          <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden' }}>
            {(['fixed', 'percentage'] as const).map((t, i) => (
              <button key={t} type="button"
                style={{ flex: 1, padding: '8px', border: 'none', borderRight: i === 0 ? '1px solid #d1d5db' : 'none',
                  background: ruleType === t ? '#111827' : '#fff',
                  color: ruleType === t ? '#fff' : '#374151', fontSize: 12, cursor: 'pointer' }}
                onClick={() => setRuleType(t)}>
                {t === 'fixed' ? '고정금액' : '매출비율'}
              </button>
            ))}
          </div>

          <input style={s.input} type="number" value={ruleAmount}
            onChange={(e) => setRuleAmount(e.target.value)}
            placeholder={ruleType === 'fixed' ? '월 금액 (원)' : '비율 (%)'}
            min={0} max={ruleType === 'percentage' ? 100 : undefined} />
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0' }}>
          {ruleType === 'fixed' ? '영업일수로 나눠 일별 이체 금액을 계산합니다.' : '이번달 매출 × 비율 ÷ 영업일수로 계산합니다.'}
        </div>
        <button style={{ ...(isPending ? s.btnOff : s.btn), width: '100%' }} onClick={addRule} disabled={isPending}>
          규칙 추가
        </button>
      </Card>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      <div style={{ padding: '10px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 13, fontWeight: 600 }}>{title}</div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

function Toggle({ active, onToggle, disabled }: { active: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onToggle} disabled={disabled}
      style={{ padding: '3px 10px', fontSize: 11, fontWeight: 600, borderRadius: 8, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? '#D1FAE5' : '#F3F4F6', color: active ? '#065F46' : '#6b7280' }}>
      {active ? '활성' : '비활성'}
    </button>
  )
}

const s: Record<string, React.CSSProperties> = {
  err:        { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13 },
  ok:         { background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 13 },
  tableWrap:  { display: 'flex', flexDirection: 'column', gap: 2 },
  row:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', borderBottom: '1px solid #f3f4f6' },
  addRow:     { display: 'flex', gap: 8, marginTop: 10 },
  input:      { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' },
  btn:        { padding: '8px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500, flexShrink: 0 },
  btnOff:     { padding: '8px 16px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'not-allowed', flexShrink: 0 },
  purposeTag: { marginLeft: 6, padding: '1px 6px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: 4, fontSize: 10 },
  empty:      { fontSize: 13, color: '#9ca3af', margin: '4px 0' },
  kpi:        { flex: 1, background: '#f9fafb', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 },
  kpiLabel:   { fontSize: 10, color: '#9ca3af', fontWeight: 500 },
  kpiVal:     { fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
}
