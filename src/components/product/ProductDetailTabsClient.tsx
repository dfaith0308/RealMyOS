'use client'

import { useMemo, useState, useTransition } from 'react'
import { Surface } from '@/components/ui/Surface'
import { DataCell, DataTableRow } from '@/components/ui/DataTableRow'
import { formatKRW } from '@/lib/calc'
import type {
  AutoRecommendResult,
  CustomerPriceRow,
  ManualRelatedRow,
  MarginAnalysis,
  ProductCostHistoryRow,
  ProductDetail,
  UsagePatternResult,
} from '@/actions/product'
import { addRelatedProduct, removeRelatedProduct } from '@/actions/product'
import styles from './ProductDetailTabsClient.module.css'

type TabKey = 'info' | 'margin' | 'related' | 'usage' | 'logs'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'info', label: '기본정보' },
  { key: 'margin', label: '가격/마진' },
  { key: 'related', label: '연관상품' },
  { key: 'usage', label: '사용패턴' },
  { key: 'logs', label: '로그' },
]

function marginTone(m: number | null, threshold: number) {
  if (m === null) return styles.muted
  if (m >= threshold) return styles.badgeOk
  if (m >= threshold * 0.7) return styles.badgeWarn
  return styles.badgeDanger
}

export default function ProductDetailTabsClient(props: {
  product: ProductDetail
  costHistory: ProductCostHistoryRow[]
  customerPrices: CustomerPriceRow[]
  manualRelated: ManualRelatedRow[]
  usage: UsagePatternResult | null
  autoRecommend: AutoRecommendResult | null
  margin: MarginAnalysis | null
}) {
  const { product, costHistory, customerPrices, manualRelated, usage, autoRecommend, margin } =
    props

  const [tab, setTab] = useState<TabKey>('info')
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const activeManual = useMemo(
    () => manualRelated.filter((r) => r.is_active),
    [manualRelated],
  )

  const inactiveManual = useMemo(
    () => manualRelated.filter((r) => !r.is_active),
    [manualRelated],
  )

  const relatedOptions = useMemo(() => {
    // 현재는 서버에서 후보 목록을 주지 않으므로, “추가” UX는 최소(코드/상태는 구현)로 유지
    // 운영에서는 search/select 컴포넌트로 대체될 수 있음.
    return [] as Array<{ id: string; name: string }>
  }, [])

  const [selectedRelated, setSelectedRelated] = useState<string>('')

  function addManual() {
    if (!selectedRelated) {
      setErr('추가할 상품을 선택해주세요.')
      return
    }
    setErr(null)
    startTransition(async () => {
      const r = await addRelatedProduct(product.id, selectedRelated)
      if (!r.success) setErr(r.error ?? '저장 실패')
      else window.location.reload()
    })
  }

  function deactivateManual(id: string) {
    setErr(null)
    startTransition(async () => {
      const r = await removeRelatedProduct(id, product.id)
      if (!r.success) setErr(r.error ?? '비활성화 실패')
      else window.location.reload()
    })
  }

  return (
    <div className={styles.wrap}>
      <Surface variant="panel" density="comfortable">
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={[styles.tab, tab === t.key ? styles.tabActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {err ? <div className={styles.badgeDanger}>{err}</div> : null}

        {tab === 'info' ? (
          <div style={{ marginTop: 12 }}>
            <div className={styles.grid2}>
              <Field k="제품명" v={product.name} />
              <Field k="카테고리" v={product.category_name ?? '-'} />
              <Field k="제품코드" v={product.product_code} mono />
              <Field k="단위" v={product.unit ?? '-'} />
              <Field k="규격" v={product.spec ?? '-'} />
              <Field k="바코드" v={product.barcode ?? '-'} mono />
              <Field k="보관조건" v={product.storage_condition ?? '-'} />
              <Field k="거래상태" v={product.status ?? '-'} />
              <Field k="메모" v={product.memo ?? '-'} />
              <Field k="원재료명 및 함량" v={product.ingredients ?? '-'} />
              <Field k="품목보고번호" v={product.item_report_number ?? '-'} mono />
            </div>
          </div>
        ) : null}

        {tab === 'margin' ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Surface variant="card" density="comfortable">
              <div className={styles.sectionTitle}>현재 요약</div>
              <div className={styles.grid2}>
                <Field
                  k="현재 매입가"
                  v={
                    product.current_cost_price !== null
                      ? formatKRW(product.current_cost_price)
                      : '-'
                  }
                />
                <Field
                  k="기본 판매가"
                  v={product.selling_price ? formatKRW(product.selling_price) : '-'}
                />
                <Field
                  k="현재 마진율"
                  v={
                    margin?.current_margin_rate !== null && margin?.current_margin_rate !== undefined
                      ? `${margin.current_margin_rate.toFixed(1)}%`
                      : '-'
                  }
                  toneClass={margin ? marginTone(margin.current_margin_rate, margin.threshold) : undefined}
                />
                <Field
                  k="평균 마진율(거래 기반)"
                  v={
                    margin?.avg_margin_rate !== null && margin?.avg_margin_rate !== undefined
                      ? `${margin.avg_margin_rate.toFixed(1)}%`
                      : '-'
                  }
                  toneClass={margin ? marginTone(margin.avg_margin_rate, margin.threshold) : undefined}
                />
              </div>
              <div className={styles.muted} style={{ marginTop: 8 }}>
                기준: {product.min_margin_rate ?? margin?.threshold ?? '-'}%
              </div>
            </Surface>

            <Surface variant="card" density="comfortable">
              <div className={styles.sectionTitle}>매입가 이력</div>
              {costHistory.length === 0 ? (
                <div className={styles.hintBox}>매입가 이력이 없습니다.</div>
              ) : (
                <div className={styles.rowTable}>
                  {costHistory.map((c) => (
                    <DataTableRow key={c.id} density="compact">
                      <DataCell>
                        <div className={styles.v}>{c.start_date}</div>
                        <div className={styles.muted}>
                          {c.end_date ? `~ ${c.end_date}` : '현재 적용'}
                        </div>
                      </DataCell>
                      <DataCell align="end">
                        <div className={styles.v}>{formatKRW(c.cost_price)}</div>
                        <div className={styles.muted}>
                          {String(c.created_at).slice(0, 16).replace('T', ' ')}
                        </div>
                      </DataCell>
                    </DataTableRow>
                  ))}
                </div>
              )}
            </Surface>

            <Surface variant="card" density="comfortable">
              <div className={styles.sectionTitle}>거래처별 단가</div>
              {customerPrices.length === 0 ? (
                <div className={styles.hintBox}>거래처별 단가 데이터가 없습니다.</div>
              ) : (
                <div className={styles.rowTable}>
                  {customerPrices.map((r) => (
                    <DataTableRow key={r.customer_id} density="compact">
                      <DataCell>
                        <div className={styles.v}>{r.customer_name}</div>
                        <div className={styles.muted}>
                          출처: {r.source} {r.pricing_mode ? `· ${r.pricing_mode}` : ''}
                        </div>
                      </DataCell>
                      <DataCell align="end">
                        <div className={styles.v}>
                          {r.unit_price ? formatKRW(r.unit_price) : '-'}
                        </div>
                        <div className={styles.muted}>
                          {r.updated_at ? String(r.updated_at).slice(0, 16).replace('T', ' ') : '-'}
                        </div>
                      </DataCell>
                    </DataTableRow>
                  ))}
                </div>
              )}
            </Surface>
          </div>
        ) : null}

        {tab === 'related' ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Surface variant="card" density="comfortable">
              <div className={styles.sectionTitle}>수동 등록</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                <select
                  className={styles.select}
                  value={selectedRelated}
                  onChange={(e) => setSelectedRelated(e.target.value)}
                  disabled={isPending}
                >
                  <option value="">상품 추가… (운영에서는 검색 UI로 대체)</option>
                  {relatedOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.smallBtn}
                  onClick={addManual}
                  disabled={isPending}
                >
                  상품 추가
                </button>
                {isPending ? <span className={styles.muted}>처리 중…</span> : null}
              </div>

              {activeManual.length === 0 ? (
                <div className={styles.hintBox}>
                  아직 수동 연관상품이 없습니다. (예: 참기름 → 김/들기름/고추장)
                </div>
              ) : (
                <div className={styles.rowTable}>
                  {activeManual.map((r) => (
                    <DataTableRow key={r.id} density="compact">
                      <DataCell>
                        <div className={styles.v}>{r.related_product_name}</div>
                        <div className={styles.muted}>{String(r.created_at).slice(0, 16).replace('T', ' ')}</div>
                      </DataCell>
                      <DataCell align="end">
                        <button
                          type="button"
                          className={[styles.smallBtn, styles.dangerBtn].join(' ')}
                          onClick={() => deactivateManual(r.id)}
                          disabled={isPending}
                        >
                          비활성화
                        </button>
                      </DataCell>
                    </DataTableRow>
                  ))}
                </div>
              )}

              {inactiveManual.length > 0 ? (
                <div className={styles.muted} style={{ marginTop: 8 }}>
                  비활성화된 항목 {inactiveManual.length}개 (복구 UI는 후속)
                </div>
              ) : null}
            </Surface>

            <Surface variant="card" density="comfortable">
              <div className={styles.sectionTitle}>자동 추천</div>
              {autoRecommend && autoRecommend.enabled ? (
                autoRecommend.recommendations.length === 0 ? (
                  <div className={styles.hintBox}>추천 결과가 없습니다.</div>
                ) : (
                  <div className={styles.rowTable}>
                    {autoRecommend.recommendations.slice(0, 5).map((r) => (
                      <DataTableRow key={r.product_name} density="compact">
                        <DataCell>
                          <div className={styles.v}>{r.product_name}</div>
                        </DataCell>
                        <DataCell align="end">
                          <div className={styles.muted}>score {r.score}</div>
                        </DataCell>
                      </DataTableRow>
                    ))}
                  </div>
                )
              ) : (
                <div className={styles.hintBox}>
                  {autoRecommend?.reason_disabled ??
                    '데이터가 더 쌓이면 자동 추천이 활성화됩니다'}
                </div>
              )}
            </Surface>
          </div>
        ) : null}

        {tab === 'usage' ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!usage || !usage.data_ok ? (
              <div className={styles.hintBox}>
                거래 데이터가 쌓이면 패턴이 표시됩니다 (거래 10건 미만)
              </div>
            ) : (
              <>
                <Surface variant="card" density="comfortable">
                  <div className={styles.sectionTitle}>주요 거래처 TOP5 (주문 횟수)</div>
                  <div className={styles.rowTable}>
                    {usage.top_customers.map((c) => (
                      <DataTableRow key={c.customer_id} density="compact">
                        <DataCell>
                          <div className={styles.v}>{c.customer_name}</div>
                        </DataCell>
                        <DataCell align="end">
                          <div className={styles.v}>{c.order_count}회</div>
                        </DataCell>
                      </DataTableRow>
                    ))}
                  </div>
                </Surface>

                <Surface variant="card" density="comfortable">
                  <div className={styles.sectionTitle}>자주 함께 구매되는 상품 TOP5</div>
                  {usage.co_purchase_top.length === 0 ? (
                    <div className={styles.hintBox}>함께 구매 데이터가 없습니다.</div>
                  ) : (
                    <div className={styles.rowTable}>
                      {usage.co_purchase_top.map((r) => (
                        <DataTableRow key={r.product_name} density="compact">
                          <DataCell>
                            <div className={styles.v}>{r.product_name}</div>
                          </DataCell>
                          <DataCell align="end">
                            <div className={styles.v}>{r.count}</div>
                          </DataCell>
                        </DataTableRow>
                      ))}
                    </div>
                  )}
                </Surface>

                <Surface variant="card" density="comfortable">
                  <div className={styles.sectionTitle}>월별 판매량 추이 (최근 6개월)</div>
                  {usage.monthly_qty_6m.length === 0 ? (
                    <div className={styles.hintBox}>기간 내 판매 데이터가 없습니다.</div>
                  ) : (
                    <div className={styles.rowTable}>
                      {usage.monthly_qty_6m.map((m) => (
                        <DataTableRow key={m.ym} density="compact">
                          <DataCell>
                            <div className={styles.v}>{m.ym}</div>
                          </DataCell>
                          <DataCell align="end">
                            <div className={styles.v}>{m.qty.toLocaleString()}</div>
                          </DataCell>
                        </DataTableRow>
                      ))}
                    </div>
                  )}
                  <div className={styles.muted} style={{ marginTop: 8 }}>
                    평균 주문 수량: {usage.avg_order_qty ?? '-'}
                  </div>
                </Surface>
              </>
            )}
          </div>
        ) : null}

        {tab === 'logs' ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Surface variant="card" density="comfortable">
              <div className={styles.sectionTitle}>가격 변경 로그 (product_costs)</div>
              {costHistory.length === 0 ? (
                <div className={styles.hintBox}>가격 변경 로그가 없습니다.</div>
              ) : (
                <div className={styles.rowTable}>
                  {costHistory.slice(0, 20).map((c) => (
                    <DataTableRow key={`log-${c.id}`} density="compact">
                      <DataCell>
                        <div className={styles.v}>{c.start_date}</div>
                        <div className={styles.muted}>
                          {c.end_date ? `~ ${c.end_date}` : '현재 적용'}
                        </div>
                      </DataCell>
                      <DataCell align="end">
                        <div className={styles.v}>{formatKRW(c.cost_price)}</div>
                        <div className={styles.muted}>
                          {String(c.created_at).slice(0, 16).replace('T', ' ')}
                        </div>
                      </DataCell>
                    </DataTableRow>
                  ))}
                </div>
              )}
            </Surface>

            <Surface variant="card" density="comfortable">
              <div className={styles.sectionTitle}>수정 로그 (product_logs)</div>
              <div className={styles.hintBox}>
                product_logs 조회/표시는 운영 테이블 컬럼(tenant/actor/field)이 확정되면 확장합니다. 현재는 edit 화면에서만 확인 가능합니다.
              </div>
            </Surface>
          </div>
        ) : null}
      </Surface>
    </div>
  )
}

function Field(props: { k: string; v: string; mono?: boolean; toneClass?: string }) {
  return (
    <div className={styles.field}>
      <div className={styles.k}>{props.k}</div>
      <div
        className={[
          styles.v,
          props.mono ? styles.mono : '',
          props.toneClass ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {props.v}
      </div>
    </div>
  )
}

