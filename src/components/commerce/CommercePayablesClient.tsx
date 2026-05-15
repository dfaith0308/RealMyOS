'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SupplierPayablesAdminPayload } from '@/actions/admin/supplier-payables'
import { markSupplierPayableAsPaid } from '@/actions/admin/supplier-payables'
import { formatKRW } from '@/lib/calc'
import s from '@/app/(admin)/admin-shared.module.css'

type StatusTab = 'all' | 'unpaid' | 'paid' | 'cancelled'

function shortId(id: string | null | undefined): string {
  const v = String(id ?? '').trim()
  if (!v) return '—'
  return v.length <= 10 ? v : `${v.slice(0, 6)}…`
}

export default function CommercePayablesClient({
  status,
  payload,
}: {
  status: StatusTab
  payload: SupplierPayablesAdminPayload
}) {
  const router = useRouter()
  const hrefFor = useCallback((st: StatusTab) => (st === 'all' ? '/admin/commerce/payables' : `/admin/commerce/payables?status=${st}`), [])

  const { kpis, summaries, rows } = payload

  const [payableMarkId, setPayableMarkId] = useState<string | null>(null)
  const [markReason, setMarkReason] = useState('공급자 지급 완료(수동 확인)')
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function submitMarkPaid() {
    if (!payableMarkId) return
    setPending(true)
    setActionError(null)
    const res = await markSupplierPayableAsPaid(payableMarkId, markReason)
    setPending(false)
    if (!res.success) {
      setActionError(res.error ?? '처리 실패')
      return
    }
    setPayableMarkId(null)
    router.refresh()
  }

  return (
    <>
      <section className={s.panel} style={{ marginBottom: 16 }}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>지급 예정 원장 KPI</h2>
          <span className={s.inlineMuted}>supplier_payables + 지급 시 append-only `payments`(payout_outbound)</span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 12,
            padding: '0 12px 12px',
          }}
        >
          <div className={s.panel} style={{ margin: 0, padding: 12 }}>
            <div className={s.cellMutedSm}>미지급 합계</div>
            <div className={s.cellStrong} style={{ fontSize: 18 }}>
              {formatKRW(kpis.total_unpaid)}
            </div>
          </div>
          <div className={s.panel} style={{ margin: 0, padding: 12 }}>
            <div className={s.cellMutedSm}>지급 완료 합계</div>
            <div className={s.cellStrong} style={{ fontSize: 18 }}>
              {formatKRW(kpis.total_paid)}
            </div>
          </div>
          <div className={s.panel} style={{ margin: 0, padding: 12 }}>
            <div className={s.cellMutedSm}>공급자 수</div>
            <div className={s.cellStrong} style={{ fontSize: 18 }}>
              {kpis.supplier_count}
            </div>
          </div>
          <div className={s.panel} style={{ margin: 0, padding: 12 }}>
            <div className={s.cellMutedSm}>미지급 건수</div>
            <div className={s.cellStrong} style={{ fontSize: 18 }}>
              {kpis.unpaid_row_count}
            </div>
          </div>
        </div>
      </section>

      <nav className={s.actionsRow} style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        {(
          [
            ['all', '전체'],
            ['unpaid', '미지급(unpaid)'],
            ['paid', '지급완료(paid)'],
            ['cancelled', '취소(cancelled)'],
          ] as const
        ).map(([key, label]) => (
          <a key={key} href={hrefFor(key)} className={status === key ? s.primaryBtn : s.ghostBtn} style={{ fontSize: 12, padding: '6px 12px' }}>
            {label}
          </a>
        ))}
      </nav>

      {actionError ? (
        <div className={s.alert} style={{ marginBottom: 12 }}>
          {actionError}
        </div>
      ) : null}

      <section className={s.panel} style={{ marginBottom: 16 }}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>공급자별 요약</h2>
        </div>
        {summaries.length === 0 ? (
          <div className={s.empty}>원장 행이 없습니다</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  <th className={s.th}>공급자</th>
                  <th className={s.th}>미지급 합계</th>
                  <th className={s.th}>지급완료 합계</th>
                  <th className={s.th}>건수</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((r) => (
                  <tr key={r.supplier_tenant_id}>
                    <td className={s.td}>
                      <div className={s.cellStrong}>{r.supplier_name ?? '—'}</div>
                      <div className={s.cellMutedSm}>{r.supplier_tenant_id}</div>
                    </td>
                    <td className={s.td}>{formatKRW(r.unpaid_sum)}</td>
                    <td className={s.td}>{formatKRW(r.paid_sum)}</td>
                    <td className={s.td}>{r.row_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>원장 목록</h2>
          <span className={s.inlineMuted}>미지급 행에서 지급 완료 처리 시 paid + outbound payout row 생성</span>
        </div>
        {rows.length === 0 ? (
          <div className={s.empty}>표시할 행이 없습니다</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  <th className={s.th}>공급자</th>
                  <th className={s.th}>주문</th>
                  <th className={s.th}>품목</th>
                  <th className={s.th}>payable</th>
                  <th className={s.th}>상태</th>
                  <th className={s.th}>생성일</th>
                  <th className={s.th}>확정일</th>
                  <th className={s.th}>지급일</th>
                  <th className={s.th}>지급자</th>
                  <th className={s.th}>작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className={s.td}>
                      <div className={s.cellStrong}>{r.supplier_name ?? '—'}</div>
                      <div className={s.cellMutedSm}>{r.supplier_tenant_id}</div>
                    </td>
                    <td className={s.tdNowrap}>
                      <div className={s.cellStrong}>{r.order_number ?? '—'}</div>
                      <div className={s.cellMutedSm}>{r.commerce_order_id}</div>
                    </td>
                    <td className={s.td}>
                      <div className={s.cellStrong}>{r.listing_title ?? '—'}</div>
                      <div className={s.cellMutedSm}>{r.commerce_order_item_id}</div>
                    </td>
                    <td className={s.td}>{formatKRW(r.payable_amount)}</td>
                    <td className={s.td}>
                      <span className={s.cellStrong}>{r.status}</span>
                      {r.status === 'paid' ? (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'var(--ds-bg-subtle, #e2e8f0)',
                          }}
                        >
                          paid
                        </span>
                      ) : null}
                    </td>
                    <td className={s.tdNowrap}>
                      <span className={s.cellMutedSm}>{r.created_at}</span>
                    </td>
                    <td className={s.tdNowrap}>
                      <span className={s.cellMutedSm}>{r.confirmed_at ?? '—'}</span>
                    </td>
                    <td className={s.tdNowrap}>
                      <span className={s.cellMutedSm}>{r.paid_at ?? '—'}</span>
                    </td>
                    <td className={s.tdNowrap}>
                      <span className={s.cellMutedSm}>{shortId(r.paid_by)}</span>
                    </td>
                    <td className={s.td}>
                      {r.status === 'unpaid' ? (
                        <button
                          type="button"
                          className={s.primaryBtn}
                          style={{ fontSize: 12, padding: '6px 10px' }}
                          disabled={pending}
                          onClick={() => {
                            setPayableMarkId(r.id)
                            setMarkReason('공급자 지급 완료(수동 확인)')
                            setActionError(null)
                          }}
                        >
                          지급 완료 처리
                        </button>
                      ) : (
                        <span className={s.cellMutedSm}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {payableMarkId ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="payable-mark-paid-title"
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
          onClick={() => !pending && setPayableMarkId(null)}
        >
          <div className={s.kpiCard} style={{ maxWidth: 440, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 id="payable-mark-paid-title" className={s.title} style={{ fontSize: 16 }}>
              지급 완료 처리
            </h3>
            <p className={s.subtitle} style={{ marginTop: 10 }}>
              payable을 paid로 전환하고 플랫폼→공급자 outbound payout(`payout_outbound`) 1건을 남깁니다. 실제 이체는 별도입니다.
            </p>
            <label className={s.subtitle} style={{ display: 'block', marginTop: 12, fontWeight: 700 }}>
              사유
            </label>
            <textarea
              className={s.input}
              rows={3}
              value={markReason}
              disabled={pending}
              onChange={(e) => setMarkReason(e.target.value)}
              style={{ width: '100%', marginTop: 6, resize: 'vertical' }}
            />
            <div className={s.actionsRow} style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" className={s.ghostBtn} disabled={pending} onClick={() => setPayableMarkId(null)}>
                닫기
              </button>
              <button type="button" className={s.primaryBtn} disabled={pending} onClick={() => void submitMarkPaid()}>
                실행
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
