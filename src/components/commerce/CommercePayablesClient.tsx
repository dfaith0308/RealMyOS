'use client'

import { useCallback } from 'react'
import type { SupplierPayablesAdminPayload } from '@/actions/admin/supplier-payables'
import { formatKRW } from '@/lib/calc'
import s from '@/app/(admin)/admin-shared.module.css'

type StatusTab = 'all' | 'unpaid' | 'paid' | 'cancelled'

export default function CommercePayablesClient({
  status,
  payload,
}: {
  status: StatusTab
  payload: SupplierPayablesAdminPayload
}) {
  const hrefFor = useCallback((st: StatusTab) => (st === 'all' ? '/admin/commerce/payables' : `/admin/commerce/payables?status=${st}`), [])

  const { kpis, summaries, rows } = payload

  return (
    <>
      <section className={s.panel} style={{ marginBottom: 16 }}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>지급 예정 원장 KPI</h2>
          <span className={s.inlineMuted}>실제 지급·정산 자동화 없음 · supplier_payables 기준</span>
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
          <span className={s.inlineMuted}>최대 2,000행 · paid 전환 UI는 다음 단계</span>
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
                    <td className={s.td}>{r.status}</td>
                    <td className={s.tdNowrap}>
                      <span className={s.cellMutedSm}>{r.created_at}</span>
                    </td>
                    <td className={s.tdNowrap}>
                      <span className={s.cellMutedSm}>{r.confirmed_at ?? '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
