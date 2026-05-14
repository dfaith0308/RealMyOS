'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import {
  confirmCommerceAllocation,
  createSupplierPayableFromAllocation,
} from '@/actions/admin/commerce-allocation'
import { cancelSupplierPayable } from '@/actions/admin/commerce-reversal'
import type { CommerceAllocationListRow, SupplierPayableSummaryRow } from '@/actions/admin/commerce-allocation'
import { formatKRW } from '@/lib/calc'
import s from '@/app/(admin)/admin-shared.module.css'

type StatusTab = 'all' | 'pending' | 'confirmed' | 'cancelled'

export default function CommerceAllocationsClient({
  status,
  summaries,
  rows,
}: {
  status: StatusTab
  summaries: SupplierPayableSummaryRow[]
  rows: CommerceAllocationListRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  const [payableCancelId, setPayableCancelId] = useState<string | null>(null)
  const [payableCancelReason, setPayableCancelReason] = useState('')

  const hrefFor = useCallback((st: StatusTab) => (st === 'all' ? '/admin/commerce/allocations' : `/admin/commerce/allocations?status=${st}`), [])

  const onConfirm = useCallback(
    (id: string) => {
      setError(null)
      setWarn(null)
      startTransition(async () => {
        const r = await confirmCommerceAllocation(id)
        if (!r.success) {
          setError(r.error ?? '확정 실패')
          return
        }
        if (r.data?.payable_error) {
          setWarn(`allocation은 확정되었으나 supplier 원장 생성 실패(아래 재시도): ${r.data.payable_error}`)
        }
        router.refresh()
      })
    },
    [router],
  )

  const onRetryPayable = useCallback(
    (id: string) => {
      setError(null)
      setWarn(null)
      startTransition(async () => {
        const r = await createSupplierPayableFromAllocation(id)
        if (!r.success) {
          setError(r.error ?? '원장 재시도 실패')
          return
        }
        router.refresh()
      })
    },
    [router],
  )

  const openPayableCancel = useCallback((payableId: string) => {
    setError(null)
    setWarn(null)
    setPayableCancelReason('')
    setPayableCancelId(payableId)
  }, [])

  const submitPayableCancel = useCallback(() => {
    const pid = payableCancelId
    if (!pid) return
    const reason = payableCancelReason.trim()
    if (!reason) {
      setError('역처리 사유를 입력해 주세요')
      return
    }
    setError(null)
    setWarn(null)
    startTransition(async () => {
      const r = await cancelSupplierPayable(pid, reason)
      if (!r.success) {
        setError(r.error ?? '역처리 실패')
        return
      }
      setPayableCancelId(null)
      setPayableCancelReason('')
      router.refresh()
    })
  }, [payableCancelId, payableCancelReason, router])

  return (
    <>
      {error ? (
        <p className={s.subtitle} style={{ color: 'var(--ds-text-danger, #b91c1c)' }}>
          {error}
        </p>
      ) : null}
      {warn ? (
        <p className={s.subtitle} style={{ color: 'var(--ds-text-warning, #b45309)' }}>
          {warn}
        </p>
      ) : null}

      <nav className={s.actionsRow} style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        {(
          [
            ['all', '전체'],
            ['pending', '지급 예정(pending)'],
            ['confirmed', '지급 예정 확정'],
            ['cancelled', '취소됨'],
          ] as const
        ).map(([key, label]) => (
          <a key={key} href={hrefFor(key)} className={status === key ? s.primaryBtn : s.ghostBtn} style={{ fontSize: 12, padding: '6px 12px' }}>
            {label}
          </a>
        ))}
      </nav>

      <section className={s.panel} style={{ marginBottom: 16 }}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>공급자별 지급 예정 합계</h2>
          <span className={s.inlineMuted}>최대 25,000 allocation 행 기준 집계 · 지급 실행 없음</span>
        </div>
        {summaries.length === 0 ? (
          <div className={s.empty}>집계할 allocation 이 없습니다</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  <th className={s.th}>공급자</th>
                  <th className={s.th}>pending 합계</th>
                  <th className={s.th}>확정 합계</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((r) => (
                  <tr key={r.supplier_tenant_id}>
                    <td className={s.td}>
                      <div className={s.cellStrong}>{r.supplier_name ?? '—'}</div>
                      <div className={s.cellMutedSm}>{r.supplier_tenant_id}</div>
                    </td>
                    <td className={s.td}>{formatKRW(r.pending_payable)}</td>
                    <td className={s.td}>{formatKRW(r.confirmed_payable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>품목별 allocation</h2>
          <span className={s.inlineMuted}>PLATFORM-ERP-P2-001 · 확정 시 supplier_payables 원장(PLATFORM-ERP-P2-003)</span>
        </div>
        {rows.length === 0 ? (
          <div className={s.empty}>표시할 행이 없습니다</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  <th className={s.th}>주문</th>
                  <th className={s.th}>품목행</th>
                  <th className={s.th}>공급자</th>
                  <th className={s.th}>품목액</th>
                  <th className={s.th}>플랫폼 수수료</th>
                  <th className={s.th}>공급자 지급예정</th>
                  <th className={s.th}>상태</th>
                  <th className={s.th}>supplier 원장</th>
                  <th className={s.th}>취소일시</th>
                  <th className={s.th}>취소처리자</th>
                  <th className={s.th}>회계(P0)</th>
                  <th className={s.th}>액션</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className={s.tdNowrap}>
                      <div className={s.cellStrong}>{r.order_number ?? '—'}</div>
                      <div className={s.cellMutedSm}>{r.commerce_order_id}</div>
                    </td>
                    <td className={s.td}>
                      <div className={s.cellMutedSm}>{r.commerce_order_item_id}</div>
                    </td>
                    <td className={s.td}>
                      <div className={s.cellStrong}>{r.supplier_name ?? '—'}</div>
                      <div className={s.cellMutedSm}>{r.supplier_tenant_id}</div>
                    </td>
                    <td className={s.td}>{formatKRW(r.item_amount)}</td>
                    <td className={s.td}>{formatKRW(r.platform_fee_amount)}</td>
                    <td className={s.td}>{formatKRW(r.supplier_payable_amount)}</td>
                    <td className={s.td}>{r.status}</td>
                    <td className={s.td}>
                      {r.supplier_payable_id ? (
                        <>
                          <div className={s.cellStrong}>연결됨</div>
                          <div className={s.cellMutedSm}>{r.supplier_payable_id}</div>
                          <div className={s.cellMutedSm}>{r.supplier_payable_status ?? ''}</div>
                        </>
                      ) : r.status === 'confirmed' ? (
                        <div className={s.cellStrong} style={{ color: 'var(--ds-text-warning, #b45309)' }}>
                          미생성
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={s.tdNowrap}>
                      {r.cancelled_at ? (
                        <>
                          <div className={s.cellMutedSm}>{r.cancelled_at}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={s.td}>
                      {r.cancelled_by ? (
                        <>
                          <div className={s.cellStrong}>{r.cancelled_by_display ?? '—'}</div>
                          <div className={s.cellMutedSm}>{r.cancelled_by}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={s.td}>
                      <div className={s.cellMutedSm}>{r.order_has_payment_reversal ? '입금 reversal 행 있음' : '—'}</div>
                      {r.supplier_payable_status === 'paid' ? (
                        <div className={s.cellMutedSm} style={{ marginTop: 4, color: 'var(--ds-text-warning, #b45309)' }}>
                          payable 지급됨 · 수동 검토
                        </div>
                      ) : null}
                      {r.supplier_payable_status === 'cancelled' ? (
                        <div className={s.cellMutedSm} style={{ marginTop: 4 }}>
                          payable 취소됨
                        </div>
                      ) : null}
                    </td>
                    <td className={s.td}>
                      {r.status === 'pending' ? (
                        <button type="button" className={s.primaryBtn} disabled={pending} onClick={() => onConfirm(r.id)}>
                          지급 예정 확정
                        </button>
                      ) : r.status === 'confirmed' && !r.supplier_payable_id ? (
                        <button type="button" className={s.ghostBtn} disabled={pending} onClick={() => onRetryPayable(r.id)}>
                          원장 연결 재시도
                        </button>
                      ) : r.status === 'confirmed' && r.supplier_payable_id && r.supplier_payable_status === 'unpaid' ? (
                        <button type="button" className={s.ghostBtn} disabled={pending} onClick={() => openPayableCancel(r.supplier_payable_id!)}>
                          수동 역처리
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {payableCancelId ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="payable-reversal-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 16,
          }}
          onClick={() => !pending && setPayableCancelId(null)}
        >
          <div className={s.kpiCard} style={{ maxWidth: 440, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 id="payable-reversal-title" className={s.title} style={{ fontSize: 16 }}>
              supplier payable 수동 역처리
            </h3>
            <p className={s.subtitle} style={{ marginTop: 10 }}>
              unpaid payable만 취소 처리됩니다. 사유는 admin_logs에 기록됩니다.
            </p>
            <label className={s.subtitle} style={{ display: 'block', marginTop: 12, fontWeight: 700 }}>
              사유
            </label>
            <textarea
              className={s.input}
              rows={3}
              value={payableCancelReason}
              disabled={pending}
              onChange={(e) => setPayableCancelReason(e.target.value)}
              style={{ width: '100%', marginTop: 6, resize: 'vertical' }}
            />
            <div className={s.actionsRow} style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" className={s.ghostBtn} disabled={pending} onClick={() => setPayableCancelId(null)}>
                닫기
              </button>
              <button type="button" className={s.primaryBtn} disabled={pending} onClick={() => submitPayableCancel()}>
                역처리 실행
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
