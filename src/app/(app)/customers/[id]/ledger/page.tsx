import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCustomerLedger } from '@/actions/ledger'
import { formatKRW } from '@/lib/calc'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import CallOutcomeButtons from '@/components/customer/CallOutcomeButtons'

export const metadata = { title: '거래처 원장 — RealMyOS' }

const METHOD_LABEL: Record<string, string> = {
  transfer: '무통장',
  cash: '현금',
  card: '카드',
  platform: '플랫폼',
}

export default async function CustomerLedgerPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { from?: string; to?: string; payment_method?: string }
}) {
  const { id } = params

  const now        = new Date(Date.now() + 9 * 3600000)
  const today      = now.toISOString().slice(0, 10)
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`

  const from           = searchParams.from           ?? monthStart
  const to             = searchParams.to             ?? today
  const payment_method = searchParams.payment_method ?? ''

  const result = await getCustomerLedger(id, {
    from,
    to,
    payment_method: payment_method || undefined,
  })

  if (!result.success || !result.data) notFound()

  const { rows, summary, tax_summary } = result.data

  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) notFound()
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: actionLogs } = await supabase
    .from('action_logs')
    .select('id, action_type, triggered_message, result_type, result_amount, result_at, created_at, conversion_status')
    .eq('tenant_id', ctx.tenant_id)
    .eq('customer_id', id)
    .gte('created_at', since7d)
    .order('created_at', { ascending: false })
    .limit(5)

  const actionLogIds = (actionLogs ?? []).map((l: any) => l.id)
  const { data: outcomeMap } = actionLogIds.length > 0
    ? await supabase
        .from('contact_logs')
        .select('action_log_id, outcome')
        .in('action_log_id', actionLogIds)
        .not('outcome', 'is', null)
    : { data: [] }

  const outcomeByActionLog = new Map(
    (outcomeMap ?? []).map((o: any) => [o.action_log_id, o.outcome])
  )

  return (
    <main style={s.page}>
      <div style={s.header}>
        <div>
          <Link href="/customers" style={s.back}>← 거래처 목록</Link>
          <h1 style={s.title}>{summary.customer_name}</h1>
        </div>
        <div style={s.headerBtns}>
          <Link href={`/payments/new?customer_id=${id}`} style={s.subBtn}>수금 등록</Link>
          <Link href={`/payments?customer_id=${id}`} style={s.subBtn}>수금 내역</Link>
          <Link href="/orders/new" style={s.newBtn}>+ 주문 등록</Link>
        </div>
      </div>

      <form method="get" style={s.filterForm}>
        <label style={s.lb}>기간</label>
        <input type="date" name="from" defaultValue={from} style={s.input} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>~</span>
        <input type="date" name="to" defaultValue={to} style={s.input} />
        <label style={{ ...s.lb, marginLeft: 8 }}>결제수단</label>
        <select name="payment_method" defaultValue={payment_method} style={s.select}>
          <option value="">전체</option>
          <option value="transfer">무통장</option>
          <option value="cash">현금</option>
          <option value="card">카드</option>
          <option value="platform">플랫폼</option>
        </select>
        <button type="submit" style={s.searchBtn}>검색</button>
        <Link href={`/customers/${id}/ledger`} style={s.resetBtn}>초기화</Link>
      </form>

      <div style={s.summaryRow}>
        <div style={s.card}>
          <span style={s.cardLabel}>총 매출 (기간)</span>
          <span style={s.cardVal}>{formatKRW(summary.total_orders)}</span>
        </div>
        <div style={s.card}>
          <span style={s.cardLabel}>총 수금 (기간)</span>
          <span style={s.cardVal}>{formatKRW(summary.total_payments)}</span>
        </div>
        <div style={{ ...s.card, ...s.cardHighlight }}>
          <span style={s.cardLabel}>현재 미수금</span>
          <span style={{
            ...s.cardVal,
            color: summary.current_balance > 0 ? '#DC2626' : '#16A34A',
            fontSize: 20,
          }}>
            {formatKRW(summary.current_balance)}
          </span>
        </div>
      </div>

      {(tax_summary.taxable_paid > 0 || tax_summary.card_paid > 0 || tax_summary.invoice_amount > 0) && (
        <div style={s.taxBox}>
          <div style={s.taxTitle}>세금계산서 요약 (수금 기준, 기간)</div>
          <div style={s.taxGrid}>
            <div style={s.taxItem}>
              <div style={s.taxLabel}>과세합계</div>
              <div style={s.taxVal}>{formatKRW(tax_summary.taxable_paid)}</div>
            </div>
            <div style={s.taxItem}>
              <div style={s.taxLabel}>카드(계산서 제외)</div>
              <div style={s.taxVal}>{formatKRW(tax_summary.card_paid)}</div>
            </div>
            <div style={s.taxItem}>
              <div style={s.taxLabel}>계산서발행금액</div>
              <div style={s.taxValStrong}>{formatKRW(tax_summary.invoice_amount)}</div>
            </div>
          </div>
        </div>
      )}

      {actionLogs && actionLogs.length > 0 && (
        <div style={s.actionSection}>
          <div style={s.actionTitle}>최근 행동 기록 (7일)</div>
          {actionLogs.map((log: any) => {
            const existingOutcome = outcomeByActionLog.get(log.id) ?? null
            return (
              <div key={log.id} style={{ ...s.actionRow, flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: '100%' }}>
                  <span style={s.actionType}>
                    {log.action_type === 'call' ? '📞 전화' : log.action_type === 'collect' ? '💰 수금' : '📦 주문'}
                  </span>
                  <span style={s.actionMsg}>{log.triggered_message ?? '-'}</span>
                  {log.result_type !== 'none' ? (
                    <span style={s.resultBadge}>
                      → {log.result_type === 'order_created' ? '주문' : '수금'} {formatKRW(log.result_amount ?? 0)}
                    </span>
                  ) : (
                    <span style={s.noResult}>결과 없음</span>
                  )}
                  <span style={s.actionDate}>
                    {new Date(log.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                {log.action_type === 'call' && (
                  <CallOutcomeButtons
                    customerId={id}
                    actionLogId={log.id}
                    existingOutcome={existingOutcome}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>날짜</th>
              <th style={s.th}>유형</th>
              <th style={s.th}>상품명</th>
              <th style={{ ...s.th, textAlign: 'right' }}>공급가</th>
              <th style={{ ...s.th, textAlign: 'right' }}>부가세</th>
              <th style={{ ...s.th, textAlign: 'right' }}>합계</th>
              <th style={s.th}>결제수단</th>
              <th style={{ ...s.th, textAlign: 'right' }}>잔액</th>
            </tr>
          </thead>
          <tbody>
            <tr style={s.openingRow}>
              <td style={s.td} colSpan={7}>
                <span style={s.typeBadgeGray}>기초잔액</span>
              </td>
              <td style={{ ...s.td, textAlign: 'right' }}>
                <span style={{ ...s.balNum, color: summary.opening_balance > 0 ? '#DC2626' : '#16A34A' }}>
                  {formatKRW(summary.opening_balance)}
                </span>
              </td>
            </tr>

            {rows.length === 0 ? (
              <tr>
                <td style={s.td} colSpan={8}>
                  <div style={s.empty}>해당 기간 거래 내역이 없습니다.</div>
                </td>
              </tr>
            ) : rows.map((row) => {
              const isOrder = row.type === 'order'
              const totalAmount = isOrder ? (row.total_amount ?? 0) : -(row.payment_amount ?? 0)
              return (
                <tr
                  key={row.id}
                  style={isOrder ? s.orderRow : s.paymentRow}
                >
                  <td style={s.td}>
                    <span style={s.date}>{row.date}</span>
                  </td>
                  <td style={s.td}>
                    {isOrder ? (
                      <span style={s.typeBadgeBlue}>판매</span>
                    ) : (
                      <span style={s.typeBadgeGreen}>수금</span>
                    )}
                  </td>
                  <td style={s.td}>
                    <div>
                      {isOrder ? (
                        <>
                          <span style={s.summary}>{row.summary}</span>
                          {row.order_number && (
                            <span style={s.orderNum}> {row.order_number}</span>
                          )}
                        </>
                      ) : (
                        <span style={{ ...s.summary, color: '#9ca3af' }}>—</span>
                      )}
                      {row.memo && <div style={s.memo}>{row.memo}</div>}
                    </div>
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    {isOrder ? (
                      <span style={s.num}>{(row.total_supply_price ?? 0).toLocaleString()}</span>
                    ) : (
                      <span style={{ color: '#d1d5db' }}>—</span>
                    )}
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    {isOrder ? (
                      <span style={s.num}>{(row.total_vat_amount ?? 0).toLocaleString()}</span>
                    ) : (
                      <span style={{ color: '#d1d5db' }}>—</span>
                    )}
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <span style={{
                      ...s.numBold,
                      color: isOrder ? '#111827' : '#15803D',
                    }}>
                      {isOrder ? formatKRW(totalAmount) : `−${formatKRW(Math.abs(totalAmount))}`}
                    </span>
                  </td>
                  <td style={s.td}>
                    {isOrder ? (
                      <span style={{ color: '#d1d5db' }}>—</span>
                    ) : (
                      <span style={{ color: '#374151', fontSize: 12 }}>
                        {METHOD_LABEL[row.payment_method ?? ''] ?? row.payment_method ?? '—'}
                      </span>
                    )}
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <span style={{
                      ...s.balNum,
                      color: row.running_balance > 0 ? '#DC2626' : '#16A34A',
                    }}>
                      {formatKRW(row.running_balance)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '32px 24px 60px' },
  header: {
    display: 'flex', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 16,
  },
  back: { fontSize: 13, color: '#6b7280', textDecoration: 'none', display: 'block', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: 600, margin: 0 },
  headerBtns: { display: 'flex', gap: 8, alignItems: 'center' },
  subBtn: {
    padding: '9px 16px', background: '#fff',
    border: '1px solid #d1d5db', borderRadius: 8,
    fontSize: 13, color: '#374151', textDecoration: 'none',
  },
  newBtn: {
    padding: '9px 18px', background: '#111827',
    color: '#fff', borderRadius: 8,
    fontSize: 13, fontWeight: 500, textDecoration: 'none',
  },
  filterForm:  { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0 20px 0' },
  lb:          { fontSize: 12, color: '#6b7280' },
  input:       { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none' },
  select:      { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' },
  searchBtn:   { padding: '7px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  resetBtn:    { padding: '7px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#6b7280', textDecoration: 'none' },
  summaryRow: { display: 'flex', gap: 12, marginBottom: 24 },
  card: {
    flex: 1, padding: '16px 20px',
    background: '#fff', border: '1px solid #e5e7eb',
    borderRadius: 10, display: 'flex',
    flexDirection: 'column', gap: 6,
  },
  cardHighlight: { border: '1px solid #fca5a5', background: '#FFF5F5' },
  cardLabel: { fontSize: 11, color: '#6b7280', fontWeight: 500 },
  cardVal: { fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  taxBox: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
  taxTitle: { fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 10 },
  taxGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
  taxItem: { background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 10, padding: '10px 12px' },
  taxLabel: { fontSize: 11, color: '#6b7280', marginBottom: 6 },
  taxVal: { fontSize: 14, fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' },
  taxValStrong: { fontSize: 15, fontWeight: 800, color: '#111827', fontVariantNumeric: 'tabular-nums' },
  empty: { textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 14 },
  tableWrap: { border: '1px solid #e5e7eb', borderRadius: 10, overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    padding: '10px 14px', textAlign: 'left',
    fontSize: 11, fontWeight: 500, color: '#6b7280',
    background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap',
  },
  orderRow: { borderBottom: '1px solid #f3f4f6' },
  paymentRow: { borderBottom: '1px solid #f3f4f6', background: '#F0FDF4' },
  openingRow: { borderBottom: '1px solid #f3f4f6', background: '#fafafa' },
  td: { padding: '11px 14px', verticalAlign: 'middle' },
  date: { color: '#6b7280', fontSize: 12, whiteSpace: 'nowrap' },
  typeBadgeBlue: {
    display: 'inline-block', padding: '2px 8px',
    background: '#EFF6FF', color: '#1D4ED8',
    borderRadius: 12, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
  },
  typeBadgeGreen: {
    display: 'inline-block', padding: '2px 8px',
    background: '#F0FDF4', color: '#15803D',
    borderRadius: 12, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
  },
  typeBadgeGray: {
    display: 'inline-block', padding: '2px 8px',
    background: '#F3F4F6', color: '#6b7280',
    borderRadius: 12, fontSize: 11, fontWeight: 500,
  },
  summary: { color: '#111827' },
  orderNum: { color: '#9ca3af', fontSize: 11, fontFamily: 'monospace' },
  memo: { color: '#9ca3af', fontSize: 11, marginTop: 2 },
  num: { color: '#374151', fontVariantNumeric: 'tabular-nums' },
  numBold: { fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#111827' },
  balNum: { fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 14 },
  actionSection: { background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: 12, marginBottom: 16 },
  actionTitle:   { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  actionRow:     { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px dashed #e5e7eb' },
  actionType:    { fontSize: 12, color: '#374151', fontWeight: 500 },
  actionMsg:     { fontSize: 12, color: '#6b7280' },
  actionDate:    { fontSize: 11, color: '#9ca3af', marginLeft: 'auto' },
  resultBadge:   { fontSize: 11, color: '#15803D', background: '#F0FDF4', padding: '2px 8px', borderRadius: 999 },
  noResult:      { fontSize: 11, color: '#9ca3af' },
}
