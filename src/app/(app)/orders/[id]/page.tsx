import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { Surface } from '@/components/ui/Surface'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { updateOrderStatus } from '@/actions/order'
import { DataCell, DataTableRow } from '@/components/ui/DataTableRow'
import { formatKRW } from '@/lib/calc'
import { ORDER_OPERATION_STATUS_LABEL, ORDER_OPERATION_STATUS_LIST, type OrderOperationStatus } from '@/types/order'

export const metadata = { title: '주문 상세 — RealMyOS' }

const FLOW: OrderOperationStatus[] = ORDER_OPERATION_STATUS_LIST

function nextStatus(s: OrderOperationStatus): OrderOperationStatus | null {
  const idx = FLOW.indexOf(s)
  if (idx < 0) return null
  if (s === '납품완료' || s === '취소') return null
  return FLOW[idx + 1] ?? null
}

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) notFound()

  const { data: orderRaw, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, order_date, customer_id, total_amount, status, order_status, memo,
      customers(name),
      order_lines(product_name, quantity, unit_price, line_total),
      order_logs(action, before_data, after_data, created_at)
    `)
    .eq('id', params.id)
    .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .is('deleted_at', null)
    .single()

  if (error || !orderRaw) notFound()
  const order: any = orderRaw

  const tradeStatusKey =
    order.status === 'draft'
      ? ('pending' as const)
      : order.status === 'confirmed'
        ? ('confirmed' as const)
        : ('cancelled' as const)

  const opStatus = (order.order_status ?? '접수') as OrderOperationStatus
  const next = nextStatus(opStatus)

  async function step() {
    'use server'
    if (!next) return
    await updateOrderStatus(order.id, next)
  }

  async function setTo(s: OrderOperationStatus) {
    'use server'
    await updateOrderStatus(order.id, s)
  }

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ds-text-muted)', marginBottom: 6 }}>
            <Link href="/orders" style={{ color: 'var(--ds-text-muted)', textDecoration: 'none' }}>주문</Link>
            {' / '}
            <span>상세</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>
            {(Array.isArray(order.customers) ? order.customers[0]?.name : order.customers?.name) ?? '-'}{' '}
            <span style={{ marginLeft: 10, fontFamily: 'monospace', fontSize: 12, fontWeight: 900, color: 'var(--ds-text-muted)' }}>
              #{order.order_number}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href={`/orders/${order.id}/edit`}
            style={{ padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#374151', textDecoration: 'none' }}
          >
            수정
          </Link>
        </div>
      </div>

      <Surface variant="panel" density="comfortable">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          {[
            { k: '주문일', v: order.order_date },
            { k: '총금액', v: formatKRW(order.total_amount) },
            { k: '거래상태(status)', v: order.status },
            { k: '주문상태(order_status)', v: ORDER_OPERATION_STATUS_LABEL[opStatus] ?? opStatus },
          ].map((x) => (
            <div key={x.k} style={{ border: '1px solid var(--ds-border-default)', borderRadius: 12, padding: '12px 14px', background: 'var(--ds-surface-panel)' }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--ds-text-muted)' }}>{x.k}</div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 900, color: 'var(--ds-text-primary)' }}>{x.v}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusBadge status={tradeStatusKey} size="sm" title="거래상태(status)" />
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ds-text-muted)' }}>
            운영 상태 전이:
          </span>

          {FLOW.map((s) => (
            <form key={s} action={async () => setTo(s)}>
              <button
                type="submit"
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: '1px solid var(--ds-border-default)',
                  background: opStatus === s ? 'var(--ds-brand-primary)' : 'var(--ds-surface-panel)',
                  color: opStatus === s ? 'var(--ds-text-inverse)' : 'var(--ds-text-primary)',
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                {s}
              </button>
            </form>
          ))}

          {next ? (
            <form action={step} style={{ marginLeft: 'auto' }}>
              <button
                type="submit"
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: '1px solid color-mix(in srgb, var(--ds-brand-primary) 30%, white)',
                  background: 'var(--ds-brand-primary)',
                  color: 'var(--ds-text-inverse)',
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                다음 단계 → {next}
              </button>
            </form>
          ) : null}
        </div>
      </Surface>

      <Surface variant="panel" density="comfortable" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--ds-text-secondary)', marginBottom: 8 }}>주문 상품</div>
        <div style={{ borderTop: '1px solid var(--ds-border-subtle)' }}>
          {(order.order_lines ?? []).map((l: any, idx: number) => (
            <DataTableRow key={`${l.product_name}-${idx}`} density="compact">
              <DataCell>
                <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--ds-text-primary)' }}>
                  {l.product_name}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ds-text-muted)' }}>
                  {l.quantity} × {formatKRW(l.unit_price)}
                </div>
              </DataCell>
              <DataCell align="end">
                <div style={{ fontSize: 12, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                  {formatKRW(l.line_total)}
                </div>
              </DataCell>
            </DataTableRow>
          ))}
        </div>
      </Surface>

      <Surface variant="panel" density="comfortable" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--ds-text-secondary)', marginBottom: 8 }}>변경 이력</div>
        <div style={{ borderTop: '1px solid var(--ds-border-subtle)' }}>
          {(order.order_logs ?? []).slice(0, 20).map((lg: any, idx: number) => (
            <DataTableRow key={`${lg.created_at}-${idx}`} density="compact">
              <DataCell>
                <div style={{ fontSize: 12, fontWeight: 900 }}>{lg.action}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ds-text-muted)' }}>
                  {String(lg.created_at).slice(0, 16).replace('T', ' ')}
                </div>
              </DataCell>
              <DataCell align="end" tone="muted">
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ds-text-muted)' }}>
                  {lg.after_data?.order_status ? `order_status → ${lg.after_data.order_status}` : ''}
                </div>
              </DataCell>
            </DataTableRow>
          ))}
        </div>
      </Surface>
    </main>
  )
}

