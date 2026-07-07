import { getDashboardData, getTodayCollections } from '@/actions/dashboard'
import { formatKRW } from '@/lib/calc'
import styles from './dashboard.module.css'
import Link from 'next/link'

export const metadata = { title: '대시보드 — RealMyOS' }

export default async function DashboardPage() {
  const [result, collectionsResult] = await Promise.all([
    getDashboardData(),
    getTodayCollections(),
  ])
  if (!result.success || !result.data) {
    return <main className={styles.page}><p className={styles.empty}>데이터를 불러올 수 없습니다.</p></main>
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
  const collectionTotal = collections.reduce((s, c) => s + (c.current_balance ?? 0), 0)

  return (
    <main className={styles.page}>
      {/* KPI 카드 4개 (상단 그리드) */}
      <div className={styles.kpiGrid}>
        <Link href="/customers?filter=receivable" className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <div className={styles.kpiLabel}>총 미수금</div>
            <div className={`${styles.pill} ${styles.pillWarn}`}>주의</div>
          </div>
          <div className={`${styles.kpiNum} ${styles.kpiNumDanger}`}>{formatKRW(d.total_receivable)}</div>
          <div className={styles.kpiSub}>원 · 거래처 원장 이동</div>
        </Link>

        <Link href="/customers?filter=overdue" className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <div className={styles.kpiLabel}>총 연체금</div>
            <div className={`${styles.pill} ${styles.pillSuccess}`}>정상</div>
          </div>
          <div className={`${styles.kpiNum} ${styles.kpiNumPrimary}`}>{formatKRW(d.total_overdue)}</div>
          <div className={styles.kpiSub}>원 · 연체 없음</div>
        </Link>

        <Link href="/orders?period=month" className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <div className={styles.kpiLabel}>이번달 매출</div>
            <div className={`${styles.pill} ${styles.pillAccent}`}>확인</div>
          </div>
          <div className={`${styles.kpiNum} ${styles.kpiNumPrimary}`}>{formatKRW(d.monthly_sales)}</div>
          <div className={styles.kpiSub}>원 · 거래처/상품 추이</div>
        </Link>

        <Link href="/customers?sort=collection_delay" className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <div className={styles.kpiLabel}>평균 수금 속도</div>
            <div className={`${styles.pill} ${styles.pillWarn}`}>지연</div>
          </div>
          <div className={`${styles.kpiNum} ${styles.kpiNumWarn}`}>{avgDelayDays > 0 ? `${avgDelayDays}일` : '0일'}</div>
          <div className={styles.kpiSub}>TOP 거래처 기준</div>
        </Link>
      </div>

      {/* 하단 2컬럼 */}
      <div className={styles.lower}>
        {/* 왼쪽: 매출 분석 카드 */}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.cardTitle}>매출 분석</div>
            <div className={styles.cardMeta}>이번달 · confirmed 주문 기준</div>
          </div>

          <div className={styles.analysisGrid}>
            <div className={styles.analysisCol}>
              <div className={styles.analysisColHead}>거래처 매출 TOP 5</div>
              {d.top_customer_sales.length === 0 ? (
                <div className={styles.empty}>데이터 없음</div>
              ) : (
                d.top_customer_sales.slice(0, 5).map((c, i) => (
                  <Link key={`cs-${i}`} href="/customers" className={styles.row}>
                    <span className={styles.rank}>{i + 1}</span>
                    <span className={styles.name}>{c.name?.trim() || '알 수 없음'}</span>
                    <span className={styles.value}>{formatKRW(c.amount)}</span>
                  </Link>
                ))
              )}
            </div>

            <div className={styles.analysisCol}>
              <div className={styles.analysisColHead}>상품 매출 TOP 5</div>
              {d.top_product_sales.length === 0 ? (
                <div className={styles.empty}>데이터 없음</div>
              ) : (
                d.top_product_sales.slice(0, 5).map((p, i) => (
                  <Link key={`ps-${i}`} href="/products" className={styles.row}>
                    <span className={styles.rank}>{i + 1}</span>
                    <span className={styles.name}>{p.name}</span>
                    <span className={styles.value}>{formatKRW(p.amount)}</span>
                  </Link>
                ))
              )}
            </div>

            <div className={styles.analysisCol}>
              <div className={styles.analysisColHead}>주목 거래처 TOP 5</div>
              {d.top_customers.length === 0 ? (
                <div className={styles.empty}>데이터 없음</div>
              ) : (
                d.top_customers.slice(0, 5).map((c, i) => (
                  <Link key={`tc-${c.id}`} href={`/customers/${c.id}/ledger`} className={styles.row}>
                    <span className={styles.rank}>{i + 1}</span>
                    <span className={styles.name}>{c.name}</span>
                    <span className={styles.value}>{c.primary_reason || `${c.score}점`}</span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 오른쪽: 오늘 수금 카드 */}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.cardTitle}>오늘 수금</div>
            <div className={`${styles.pill} ${styles.pillAccent}`}>{collections.length}건</div>
          </div>

          <div className={styles.sumBox}>
            <div className={styles.sumLabel}>수금 대상 합계</div>
            <div className={styles.sumAmount}>{formatKRW(collectionTotal)}</div>
          </div>

          <div className={styles.collectionList}>
            {collections.length === 0 ? (
              <div className={styles.empty}>오늘 수금 대상이 없습니다</div>
            ) : (
              collections.map((c) => (
                <Link key={c.id} href={`/payments/new?customer_id=${c.id}`} className={styles.collectionRow}>
                  <div className={styles.collectionLeft}>
                    <div className={styles.collectionName}>{c.name}</div>
                    <div className={styles.collectionDate}>
                      {c.last_payment_date
                        ? `마지막 수금 ${c.days_since_payment}일 전`
                        : '수금 이력 없음'}
                    </div>
                  </div>
                  <div className={styles.collectionAmount}>{formatKRW(c.current_balance)}</div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
