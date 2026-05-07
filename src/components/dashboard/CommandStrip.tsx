import Link from 'next/link'
import { Suspense } from 'react'
import { getAiInsight } from '@/actions/dashboard'
import { fallbackMessage } from '@/lib/dashboard-utils'
import { Surface } from '@/components/ui/Surface'
import styles from './CommandStrip.module.css'

import type { DashboardData } from '@/actions/dashboard'

export function CommandStrip({ d }: { d: DashboardData }) {
  const warning =
    d.overdue_count > 0
      ? `연체 거래처 ${d.overdue_count}곳 · 오늘 수금 우선`
      : d.total_receivable > 0
        ? `미수금이 있습니다 · 오늘 수금 흐름을 확인하세요`
        : `오늘 처리할 수금이 없습니다`

  return (
    <Surface variant="panel" density="comfortable">
      <div className={styles.root}>
        <div className={styles.left}>
          <div className={styles.kicker}>Today</div>
          <div className={styles.headline}>{warning}</div>
          <Suspense fallback={<div className={styles.sub}>{fallbackMessage(d.ai_context)}</div>}>
            <AiLine context={d.ai_context} />
          </Suspense>
        </div>

        <div className={styles.right}>
          <Link href="/payments/new" className={[styles.btn, styles.btnPrimary].join(' ')}>
            수금 등록
          </Link>
          <Link href="/customers" className={styles.btn}>
            연체 거래처 보기
          </Link>
        </div>
      </div>
    </Surface>
  )
}

async function AiLine({
  context,
}: {
  context: Parameters<typeof getAiInsight>[0]
}) {
  const msg = await getAiInsight(context)
  return <div className={styles.sub}>{msg}</div>
}

