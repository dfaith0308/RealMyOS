import { getCustomersWithScore } from '@/actions/ledger'
import { formatKRW } from '@/lib/calc'
import type { CustomerWithScore } from '@/actions/ledger'
import { CommandStrip } from '@/components/dashboard/CommandStrip'
import { CustomersOpsListClient } from '@/components/customer/CustomersOpsListClient'
import styles from './customers-ops.module.css'

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

  return (
    <main className={styles.page}>
      <CommandStrip
        kicker="Customers"
        headline={`연체 ${overdueCount}곳 · 총 미수 ${formatKRW(totalReceivable)}`}
        subline={`연체금 ${formatKRW(totalOverdue)} · 우선순위 기반 스캔`}
        actions={[
          { label: '수금 등록', href: '/payments/new', kind: 'primary' },
          { label: '연체 거래처 보기', href: '/customers?filter=overdue' },
        ]}
      />

      <CustomersOpsListClient items={all} initialFilter={initialFilter} />
    </main>
  )
}