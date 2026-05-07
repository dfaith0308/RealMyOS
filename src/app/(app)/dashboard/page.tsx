import { getDashboardData, getTodayCollections } from '@/actions/dashboard'
import { formatKRW } from '@/lib/calc'
import { DashboardCommandStrip } from '@/components/dashboard/CommandStrip'
import { DashboardQueueSection } from '@/components/dashboard/DashboardQueueSection'
import { Surface } from '@/components/ui/Surface'
import { KPIBlock } from '@/components/ui/KPIBlock'
import { DataCell, DataTableRow } from '@/components/ui/DataTableRow'
import styles from './dashboard.module.css'
import Link from 'next/link'

export const metadata = { title: '대시보드 — RealMyOS' }

export default async function DashboardPage() {
  const [result, collectionsResult] = await Promise.all([
    getDashboardData(),
    getTodayCollections(),
  ])
  if (!result.success || !result.data) {
    return (
      <main className={styles.page}>
        <Surface variant="panel">
          <p className={styles.empty}>데이터를 불러올 수 없습니다.</p>
        </Surface>
      </main>
    )
  }
  const d           = result.data
  const collections = collectionsResult.data ?? []
  const avgDelayDays = (() => {
    const xs = (d.top_customers ?? [])
      .map((c) => c.days_since_order - (c.payment_terms_days ?? 30))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (xs.length === 0) return 0
    return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
  })()

  return (
    <main className={styles.page}>
      <DashboardCommandStrip d={d} />

      <div className={styles.mainGrid}>
        <DashboardQueueSection d={d} collections={collections} />

        <div className={styles.rightCol}>
          <Surface variant="panel" density="comfortable">
            <div className={styles.sectionTitleRow}>
              <div className={styles.sectionTitle}>핵심 KPI</div>
              <div className={styles.sectionMeta}>숫자 우선 · 즉시 판단</div>
            </div>

            <div className={styles.kpiGrid}>
              <KPIBlock
                label="총 미수금"
                value={formatKRW(d.total_receivable)}
                  status={d.total_receivable > 0 ? 'warning' : 'paid'}
                  statusPlacement="below"
                  valueSize="lg"
                hint="거래처 원장/수금으로 이동"
              />
              <KPIBlock
                label="총 연체금"
                value={formatKRW(d.total_overdue)}
                  status={d.total_overdue > 0 ? 'overdue' : 'paid'}
                  statusPlacement="below"
                  valueSize="lg"
                hint="연체 우선순위 확인"
              />
              <KPIBlock
                label="이번달 매출"
                value={formatKRW(d.monthly_sales)}
                  valueSize="lg"
                hint="거래처/상품 추이"
              />
              <KPIBlock
                label="수금 속도"
                value={avgDelayDays > 0 ? `${avgDelayDays}일 지연` : '정상'}
                  valueSize="lg"
                hint="TOP 거래처 기준 근사"
              />
            </div>
          </Surface>

          <Surface variant="panel" density="comfortable">
            <div className={styles.quickActions}>
              <div className={styles.qaTitle}>Quick Actions</div>
              <div className={styles.qaList}>
                <Link href="/payments/new" className={styles.qaBtn}>
                  <span>수금 등록</span>
                  <span className={styles.qaHint}>바로 입력</span>
                </Link>
                <Link href="/orders" className={styles.qaBtn}>
                  <span>주문 처리</span>
                  <span className={styles.qaHint}>draft 정리</span>
                </Link>
                <Link href="/rfq" className={styles.qaBtn}>
                  <span>RFQ 확인</span>
                  <span className={styles.qaHint}>미응답 점검</span>
                </Link>
                <Link href="/funds" className={styles.qaBtn}>
                  <span>자금 이행</span>
                  <span className={styles.qaHint}>계획 실행</span>
                </Link>
              </div>
            </div>
          </Surface>
        </div>
      </div>

      <Surface variant="panel" density="comfortable">
        <div className={styles.sectionTitleRow}>
          <div className={[styles.sectionTitle, styles.analysisTitle].join(' ')}>
            분석 (참고)
          </div>
          <div className={[styles.sectionMeta, styles.analysisMeta].join(' ')}>
            운영 Queue 아래 · 참고용
          </div>
        </div>

        <div className={styles.analysisGrid}>
          <Surface variant="card" density="comfortable">
            <div className={styles.sectionTitleRow}>
              <div className={[styles.sectionTitle, styles.analysisTitle].join(' ')}>
                거래처 매출 TOP
              </div>
              <div className={[styles.sectionMeta, styles.analysisMeta].join(' ')}>
                이번달
              </div>
            </div>

            {d.top_customer_sales.length === 0 ? (
              <div className={styles.empty}>이번달 주문 없음</div>
            ) : (
              <div>
                {d.top_customer_sales.slice(0, 5).map((c, i) => (
                  <DataTableRow key={`cs-${i}`} href="/customers" density="compact">
                    <DataCell tone="secondary">{i + 1}</DataCell>
                    <DataCell>{c.name}</DataCell>
                    <DataCell align="end">{formatKRW(c.amount)}</DataCell>
                  </DataTableRow>
                ))}
              </div>
            )}
          </Surface>

          <Surface variant="card" density="comfortable">
            <div className={styles.sectionTitleRow}>
              <div className={[styles.sectionTitle, styles.analysisTitle].join(' ')}>
                상품 매출 TOP
              </div>
              <div className={[styles.sectionMeta, styles.analysisMeta].join(' ')}>
                이번달
              </div>
            </div>

            {d.top_product_sales.length === 0 ? (
              <div className={styles.empty}>이번달 주문 없음</div>
            ) : (
              <div>
                {d.top_product_sales.slice(0, 5).map((p, i) => (
                  <DataTableRow key={`ps-${i}`} href="/products" density="compact">
                    <DataCell tone="secondary">{i + 1}</DataCell>
                    <DataCell>{p.name}</DataCell>
                    <DataCell align="end">{formatKRW(p.amount)}</DataCell>
                  </DataTableRow>
                ))}
              </div>
            )}
          </Surface>
        </div>
      </Surface>
    </main>
  )
}
