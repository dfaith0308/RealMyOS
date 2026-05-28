import { getCustomersWithScore } from '@/actions/ledger'
import { formatKRW } from '@/lib/calc'
import type { CustomerWithScore } from '@/actions/ledger'
import { CommandStrip } from '@/components/dashboard/CommandStrip'
import { CustomersOpsListClient } from '@/components/customer/CustomersOpsListClient'
import styles from './customers-ops.module.css'
import Link from 'next/link'

export const metadata = { title: '거래처 — RealMyOS' }

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { filter?: string }
}) {
  const { filter } = searchParams

  const customersResult = await getCustomersWithScore()
  const all = (customersResult.data ?? []) as CustomerWithScore[]

  const totalOverdue = all.reduce((s, c) => s + (c.overdue_amount ?? 0), 0)
  const totalReceivable = all.reduce((s, c) => s + (c.receivable_amount ?? 0), 0)
  const overdueCount = all.filter((c) => (c.overdue_amount ?? 0) > 0).length

  const initialFilter =
    filter === 'overdue'
      ? 'overdue'
      : filter === 'risk'
        ? 'risk'
        : filter === 'new'
          ? 'new'
          : filter === 'normal'
            ? 'normal'
            : 'all'

  // 오늘 수금 예정: 미수금 있고 마지막 수금이 3일 이상 경과
  const todayCollectionCount = all.filter(
    (c) => (c.receivable_amount ?? 0) > 0 &&
      (c.days_since_payment === null || (c.days_since_payment ?? 0) >= 3)
  ).length

  // 수금 지연: D+14 이상이고 미수금 있는 거래처
  const delayedCount = all.filter(
    (c) => (c.days_since_payment ?? 0) >= 14 &&
      (c.receivable_amount ?? 0) > 0
  ).length

  return (
    <main className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.pageTitle}>거래처 관리</div>
          <div className={styles.pageSub}>
            총 {all.length}곳 · 수금 우선순위 정렬
          </div>
        </div>

        <div className={styles.pageActions}>
          <Link href="/customers?filter=overdue" className={styles.btnGhost}>
            연체 거래처 보기
          </Link>
          <Link href="/payments/new" className={styles.btnPrimary}>
            + 수금 등록
          </Link>
        </div>
      </div>

      <div className={styles.opsStrip}>
        <div className={styles.opsHead}>
          <div className={styles.opsHeadLabel}>오늘 운영 현황</div>
        </div>

        <div className={styles.opsCells}>
          <Link href="/customers?filter=receivable" className={`${styles.opsCell} ${styles.opsCellOrange}`}>
            <div className={styles.opsLabel}>오늘 수금 예정</div>
            <div className={`${styles.opsNum} ${styles.numOrange}`}>{todayCollectionCount}곳</div>
            <div className={styles.opsSub}>{formatKRW(totalReceivable)} 대상</div>
          </Link>

          <Link href="/customers?filter=receivable" className={`${styles.opsCell} ${styles.opsCellGreen}`}>
            <div className={styles.opsLabel}>총 미수금</div>
            <div className={`${styles.opsNum} ${styles.numNormal}`}>{formatKRW(totalReceivable)}</div>
            <div className={styles.opsSub}>거래처 원장 이동</div>
          </Link>

          <Link href="/customers?filter=risk" className={`${styles.opsCell} ${styles.opsCellAmber}`}>
            <div className={styles.opsLabel}>수금 지연 거래처</div>
            <div className={`${styles.opsNum} ${styles.numAmber}`}>{delayedCount}곳</div>
            <div className={styles.opsSub}>D+14 이상 미수금</div>
          </Link>

          <Link href="/customers?filter=overdue" className={`${styles.opsCell} ${styles.opsCellRed}`}>
            <div className={styles.opsLabel}>총 연체금</div>
            <div className={`${styles.opsNum} ${styles.numRed}`}>{formatKRW(totalOverdue)}</div>
            <div className={styles.opsSub}>
              {overdueCount > 0 ? `${overdueCount}곳 연체 중` : '연체 없음 · 정상'}
            </div>
          </Link>
        </div>
      </div>

      <CustomersOpsListClient items={all} initialFilter={initialFilter} />
    </main>
  )
}