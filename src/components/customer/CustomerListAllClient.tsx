'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import CustomerDeleteButton from '@/components/customer/CustomerDeleteButton'
import SmsModal, { type SmsCustomer } from '@/components/sms/SmsModal'
import { formatKRW } from '@/lib/calc'
import { formatPaymentTerms } from '@/lib/payment-terms'
import type { CustomerListItem } from '@/actions/customer-query'

const TYPE_LABEL: Record<string, string> = {
  business: '사업자', individual: '개인', prospect: '예비',
}
const STATUS_CFG: Record<string, { label: string; color: string }> = {
  active:   { label: '거래중',   color: '#15803D' },
  inactive: { label: '거래중단', color: '#6b7280' },
  lead:     { label: '잠재',     color: '#1D4ED8' },
}

interface Props {
  customers: CustomerListItem[]
  totalCount: number
  q?: string
  type?: string
  status?: string
  safeActive: boolean
}

function buildQuery(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v)
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export default function CustomerListAllClient({
  customers,
  totalCount,
  q,
  type,
  status,
  safeActive,
}: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [smsTargets, setSmsTargets] = useState<SmsCustomer[] | null>(null)

  const selectable = useMemo(
    () => customers.filter((c) => (c.phone ?? '').trim()),
    [customers],
  )

  const allSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.id))

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectable.map((c) => c.id)))
    }
  }

  function openBulkSms() {
    const targets = customers
      .filter((c) => selected.has(c.id) && c.phone)
      .map((c) => ({ id: c.id, name: c.name, phone: c.phone! }))
    if (targets.length === 0) return
    setSmsTargets(targets)
  }

  const safeHref = safeActive
    ? `/customers/all${buildQuery({ q, type, status })}`
    : `/customers/all${buildQuery({ q, type, status, safe: '1' })}`

  return (
    <>
      <form method="get" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input name="q" defaultValue={q} placeholder="거래처명 · 전화번호 검색"
          style={{ ...s.input, flex: 1, minWidth: 200 }} />
        <select name="type" defaultValue={type ?? ''} style={s.select}>
          <option value="">전체 유형</option>
          <option value="business">사업자</option>
          <option value="individual">개인</option>
          <option value="prospect">예비</option>
        </select>
        <select name="status" defaultValue={status ?? ''} style={s.select}>
          <option value="">전체 상태</option>
          <option value="active">거래중</option>
          <option value="inactive">거래중단</option>
          <option value="lead">잠재</option>
        </select>
        {safeActive && <input type="hidden" name="safe" value="1" />}
        <button type="submit" style={s.searchBtn}>검색</button>
        <Link href="/customers/all" style={s.resetBtn}>초기화</Link>
      </form>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Link
          href={safeHref}
          style={{
            ...s.chip,
            background: safeActive ? '#0f766e' : '#fff',
            color: safeActive ? '#fff' : '#374151',
            borderColor: safeActive ? '#0f766e' : '#d1d5db',
          }}
        >
          안심번호
        </Link>
        {selected.size > 0 && (
          <button type="button" onClick={openBulkSms} style={s.bulkBtn}>
            문자 발송 ({selected.size}명)
          </button>
        )}
      </div>

      {customers.length === 0 && (
        <p style={{ color: '#9ca3af', fontSize: 14 }}>거래처가 없습니다.</p>
      )}

      {customers.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
              <th style={th}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={selectable.length === 0}
                  aria-label="전체 선택"
                />
              </th>
              {['거래처명', '유형', '연락처', '결제조건', '목표월매출', '상태', ''].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => {
              const st = STATUS_CFG[c.trade_status] ?? STATUS_CFG.active
              const terms = formatPaymentTerms(c.payment_terms_type, c.payment_day ?? c.payment_terms_days)
              const hasPhone = !!(c.phone ?? '').trim()
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={td}>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleOne(c.id)}
                      disabled={!hasPhone}
                      aria-label={`${c.name} 선택`}
                    />
                  </td>
                  <td style={{ ...td, fontWeight: 500 }}>{c.name}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{TYPE_LABEL[c.customer_type] ?? '-'}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{c.phone ?? '-'}</td>
                  <td style={td}>{terms}</td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>
                    {c.target_monthly_revenue ? formatKRW(c.target_monthly_revenue) : '-'}
                  </td>
                  <td style={td}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: st.color }}>{st.label}</span>
                  </td>
                  <td style={{ ...td, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {hasPhone && (
                      <button
                        type="button"
                        onClick={() => setSmsTargets([{ id: c.id, name: c.name, phone: c.phone! }])}
                        style={s.smsBtn}
                      >
                        문자
                      </button>
                    )}
                    <Link href={`/customers/${c.id}/edit`} style={s.editBtn}>수정</Link>
                    <CustomerDeleteButton customerId={c.id} customerName={c.name} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 12 }}>
        전체 {totalCount}개 · 표시 {customers.length}개
      </p>

      {smsTargets && (
        <SmsModal
          customers={smsTargets}
          onClose={() => setSmsTargets(null)}
          onDone={() => {
            setSmsTargets(null)
            setSelected(new Set())
            router.refresh()
          }}
        />
      )}
    </>
  )
}

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left' }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const s: Record<string, React.CSSProperties> = {
  input:     { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none' },
  select:    { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' },
  searchBtn: { padding: '8px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  resetBtn:  { padding: '8px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#6b7280', textDecoration: 'none' },
  chip:      { padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 20, fontSize: 12, fontWeight: 600, textDecoration: 'none' },
  bulkBtn:   { padding: '8px 16px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  smsBtn:    { padding: '4px 10px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, fontSize: 12, color: '#0f766e', cursor: 'pointer', fontWeight: 600 },
  editBtn:   { padding: '4px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, color: '#374151', textDecoration: 'none' },
}
