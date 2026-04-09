import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCustomerLedger } from '@/actions/ledger'
import { formatKRW } from '@/lib/calc'
import { createSupabaseServer } from '@/lib/supabase-server'
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
}: {
  params: { id: string }
}) {
  const { id } = params
  const result = await getCustomerLedger(id)

  if (!result.success || !result.data) notFound()

  const { rows, summary } = result.data

  // 최근 행동 → 결과 로그 (7일 이내, 최대 5건)
  const supabase = await createSupabaseServer()
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: actionLogs } = await supabase
    .from('action_logs')
    .select('id, action_type, triggered_message, result_type, result_amount, result_at, created_at, conversion_status')
    .eq('customer_id', id)
    .gte('created_at', since7d)
    .order('created_at', { ascending: false })
    .limit(5)

  // 각 action_log에 연결된 통화 결과(outcome) 조회
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
      {/* 헤더 */}
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

      {/* 요약 카드 */}
      <div style={s.summaryRow}>
        <div style={s.card}>
          <span style={s.cardLabel}>총 매출</span>
          <span style={s.cardVal}>{formatKRW(summary.total_orders)}</span>
        </div>
        <div style={s.card}>
          <span style={s.cardLabel}>총 수금</span>
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

      {/* 최근 행동 → 결과 */}
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
                {/* 전화 시도에만 통화 결과 버튼 표시 */}
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

      {/* 원장 테이블 */}
      {rows.length === 0 ? (
        <div style={s.empty}>거래 내역이 없습니다.</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>날짜</th>
                <th style={s.th}>구분</th>
                <th style={s.th}>내역</th>
                <th style={{ ...s.th, textAlign: 'right' }}>공급가</th>
                <th style={{ ...s.th, textAlign: 'right' }}>부가세</th>
                <th style={{ ...s.th, textAlign: 'right' }}>주문금액</th>
                <th style={{ ...s.th, textAlign: 'right' }}>수금액</th>
                <th style={{ ...s.th, textAlign: 'right' }}>잔액</th>
              </tr>
            </thead>
            <tbody>
              {/* 기초잔액 행 */}
              {summary.opening_balance !== 0 && (
                <tr style={s.openingRow}>
                  <td style={s.td} colSpan={7}>
                    <span style={s.typeBadgeGray}>기초잔액</span>
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <span style={s.balNum}>{formatKRW(summary.opening_balance)}</span>
                  </td>
                </tr>
              )}

              {rows.map((row) => (
                <tr
                  key={row.id}
                  style={row.type === 'payment' ? s.paymentRow : s.orderRow}
                >
                  <td style={s.td}>
                    <span style={s.date}>{row.date}</span>
                  </td>
                  <td style={s.td}>
                    {row.type === 'order' ? (
                      <span style={s.typeBadgeBlue}>판매</span>
                    ) : (
                      <span style={s.typeBadgeGreen}>
                        수금 · {METHOD_LABEL[row.payment_method ?? ''] ?? row.payment_method}
                      </span>
                    )}
                  </td>
                  <td style={s.td}>
                    <div>
                      {row.type === 'order' ? (
                        <>
                          <span style={s.summary}>{row.summary}</span>
                          {row.order_number && (
                            <span style={s.orderNum}> {row.order_number}</span>
                          )}
                        </>
                      ) : (
                        <span style={s.summary}>-</span>
                      )}
                      {row.memo && <div style={s.memo}>{row.memo}</div>}
                    </div>
                  </td>
                  {/* 공급가 */}
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    {row.type === 'order' && (
                      <span style={s.num}>
                        {row.total_supply_price?.toLocaleString()}
                      </span>
                    )}
                  </td>
                  {/* 부가세 */}
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    {row.type === 'order' && (
                      <span style={s.num}>
                        {row.total_vat_amount?.toLocaleString()}
                      </span>
                    )}
                  </td>
                  {/* 주문금액 */}
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    {row.type === 'order' && (
                      <span style={s.numBold}>
                        {formatKRW(row.total_amount ?? 0)}
                      </span>
                    )}
                  </td>
                  {/* 수금액 */}
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    {row.type === 'payment' && (
                      <span style={{ ...s.numBold, color: '#16A34A' }}>
                        {formatKRW(row.payment_amount ?? 0)}
                      </span>
                    )}
                  </td>
                  {/* 누적잔액 */}
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <span style={{
                      ...s.balNum,
                      color: row.running_balance > 0 ? '#DC2626' : '#16A34A',
                    }}>
                      {formatKRW(row.running_balance)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '32px 24px 60px' },
  header: {
    display: 'flex', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 24,
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
  empty: { textAlign: 'center', padding: '60px 0', color: '#9ca3af', fontSize: 14 },
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
}