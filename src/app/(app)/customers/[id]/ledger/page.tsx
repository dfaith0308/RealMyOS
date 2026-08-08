import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCustomerLedger, getLedgerTaxInvoiceSummaries } from '@/actions/ledger'
import { formatKRW } from '@/lib/calc'
import { classifyAccountsReceivable } from '@/lib/ledger-calc'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import CallOutcomeButtons from '@/components/customer/CallOutcomeButtons'
import { Surface } from '@/components/ui/Surface'
import { KPIBlock } from '@/components/ui/KPIBlock'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CustomerLedgerFlowClient } from '@/components/ledger/CustomerLedgerFlowClient'
import LedgerStatementExportButtons from '@/components/ledger/LedgerStatementExportButtons'
import styles from './ledger-flow.module.css'

export const metadata = { title: '거래처 원장 — RealMyOS' }

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
  const methodSafe =
    payment_method === 'transfer' ||
    payment_method === 'cash' ||
    payment_method === 'card' ||
    payment_method === 'platform'
      ? payment_method
      : ''

  const [result, taxInvoiceResult] = await Promise.all([
    getCustomerLedger(id, {
      from,
      to,
      payment_method: methodSafe || undefined,
    }),
    getLedgerTaxInvoiceSummaries({
      from,
      to,
      payment_method: methodSafe || undefined,
      customer_id: id,
    }),
  ])

  if (!result.success || !result.data) notFound()

  const { rows, summary } = result.data

  const taxInvoice = taxInvoiceResult.success
    ? taxInvoiceResult.data?.[0] ?? null
    : null
  const taxableGoods = taxInvoice?.taxable_goods_amount ?? 0
  const exemptGoods = taxInvoice?.exempt_goods_amount ?? 0
  const goodsTotal = taxInvoice?.goods_total ?? 0
  const unallocated = taxInvoice?.unallocated_amount ?? 0

  const netFlow = (summary.total_payments ?? 0) - (summary.total_orders ?? 0)
  const lastPay = [...rows]
    .filter((r) => r.type === 'payment')
    .map((r) => r.date)
    .sort()
    .at(-1) ?? null
  const lastPayDays = lastPay
    ? Math.floor(
        (new Date(today + 'T00:00:00Z').getTime() - new Date(lastPay + 'T00:00:00Z').getTime()) /
          86400000,
      )
    : null
  const arDisplay = classifyAccountsReceivable(summary.current_balance)
  const badgeStatus =
    arDisplay.kind === 'receivable' ? ('warning' as const) : ('paid' as const)

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
    <main className={styles.page}>
      <Surface variant="panel" density="comfortable">
        <div className={styles.topbar}>
          <div className={styles.titleCol}>
            <Link href="/customers" className={styles.back}>
              ← 거래처 목록
            </Link>
            <h1 className={styles.title}>{summary.customer_name}</h1>
          </div>

          <div className={styles.ctaRow}>
            <Link href={`/customers/${id}`} className={styles.btn}>
              거래처 정보
            </Link>
            <Link href={`/customers/${id}/edit`} className={styles.btn}>
              거래처 수정
            </Link>
            <Link
              href={`/payments/new?customer_id=${id}`}
              className={[styles.btn, styles.btnPrimary].join(' ')}
            >
              수금 등록
            </Link>
            <Link href={`/payments?customer_id=${id}`} className={styles.btn}>
              수금 내역
            </Link>
            <LedgerStatementExportButtons customerId={id} from={from} to={to} />
          </div>
        </div>

        <div className={styles.kpiStrip}>
          <div className={styles.kpiBox}>
            <div className={styles.kpiHead}>
              <div className={styles.kpiHeadLabel}>{arDisplay.label}</div>
              {arDisplay.kind === 'prepayment' ? (
                <span
                  title={arDisplay.hint ?? undefined}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: arDisplay.color,
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: 999,
                    padding: '2px 8px',
                  }}
                >
                  초과입금
                </span>
              ) : (
                <StatusBadge status={badgeStatus} size="sm" />
              )}
            </div>
            <KPIBlock
              label={arDisplay.label}
              value={formatKRW(arDisplay.absolute)}
              valueSize="lg"
              align="end"
              hint={
                arDisplay.hint ??
                `최근 수금 ${lastPayDays === null ? '없음' : `D+${lastPayDays}`}`
              }
            />
          </div>

          <KPIBlock label="기간 매출" value={formatKRW(summary.total_orders)} align="end" />
          <KPIBlock label="기간 수금" value={formatKRW(summary.total_payments)} align="end" />
          <KPIBlock
            label="순흐름"
            value={netFlow >= 0 ? `+${formatKRW(netFlow)}` : `−${formatKRW(Math.abs(netFlow))}`}
            align="end"
          />
          <KPIBlock
            label="최근 수금"
            value={lastPayDays === null ? '없음' : `D+${lastPayDays}`}
            align="end"
          />
        </div>

        <div className={styles.kpiNote}>
          기간 {from} ~ {to}
        </div>
      </Surface>

      <Surface variant="panel" density="comfortable">
        <CustomerLedgerFlowClient
          customerId={id}
          initialFrom={from}
          initialTo={to}
          initialMethod={methodSafe as any}
          openingBalance={summary.opening_balance}
          rows={rows as any}
        />
      </Surface>

      <div className={styles.bottom}>
        <Surface variant="panel" density="comfortable">
          <div className={styles.detailsSummary}>세금계산서 요약 (수금 기준)</div>
          <div className={styles.detailsContent}>
            <div className={styles.kpiNote} style={{ marginBottom: 10 }}>
              기간 {from} ~ {to}
              {methodSafe
                ? ` · ${methodSafe === 'transfer' ? '무통장' : methodSafe === 'cash' ? '현금' : methodSafe === 'card' ? '카드' : methodSafe}`
                : ' · 전체 결제수단'}
            </div>
            <div className={styles.kpiStrip}>
              <KPIBlock label="과세금액" value={formatKRW(taxableGoods)} align="end" />
              <KPIBlock label="면세금액" value={formatKRW(exemptGoods)} align="end" />
              <KPIBlock label="합계" value={formatKRW(goodsTotal)} align="end" />
              <KPIBlock
                label="미배분"
                value={formatKRW(unallocated)}
                align="end"
                hint={unallocated > 0 ? '계산서 발행 전 배분 확인 필요' : undefined}
              />
            </div>
            {unallocated > 0 ? (
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 10px',
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#B91C1C',
                  fontWeight: 600,
                }}
              >
                미배분 수금 {formatKRW(unallocated)} — 허브 표와 동일 기준
              </div>
            ) : null}
          </div>
        </Surface>

        <Surface variant="panel" density="comfortable">
          <details>
            <summary className={styles.detailsSummary}>최근 행동 기록 (7일)</summary>
            <div className={styles.detailsContent}>
              {!actionLogs || actionLogs.length === 0 ? (
                <div className={styles.empty}>최근 기록이 없습니다</div>
              ) : (
                <div className={styles.smallList}>
                  {actionLogs.map((log: any) => {
                    const existingOutcome = outcomeByActionLog.get(log.id) ?? null
                    return (
                      <div key={log.id} className={styles.logRow}>
                        <div className={styles.logTop}>
                          <span className={styles.logType}>
                            {log.action_type === 'call'
                              ? '전화'
                              : log.action_type === 'collect'
                                ? '수금'
                                : '주문'}
                          </span>
                          <span className={styles.logMsg}>{log.triggered_message ?? '-'}</span>
                          {log.result_type !== 'none' ? (
                            <span className={styles.logBadge}>
                              {log.result_type === 'order_created' ? '주문' : '수금'}{' '}
                              {formatKRW(log.result_amount ?? 0)}
                            </span>
                          ) : null}
                          <span className={styles.logMeta}>
                            {new Date(log.created_at).toLocaleDateString('ko-KR', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>

                        {log.action_type === 'call' ? (
                          <CallOutcomeButtons
                            customerId={id}
                            actionLogId={log.id}
                            existingOutcome={existingOutcome}
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </details>
        </Surface>
      </div>
    </main>
  )
}
