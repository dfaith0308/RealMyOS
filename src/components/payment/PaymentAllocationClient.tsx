'use client'

import { useMemo, useState, useTransition } from 'react'
import { Surface } from '@/components/ui/Surface'
import { DataCell, DataTableRow } from '@/components/ui/DataTableRow'
import { formatKRW } from '@/lib/calc'
import type {
  OpenOrderForAllocation,
  PaymentAllocationRow,
  PaymentDetail,
} from '@/actions/payment'
import {
  addPaymentAllocation,
  allocatePaymentFifo,
  voidPaymentAllocation,
} from '@/actions/payment'
import styles from './PaymentAllocationClient.module.css'

export default function PaymentAllocationClient({
  payment,
  allocations,
  openOrders,
}: {
  payment: PaymentDetail
  allocations: PaymentAllocationRow[]
  openOrders: OpenOrderForAllocation[]
}) {
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [amountByOrder, setAmountByOrder] = useState<Record<string, string>>({})

  const activeAllocated = useMemo(() => {
    return allocations
      .filter((a) => a.status === 'active')
      .reduce((s, a) => s + a.allocated_amount, 0)
  }, [allocations])

  const remaining = payment.amount - activeAllocated

  function runFifo() {
    setErr(null)
    startTransition(async () => {
      const r = await allocatePaymentFifo(payment.id)
      if (!r.success) setErr(r.error ?? 'FIFO 배분 실패')
      // 페이지 refresh는 server revalidate에 맡김
      window.location.reload()
    })
  }

  function allocateToOrder(order_id: string) {
    setErr(null)
    const raw = (amountByOrder[order_id] ?? '').replace(/,/g, '').trim()
    const amt = raw.length > 0 ? Number(raw) : 0
    if (!amt || !Number.isFinite(amt) || amt <= 0 || !Number.isInteger(amt)) {
      setErr('배분 금액은 양의 정수여야 합니다.')
      return
    }
    startTransition(async () => {
      const r = await addPaymentAllocation({
        payment_id: payment.id,
        order_id,
        allocated_amount: amt,
      })
      if (!r.success) setErr(r.error ?? '배분 실패')
      window.location.reload()
    })
  }

  function voidAlloc(id: string) {
    setErr(null)
    startTransition(async () => {
      const r = await voidPaymentAllocation({ allocation_id: id, reason: 'manual_void' })
      if (!r.success) setErr(r.error ?? '비활성화 실패')
      window.location.reload()
    })
  }

  return (
    <div className={styles.root}>
      <Surface variant="panel" density="comfortable">
        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <div className={styles.kpiLabel}>수금액</div>
            <div className={[styles.kpiValue, styles.kpiValueGood].join(' ')}>
              {formatKRW(payment.amount)}
            </div>
          </div>
          <div className={styles.kpi}>
            <div className={styles.kpiLabel}>배분 합계(활성)</div>
            <div className={styles.kpiValue}>{formatKRW(activeAllocated)}</div>
          </div>
          <div className={styles.kpi}>
            <div className={styles.kpiLabel}>미배분</div>
            <div
              className={[
                styles.kpiValue,
                remaining > 0 ? styles.kpiValueWarn : '',
              ].join(' ')}
            >
              {formatKRW(Math.max(0, remaining))}
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <div className={styles.note}>
            FIFO 자동 배분은 미수 주문을 주문일 순으로 채웁니다. (배분은 수금액 기준)
          </div>
          <button
            type="button"
            className={[styles.btn, styles.btnPrimary].join(' ')}
            onClick={runFifo}
            disabled={isPending || payment.status !== 'confirmed'}
          >
            주문에 분배(FIFO)
          </button>
        </div>

        {err ? <div className={styles.err}>{err}</div> : null}
      </Surface>

      <Surface variant="panel" density="comfortable">
        <div className={styles.sectionTitle}>현재 배분 내역</div>
        <div className={styles.muted}>
          {allocations.length}건 (활성 {allocations.filter((a) => a.status === 'active').length}건)
        </div>

        {allocations.length === 0 ? (
          <div className={styles.muted} style={{ paddingTop: 8 }}>
            배분 내역이 없습니다.
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--ds-border-subtle)', marginTop: 8 }}>
            {allocations.map((a) => (
              <DataTableRow key={a.id} density="compact">
                <DataCell>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{a.order_date}</div>
                    <div className={styles.rowSub}>주문 {formatKRW(a.order_amount)}</div>
                  </div>
                </DataCell>
                <DataCell align="end">
                  <div className={styles.amt}>
                    <span className={styles.amtStrong}>{formatKRW(a.allocated_amount)}</span>{' '}
                    <span className={styles.amtDim}>· {a.status}</span>
                  </div>
                </DataCell>
                <DataCell align="end">
                  {a.status === 'active' ? (
                    <button
                      type="button"
                      className={styles.dangerBtn}
                      onClick={() => voidAlloc(a.id)}
                      disabled={isPending}
                    >
                      비활성화
                    </button>
                  ) : (
                    <span className={styles.muted}>-</span>
                  )}
                </DataCell>
              </DataTableRow>
            ))}
          </div>
        )}
      </Surface>

      <Surface variant="panel" density="comfortable">
        <div className={styles.sectionTitle}>미수 주문에 수동 배분</div>
        <div className={styles.note}>
          주문별로 “추가 배분”을 입력해 누적 배분합니다. (합계 ≤ 미배분, 주문 미수 ≤ 잔액)
        </div>

        {openOrders.length === 0 ? (
          <div className={styles.muted} style={{ paddingTop: 8 }}>
            미수 주문이 없습니다.
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--ds-border-subtle)', marginTop: 8 }}>
            {openOrders.map((o) => (
              <DataTableRow key={o.order_id} density="compact">
                <DataCell>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{o.order_date}</div>
                    <div className={styles.rowSub}>
                      미수 {formatKRW(o.remaining)} (주문 {formatKRW(o.order_amount)} · 기배분{' '}
                      {formatKRW(o.already_allocated)})
                    </div>
                  </div>
                </DataCell>
                <DataCell align="end">
                  <input
                    className={styles.input}
                    inputMode="numeric"
                    placeholder="0"
                    value={amountByOrder[o.order_id] ?? ''}
                    onChange={(e) =>
                      setAmountByOrder((p) => ({ ...p, [o.order_id]: e.target.value }))
                    }
                    disabled={isPending || payment.status !== 'confirmed'}
                    aria-label="배분 금액"
                  />
                </DataCell>
                <DataCell align="end">
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => allocateToOrder(o.order_id)}
                    disabled={isPending || payment.status !== 'confirmed'}
                  >
                    배분
                  </button>
                </DataCell>
              </DataTableRow>
            ))}
          </div>
        )}
      </Surface>
    </div>
  )
}

