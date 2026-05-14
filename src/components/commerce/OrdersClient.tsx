'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import {
  getCommerceOrderDetail,
  getCommerceOrderSupplierExportRows,
  updateCommerceOrderStatus,
  type CommerceOrderDetail,
  type CommerceOrderSummaryRow,
} from '@/actions/admin/commerce'
import {
  SUPPLIER_EXPORT_HEADERS,
  supplierExportFilename,
  supplierExportRowsToCsvString,
  triggerBrowserDownload,
} from '@/lib/commerce-order-supplier-export'
import type { CommerceOrderStatus } from '@/lib/commerce-constants'
import { formatKRW } from '@/lib/calc'
import s from '@/app/(admin)/admin-shared.module.css'

const PAYMENT_LABEL: Record<string, string> = {
  card: '카드',
  bank_transfer: '무통장',
  kakao_manual: '카카오',
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: '결제대기',
  paid: '결제완료',
  preparing: '준비중',
  shipped: '배송중',
  completed: '완료',
  cancelled: '취소',
  refunded: '환불완료',
}

function displayOrderNo(row: { order_number: string | null }) {
  const n = row.order_number?.trim()
  return n || '주문번호 미할당'
}

function formatElapsed(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return '방금 전'
  if (m < 60) return `${m}분 경과`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}시간 경과`
  const d = Math.floor(h / 24)
  return `${d}일 경과`
}

function formatOrderWhen(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export default function OrdersClient({
  manualReviewQueue,
  orders,
  filterNav,
}: {
  manualReviewQueue: CommerceOrderSummaryRow[]
  orders: CommerceOrderSummaryRow[]
  filterNav: ReactNode
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [exportPending, startExportTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CommerceOrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [paidCancelTarget, setPaidCancelTarget] = useState<CommerceOrderSummaryRow | null>(null)

  const refresh = useCallback(() => {
    router.refresh()
  }, [router])

  const exportOrderIds = useMemo(() => {
    const ids: string[] = []
    const seen = new Set<string>()
    for (const o of manualReviewQueue) {
      if (seen.has(o.id)) continue
      seen.add(o.id)
      ids.push(o.id)
    }
    for (const o of orders) {
      if (seen.has(o.id)) continue
      seen.add(o.id)
      ids.push(o.id)
    }
    return ids
  }, [manualReviewQueue, orders])

  const runSupplierExport = useCallback(
    (format: 'csv' | 'xlsx') => {
      setError(null)
      if (exportOrderIds.length === 0) {
        setError('보낼 주문이 없습니다. 목록을 확인한 뒤 다시 시도해 주세요.')
        return
      }
      startExportTransition(async () => {
        const res = await getCommerceOrderSupplierExportRows(exportOrderIds)
        if (!res.success) {
          setError(res.error ?? '보내기 실패')
          return
        }
        const rows = res.data?.rows ?? []
        if (rows.length === 0) {
          setError('보낼 품목 행이 없습니다. 새로고침 후 다시 시도해 주세요.')
          return
        }
        if (format === 'csv') {
          const csv = supplierExportRowsToCsvString(rows)
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
          triggerBrowserDownload(blob, supplierExportFilename('csv'))
          return
        }
        const XLSX = await import('xlsx')
        const ws = XLSX.utils.json_to_sheet(rows, { header: [...SUPPLIER_EXPORT_HEADERS] })
        ws['!cols'] = [
          { wch: 16 },
          { wch: 20 },
          { wch: 22 },
          { wch: 10 },
          { wch: 14 },
          { wch: 36 },
          { wch: 32 },
          { wch: 6 },
          { wch: 24 },
          { wch: 12 },
        ]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, '발주')
        const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
        const blob = new Blob([out], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        triggerBrowserDownload(blob, supplierExportFilename('xlsx'))
      })
    },
    [exportOrderIds],
  )

  const runStatus = useCallback(
    (order: CommerceOrderSummaryRow, next: CommerceOrderStatus) => {
      setError(null)
      startTransition(async () => {
        const r = await updateCommerceOrderStatus(order.id, next, order.status)
        if (!r.success) {
          setError(r.error ?? '처리 실패')
          return
        }
        refresh()
      })
    },
    [refresh],
  )

  useEffect(() => {
    if (!detailId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    getCommerceOrderDetail(detailId).then((res) => {
      if (cancelled) return
      setDetailLoading(false)
      if (!res.success) {
        setError(res.error ?? '상세 조회 실패')
        setDetail(null)
        return
      }
      setDetail(res.data?.order ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [detailId])

  return (
    <>
      {error ? (
        <p className={s.subtitle} style={{ color: 'var(--ds-text-danger, #b91c1c)', margin: 0 }}>
          {error}
        </p>
      ) : null}

      <div
        className={s.actionsRow}
        style={{ flexWrap: 'wrap', marginTop: 8, marginBottom: 12, alignItems: 'center', gap: 10 }}
      >
        <span style={{ fontSize: 12, color: 'var(--ds-text-secondary)' }}>공급자 전달</span>
        <button
          type="button"
          className={s.ghostBtn}
          disabled={exportPending || pending}
          onClick={() => runSupplierExport('csv')}
        >
          CSV 다운로드
        </button>
        <button
          type="button"
          className={s.ghostBtn}
          disabled={exportPending || pending}
          onClick={() => runSupplierExport('xlsx')}
        >
          XLSX 다운로드
        </button>
        <span style={{ fontSize: 12, color: 'var(--ds-text-secondary)' }}>
          현재 화면 주문 {exportOrderIds.length}건 · 품목당 1행
        </span>
      </div>

      <section
        className={s.kpiCard}
        style={{
          border: '2px solid color-mix(in srgb, var(--ds-brand-text) 35%, var(--ds-border-default))',
          background: 'color-mix(in srgb, var(--ds-brand-text) 6%, var(--ds-surface-panel))',
        }}
      >
        <h2 className={s.kpiTitle} style={{ fontSize: 15, color: 'var(--ds-text-primary)' }}>
          확인 필요
        </h2>
        <p className={s.subtitle} style={{ marginTop: 4, marginBottom: 12 }}>
          무통장·카카오 수동 확인 대기 (결제대기 · 오래된 순)
        </p>
        {manualReviewQueue.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ds-text-secondary)' }}>
            미처리 주문이 없습니다 ✓
          </p>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  <th className={s.th}>주문번호</th>
                  <th className={s.th}>식당명</th>
                  <th className={s.th}>금액</th>
                  <th className={s.th}>결제</th>
                  <th className={s.th}>경과</th>
                  <th className={s.th}>처리</th>
                </tr>
              </thead>
              <tbody>
                {manualReviewQueue.map((row) => (
                  <tr key={row.id}>
                    <td className={s.td}>
                      <div className={s.cellStrong}>{displayOrderNo(row)}</div>
                      <button
                        type="button"
                        className={s.ghostBtn}
                        style={{ marginTop: 6, fontSize: 11, padding: '4px 8px' }}
                        disabled={pending}
                        onClick={() => {
                          setError(null)
                          setDetailId(row.id)
                        }}
                      >
                        상세
                      </button>
                    </td>
                    <td className={s.td}>{row.tenant_name ?? '—'}</td>
                    <td className={s.td}>{formatKRW(row.total_amount)}</td>
                    <td className={s.td}>{PAYMENT_LABEL[row.payment_method] ?? row.payment_method}</td>
                    <td className={s.td}>{formatElapsed(row.created_at)}</td>
                    <td className={s.td}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {row.payment_method === 'bank_transfer' ? (
                          <button
                            type="button"
                            className={s.primaryBtn}
                            disabled={pending}
                            onClick={() => runStatus(row, 'paid')}
                          >
                            입금 확인 완료
                          </button>
                        ) : null}
                        {row.payment_method === 'kakao_manual' ? (
                          <button
                            type="button"
                            className={s.primaryBtn}
                            disabled={pending}
                            onClick={() => runStatus(row, 'paid')}
                          >
                            카카오 확인 완료
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={s.ghostBtn}
                          disabled={pending}
                          onClick={() => runStatus(row, 'cancelled')}
                        >
                          주문 취소
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: 20 }}>
        <h2 className={s.kpiTitle} style={{ fontSize: 14, marginBottom: 10 }}>
          전체 주문 목록
        </h2>
        {filterNav}
        {orders.length === 0 ? (
          <p style={{ marginTop: 14, fontSize: 14, color: 'var(--ds-text-secondary)' }}>
            처리할 주문이 없습니다
          </p>
        ) : (
          <div className={s.tableWrap} style={{ marginTop: 12 }}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  <th className={s.th}>주문번호</th>
                  <th className={s.th}>식당명</th>
                  <th className={s.th}>금액</th>
                  <th className={s.th}>결제</th>
                  <th className={s.th}>상태</th>
                  <th className={s.th}>주문일</th>
                  <th className={s.th}>액션</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((row) => (
                  <tr key={row.id}>
                    <td className={s.td}>
                      <div className={s.cellStrong}>{displayOrderNo(row)}</div>
                      <div className={s.cellMutedXs}>{row.items_count}개 품목</div>
                    </td>
                    <td className={s.td}>{row.tenant_name ?? '—'}</td>
                    <td className={s.td}>{formatKRW(row.total_amount)}</td>
                    <td className={s.td}>{PAYMENT_LABEL[row.payment_method] ?? row.payment_method}</td>
                    <td className={s.td}>{STATUS_LABEL[row.status] ?? row.status}</td>
                    <td className={s.tdNowrap}>{formatOrderWhen(row.created_at)}</td>
                    <td className={s.td}>
                      <OrderActions
                        order={row}
                        pending={pending}
                        onPaidCancelRequest={() => {
                          setError(null)
                          setPaidCancelTarget(row)
                        }}
                        onDetail={() => {
                          setError(null)
                          setDetailId(row.id)
                        }}
                        onTransition={runStatus}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {paidCancelTarget ? (
        <div
          role="dialog"
          aria-modal="true"
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
          onClick={() => !pending && setPaidCancelTarget(null)}
        >
          <div
            className={s.kpiCard}
            style={{ maxWidth: 420, width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={s.title} style={{ fontSize: 16 }}>
              결제 취소 확인
            </h3>
            <p className={s.subtitle} style={{ marginTop: 10 }}>
              결제된 주문을 취소합니다.
              <br />
              환불 처리가 필요합니다.
              <br />
              계속하시겠습니까?
            </p>
            <div className={s.actionsRow} style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className={s.ghostBtn}
                disabled={pending}
                onClick={() => setPaidCancelTarget(null)}
              >
                닫기
              </button>
              <button
                type="button"
                className={s.primaryBtn}
                disabled={pending}
                onClick={() => {
                  const t = paidCancelTarget
                  setPaidCancelTarget(null)
                  if (t) runStatus(t, 'cancelled')
                }}
              >
                취소 처리
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detailId ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 40,
            padding: 16,
          }}
          onClick={() => !detailLoading && setDetailId(null)}
        >
          <div
            className={s.kpiCard}
            style={{ maxWidth: 560, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={s.headerBetween} style={{ marginBottom: 8 }}>
              <h3 className={s.title} style={{ fontSize: 16 }}>
                주문 상세
              </h3>
              <button
                type="button"
                className={s.ghostBtn}
                disabled={detailLoading}
                onClick={() => setDetailId(null)}
              >
                닫기
              </button>
            </div>
            {detailLoading ? (
              <p className={s.subtitle}>불러오는 중…</p>
            ) : detail ? (
              <>
                <p className={s.subtitle}>
                  <strong>{displayOrderNo(detail)}</strong> ·{' '}
                  {STATUS_LABEL[detail.status]} · {PAYMENT_LABEL[detail.payment_method]}
                </p>
                <p className={s.subtitle} style={{ marginTop: 8 }}>
                  배송: {detail.shipping_name} / {detail.shipping_phone}
                  <br />
                  {detail.shipping_address}
                  {detail.delivery_memo ? (
                    <>
                      <br />
                      메모: {detail.delivery_memo}
                    </>
                  ) : null}
                </p>
                <div className={s.tableWrap} style={{ marginTop: 12 }}>
                  <table className={s.table}>
                    <thead>
                      <tr className={s.theadRow}>
                        <th className={s.th}>품목</th>
                        <th className={s.th}>수량</th>
                        <th className={s.th}>단가</th>
                        <th className={s.th}>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((it) => (
                        <tr key={it.id || it.listing_title}>
                          <td className={s.td}>{it.listing_title}</td>
                          <td className={s.td}>{it.quantity}</td>
                          <td className={s.td}>{formatKRW(it.unit_price)}</td>
                          <td className={s.td}>{formatKRW(it.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {detail.allocations && detail.allocations.length > 0 ? (
                  <div style={{ marginTop: 16 }}>
                    <h4 className={s.kpiTitle} style={{ fontSize: 13, marginBottom: 8 }}>
                      품목별 지급 예정 (allocation)
                    </h4>
                    <div className={s.tableWrap}>
                      <table className={s.table}>
                        <thead>
                          <tr className={s.theadRow}>
                            <th className={s.th}>공급자</th>
                            <th className={s.th}>품목액</th>
                            <th className={s.th}>수수료</th>
                            <th className={s.th}>지급예정</th>
                            <th className={s.th}>상태</th>
                            <th className={s.th}>취소일시</th>
                            <th className={s.th}>취소처리자</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.allocations.map((a) => (
                            <tr key={a.id}>
                              <td className={s.td}>
                                <div className={s.cellStrong}>{a.supplier_name ?? '—'}</div>
                                <div className={s.cellMutedSm}>{a.supplier_tenant_id}</div>
                              </td>
                              <td className={s.td}>{formatKRW(a.item_amount)}</td>
                              <td className={s.td}>{formatKRW(a.platform_fee_amount)}</td>
                              <td className={s.td}>{formatKRW(a.supplier_payable_amount)}</td>
                              <td className={s.td}>{a.status}</td>
                              <td className={s.tdNowrap}>{a.cancelled_at ?? '—'}</td>
                              <td className={s.td}>
                                {a.cancelled_by ? (
                                  <>
                                    <div className={s.cellStrong}>{a.cancelled_by_display ?? '—'}</div>
                                    <div className={s.cellMutedSm}>{a.cancelled_by}</div>
                                  </>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : detail.payment_status === 'paid' ? (
                  <p className={s.subtitle} style={{ marginTop: 12, fontSize: 12 }}>
                    allocation 미생성 — listing 공급자 식별 실패 시 자동 생성이 생략됩니다. `commerce_product_listings.supplier_tenant_id` 등을 확인하세요.
                  </p>
                ) : null}
              </>
            ) : (
              <p className={s.subtitle}>표시할 데이터가 없습니다</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}

function OrderActions({
  order,
  pending,
  onPaidCancelRequest,
  onDetail,
  onTransition,
}: {
  order: CommerceOrderSummaryRow
  pending: boolean
  onPaidCancelRequest: () => void
  onDetail: () => void
  onTransition: (order: CommerceOrderSummaryRow, next: CommerceOrderStatus) => void
}) {
  const { status, payment_method, refund_required } = order

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <button type="button" className={s.ghostBtn} disabled={pending} onClick={onDetail}>
        상세
      </button>
      {status === 'pending_payment' && payment_method === 'bank_transfer' ? (
        <button type="button" className={s.primaryBtn} disabled={pending} onClick={() => onTransition(order, 'paid')}>
          입금 확인 완료
        </button>
      ) : null}
      {status === 'pending_payment' && payment_method === 'kakao_manual' ? (
        <button type="button" className={s.primaryBtn} disabled={pending} onClick={() => onTransition(order, 'paid')}>
          카카오 확인 완료
        </button>
      ) : null}
      {status === 'pending_payment' ? (
        <button type="button" className={s.ghostBtn} disabled={pending} onClick={() => onTransition(order, 'cancelled')}>
          주문 취소
        </button>
      ) : null}
      {status === 'paid' ? (
        <>
          <button
            type="button"
            className={s.primaryBtn}
            disabled={pending}
            onClick={() => onTransition(order, 'preparing')}
          >
            준비 시작
          </button>
          <button type="button" className={s.ghostBtn} disabled={pending} onClick={onPaidCancelRequest}>
            취소 처리
          </button>
        </>
      ) : null}
      {status === 'preparing' ? (
        <button type="button" className={s.primaryBtn} disabled={pending} onClick={() => onTransition(order, 'shipped')}>
          배송 시작
        </button>
      ) : null}
      {status === 'shipped' ? (
        <button
          type="button"
          className={s.primaryBtn}
          disabled={pending}
          onClick={() => onTransition(order, 'completed')}
        >
          수령 확인
        </button>
      ) : null}
      {status === 'cancelled' && refund_required ? (
        <button type="button" className={s.primaryBtn} disabled={pending} onClick={() => onTransition(order, 'refunded')}>
          환불 완료 처리
        </button>
      ) : null}
    </div>
  )
}
