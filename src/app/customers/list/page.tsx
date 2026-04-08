import Link from 'next/link'
import CustomerBulkUpload from '@/components/customer/CustomerBulkUpload'
import { getCustomerList } from '@/actions/customer-query'
import { formatKRW } from '@/lib/calc'
import { formatPaymentTerms } from '@/lib/payment-terms'

export const metadata = { title: '거래처 목록 — RealMyOS' }

const TYPE_LABEL: Record<string, string> = {
  business: '사업자', individual: '개인', prospect: '예비',
}
const STATUS_CFG: Record<string, { label: string; color: string }> = {
  active:   { label: '거래중',   color: '#15803D' },
  inactive: { label: '거래중단', color: '#6b7280' },
  lead:     { label: '잠재',     color: '#1D4ED8' },
}

export default async function CustomerListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>
}) {
  const { q, type, status } = await searchParams
  const result = await getCustomerList()
  const all = result.data ?? []

  const filtered = all.filter((c) => {
    if (q && !c.name.includes(q) && !(c.phone ?? '').includes(q)) return false
    if (type && c.customer_type !== type) return false
    if (status && c.trade_status !== status) return false
    return true
  })

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>거래처 목록</h1>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0' }}>
            전체 {all.length}개 · 표시 {filtered.length}개
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/customers" style={s.subBtn}>← 행동 대시보드</Link>
          <Link href="/customers/new" style={s.newBtn}>+ 거래처 등록</Link>
        </div>
      </div>

      {/* 대량등록 */}
      <div style={{ marginBottom: 16 }}>
        <CustomerBulkUpload />
      </div>

      <form method="get" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
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
        <button type="submit" style={s.searchBtn}>검색</button>
        <Link href="/customers/all" style={s.resetBtn}>초기화</Link>
      </form>

      {filtered.length === 0 && (
        <p style={{ color: '#9ca3af', fontSize: 14 }}>거래처가 없습니다.</p>
      )}

      {filtered.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
              {['거래처명', '유형', '연락처', '결제조건', '목표월매출', '상태', ''].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const st = STATUS_CFG[c.trade_status] ?? STATUS_CFG.active
              const terms = formatPaymentTerms(c.payment_terms_type, c.payment_day ?? c.payment_terms_days)
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
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
                  <td style={td}>
                    <Link href={`/customers/${c.id}/edit`} style={s.editBtn}>수정</Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </main>
  )
}

const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280' }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const s: Record<string, React.CSSProperties> = {
  subBtn:    { padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, color: '#374151', textDecoration: 'none' },
  newBtn:    { padding: '8px 16px', background: '#111827', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' },
  input:     { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none' },
  select:    { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' },
  searchBtn: { padding: '8px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  resetBtn:  { padding: '8px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#6b7280', textDecoration: 'none' },
  editBtn:   { padding: '4px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, color: '#374151', textDecoration: 'none' },
}
