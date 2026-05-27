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
      {/* 상단: KPI 2x2 + 수금 패널 */}
      <div className={styles.upper}>
        {/* KPI 2x2 — 각 카드는 Link로 감싸며 href는 반드시 아래 경로 사용 */}
        <div className={styles.kpiGrid}>
          <Link
            href="/customers?filter=receivable"
            className={`${styles.kc} ${d.total_receivable > 0 ? styles.kcDanger : styles.kcGood}`}
          >
            <div className={styles.kcTop}>
              <div className={styles.kcLabel}>총 미수금</div>
              <div className={`${styles.kcTag} ${d.total_receivable > 0 ? styles.kcTagDanger : styles.kcTagGood}`}>
                {d.total_receivable > 0 ? '▲ 주의' : '✓ 정상'}
              </div>
            </div>
            <div className={`${styles.kcNum} ${d.total_receivable > 0 ? styles.kcNumDanger : styles.kcNumGood}`}>
              {formatKRW(d.total_receivable)}
            </div>
            <div className={styles.kcSub}>거래처 원장 · 수금 이동</div>
          </Link>

          <Link
            href="/customers?filter=overdue"
            className={`${styles.kc} ${d.total_overdue > 0 ? styles.kcDanger : styles.kcGood}`}
          >
            <div className={styles.kcTop}>
              <div className={styles.kcLabel}>총 연체금</div>
              <div className={`${styles.kcTag} ${d.total_overdue > 0 ? styles.kcTagDanger : styles.kcTagGood}`}>
                {d.total_overdue > 0 ? '▲ 연체' : '✓ 정상'}
              </div>
            </div>
            <div className={`${styles.kcNum} ${d.total_overdue > 0 ? styles.kcNumDanger : styles.kcNumGood}`}>
              {formatKRW(d.total_overdue)}
            </div>
            <div className={styles.kcSub}>연체 우선순위 확인</div>
          </Link>

          <Link href="/orders?period=month" className={`${styles.kc} ${styles.kcGood}`}>
            <div className={styles.kcTop}>
              <div className={styles.kcLabel}>이번달 매출</div>
              <div className={`${styles.kcTag} ${styles.kcTagGood}`}>↑ 확인</div>
            </div>
            <div className={`${styles.kcNum} ${styles.kcNumGood}`}>{formatKRW(d.monthly_sales)}</div>
            <div className={styles.kcSub}>거래처 / 상품 추이</div>
          </Link>

          <Link
            href="/customers?sort=collection_delay"
            className={`${styles.kc} ${avgDelayDays > 0 ? styles.kcWarn : styles.kcGood}`}
          >
            <div className={styles.kcTop}>
              <div className={styles.kcLabel}>평균 수금 속도</div>
              <div className={`${styles.kcTag} ${avgDelayDays > 0 ? styles.kcTagWarn : styles.kcTagGood}`}>
                {avgDelayDays > 0 ? '⚡ 지연' : '✓ 정상'}
              </div>
            </div>
            <div className={`${styles.kcNum} ${avgDelayDays > 0 ? styles.kcNumWarn : styles.kcNumGood}`}>
              {avgDelayDays > 0 ? `${avgDelayDays}일` : '정상'}
            </div>
            <div className={styles.kcSub}>TOP 거래처 기준</div>
          </Link>
        </div>

        {/* 오늘 수금 패널 */}
        <div className={styles.cp}>
          <div className={styles.cpHead}>
            <div className={styles.cpTitle}>오늘 수금</div>
            <div className={styles.cpBadge}>{collections.length}건</div>
          </div>

          <div className={styles.cpSum}>
            <div className={styles.cpSumLabel}>수금 대상 합계</div>
            <div className={styles.cpSumAmt}>{formatKRW(collectionTotal)}</div>
          </div>

          <div className={styles.cpList}>
            {collections.length === 0 ? (
              <div className={styles.cpEmpty}>오늘 수금 대상이 없습니다</div>
            ) : (
              collections.map((c, i) => (
                <Link key={c.id} href={`/payments/new?customer_id=${c.id}`} className={styles.ci}>
                  <div className={`${styles.ciDot} ${i === 0 ? styles.ciDotHot : styles.ciDotOff}`} />
                  <div className={styles.ciBody}>
                    <div className={styles.ciName}>{c.name}</div>
                    <div className={styles.ciDesc}>
                      {c.last_payment_date
                        ? `마지막 수금 ${c.days_since_payment}일 전`
                        : '수금 이력 없음'}
                    </div>
                  </div>
                  <div className={styles.ciR}>
                    <div className={styles.ciAmt}>{formatKRW(c.current_balance)}</div>
                    <div className={styles.ciCta}>등록 →</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 하단: 매출 분석 */}
      <div className={styles.ap}>
        <div className={styles.apHead}>
          <div className={styles.apTitle}>매출 분석</div>
          <div className={styles.apMeta}>이번달 · confirmed 주문 기준</div>
        </div>

        <div className={styles.tops}>
          {/* 거래처 매출 TOP5 */}
          <div className={styles.tc}>
            <div className={styles.tcHead}>
              <div className={styles.tcTitle}>거래처 매출 TOP 5</div>
              <div className={styles.tcPeriod}>이번달</div>
            </div>
            {d.top_customer_sales.length === 0 ? (
              <div className={styles.tcEmpty}>이번달 주문 없음</div>
            ) : (
              d.top_customer_sales.slice(0, 5).map((c, i) => {
                const max = d.top_customer_sales[0]?.amount ?? 1
                const w = Math.round((c.amount / max) * 56)
                return (
                  <Link key={`cs-${i}`} href="/customers" className={`${styles.tr} ${i === 0 ? styles.trR1 : ''}`}>
                    <div className={styles.trRank}>{i + 1}</div>
                    <div className={styles.trName}>{c.name?.trim() || '알 수 없음'}</div>
                    <div className={styles.trBarBg}><div className={styles.trBar} style={{ width: `${w}px` }} /></div>
                    <div className={styles.trVal}>{formatKRW(c.amount)}</div>
                  </Link>
                )
              })
            )}
          </div>

          {/* 상품 매출 TOP5 */}
          <div className={styles.tc}>
            <div className={styles.tcHead}>
              <div className={styles.tcTitle}>상품 매출 TOP 5</div>
              <div className={styles.tcPeriod}>이번달</div>
            </div>
            {d.top_product_sales.length === 0 ? (
              <div className={styles.tcEmpty}>이번달 주문 없음</div>
            ) : (
              d.top_product_sales.slice(0, 5).map((p, i) => {
                const max = d.top_product_sales[0]?.amount ?? 1
                const w = Math.round((p.amount / max) * 56)
                return (
                  <Link key={`ps-${i}`} href="/products" className={`${styles.tr} ${i === 0 ? styles.trR1 : ''}`}>
                    <div className={styles.trRank}>{i + 1}</div>
                    <div className={styles.trName}>{p.name}</div>
                    <div className={styles.trBarBg}><div className={styles.trBar} style={{ width: `${w}px` }} /></div>
                    <div className={styles.trVal}>{formatKRW(p.amount)}</div>
                  </Link>
                )
              })
            )}
          </div>

          {/* 주목 거래처 TOP5 */}
          <div className={styles.tc}>
            <div className={styles.tcHead}>
              <div className={styles.tcTitle}>주목 거래처 TOP 5</div>
              <div className={styles.tcPeriod}>수금 우선순위</div>
            </div>
            {d.top_customers.length === 0 ? (
              <div className={styles.tcEmpty}>데이터 없음</div>
            ) : (
              d.top_customers.slice(0, 5).map((c, i) => (
                <Link key={`tc-${c.id}`} href={`/customers/${c.id}/ledger`} className={`${styles.tr} ${i === 0 ? styles.trR1 : ''}`}>
                  <div className={styles.trRank}>{i + 1}</div>
                  <div className={styles.trName}>{c.name}</div>
                  <div className={styles.trBarBg}><div className={styles.trBar} style={{ width: `${Math.max(8, Math.round(((5 - i) / 5) * 56))}px` }} /></div>
                  <div className={styles.trPct}>{c.primary_reason || `${c.score}점`}</div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
