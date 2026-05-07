import type { DashboardData, CollectionTarget } from '@/actions/dashboard'
import { formatKRW } from '@/lib/calc'
import { Surface } from '@/components/ui/Surface'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataCell, DataTableRow } from '@/components/ui/DataTableRow'
import styles from './DashboardQueueSection.module.css'

type CollectionItem = CollectionTarget

export function DashboardQueueSection({
  d,
  collections,
}: {
  d: DashboardData
  collections: CollectionItem[]
}) {
  const urgentCount = (d.overdue_count > 0 ? 1 : 0) + (d.fund_pending_count > 0 ? 1 : 0)
  const todayCount =
    (collections.length > 0 ? 1 : 0) +
    (d.rfq_unanswered_count > 0 ? 1 : 0) +
    (d.draft_order_count > 0 ? 1 : 0)
  const backlogCount = d.uncontacted_count > 0 ? 1 : 0

  return (
    <Surface variant="panel" density="comfortable">
      <div className={styles.root}>
        <div className={styles.head}>
          <div className={styles.title}>운영 Queue</div>
          <div className={styles.meta}>
            urgent {urgentCount} · today {todayCount} · backlog {backlogCount}
          </div>
        </div>

        <QueueGroup label="urgent">
          {d.overdue_count > 0 ? (
            <QueueRow
              href="/customers"
              status="overdue"
              title={`연체 거래처 ${d.overdue_count}곳`}
              hint="수금 우선순위 확인"
              right={`${formatKRW(d.total_overdue)}`}
              action="연체 보기 →"
            />
          ) : null}

          {d.fund_pending_count > 0 ? (
            <QueueRow
              href="/funds"
              status="warning"
              title={`자금 계획 미이행 ${d.fund_pending_count}건`}
              hint="오늘 계획을 이행 처리"
              right={formatKRW(d.fund_total_planned)}
              action="자금 이행 →"
            />
          ) : null}

          {d.overdue_count === 0 && d.fund_pending_count === 0 ? (
            <div className={styles.empty}>긴급 항목이 없습니다</div>
          ) : null}
        </QueueGroup>

        <QueueGroup label="today">
          {collections.length > 0 ? (
            <QueueRow
              href="/customers"
              status="pending"
              title={`오늘 수금 대상 ${collections.length}곳`}
              hint="바로 수금 등록으로 이동"
              right={formatKRW(
                collections.reduce((acc, it) => acc + (it.current_balance ?? 0), 0),
              )}
              action="대상 보기 →"
            />
          ) : null}

          {collections.slice(0, 3).map((c) => (
            <QueueRow
              key={`collect-${c.id}`}
              href={`/payments/new?customer_id=${c.id}`}
              status="pending"
              title={c.name}
              hint={
                c.last_payment_date
                  ? `마지막 수금 ${c.days_since_payment}일 전`
                  : '수금 이력 없음'
              }
              right={formatKRW(c.current_balance)}
              action="수금 등록 →"
            />
          ))}

          {d.rfq_unanswered_count > 0 ? (
            <QueueRow
              href="/rfq"
              status="warning"
              title={`RFQ 미응답 ${d.rfq_unanswered_count}건`}
              hint="24h 초과 요청 확인"
              right=""
              action="RFQ 확인 →"
            />
          ) : null}

          {d.draft_order_count > 0 ? (
            <QueueRow
              href="/orders"
              status="pending"
              title={`미처리 주문(draft) ${d.draft_order_count}건`}
              hint="확정/취소로 상태 정리"
              right=""
              action="주문 처리 →"
            />
          ) : null}

          {collections.length === 0 &&
          d.rfq_unanswered_count === 0 &&
          d.draft_order_count === 0 ? (
            <div className={styles.empty}>오늘 처리할 항목이 없습니다</div>
          ) : null}
        </QueueGroup>

        <QueueGroup label="backlog">
          {d.uncontacted_count > 0 ? (
            <QueueRow
              href="/customers"
              status="warning"
              title={`14일 이상 미연락 ${d.uncontacted_count}곳`}
              hint="연락 로그 점검 필요"
              right=""
              action="거래처 보기 →"
            />
          ) : (
            <div className={styles.empty}>백로그가 없습니다</div>
          )}
        </QueueGroup>
      </div>
    </Surface>
  )
}

function QueueGroup({
  label,
  children,
}: {
  label: 'urgent' | 'today' | 'backlog'
  children: React.ReactNode
}) {
  return (
    <div className={styles.group}>
      <div className={styles.groupTitle}>
        <div className={styles.groupLabel}>{label}</div>
      </div>
      <div className={styles.rows}>{children}</div>
    </div>
  )
}

function QueueRow({
  href,
  status,
  title,
  hint,
  right,
  action,
}: {
  href: string
  status: 'pending' | 'warning' | 'overdue'
  title: string
  hint: string
  right: string
  action: string
}) {
  return (
    <DataTableRow href={href} density="compact">
      <DataCell>
        <div className={styles.rowMain}>
          <StatusBadge status={status} size="sm" />
          <div className={styles.min0}>
            <div className={styles.rowTitle}>{title}</div>
            <div className={styles.rowHint}>{hint}</div>
          </div>
        </div>
      </DataCell>
      <DataCell align="end" tone="secondary">
        {right}
      </DataCell>
      <DataCell align="end">
        <div className={styles.action}>{action}</div>
      </DataCell>
    </DataTableRow>
  )
}

