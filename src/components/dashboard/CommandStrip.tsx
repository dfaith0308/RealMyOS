import Link from 'next/link'
import { Suspense } from 'react'
import { Surface } from '@/components/ui/Surface'
import styles from './CommandStrip.module.css'

import { getAiInsight } from '@/actions/dashboard'
import { fallbackMessage } from '@/lib/dashboard-utils'
import type { DashboardData } from '@/actions/dashboard'

export function CommandStrip(props: {
  kicker?: string
  headline: string
  subline?: React.ReactNode
  actions: Array<{
    label: string
    href: string
    kind?: 'primary' | 'secondary'
  }>
  /** Dashboard 전용: AI 한줄(서버) */
  ai?: { context: DashboardData['ai_context'] }
}) {
  const { kicker = 'Today', headline, subline, actions, ai } = props

  return (
    <Surface variant="panel" density="comfortable">
      <div className={styles.root}>
        <div className={styles.left}>
          <div className={styles.kicker}>{kicker}</div>
          <div className={styles.headline}>{headline}</div>

          {ai ? (
            <Suspense
              fallback={
                <div className={styles.sub}>
                  {subline ?? fallbackMessage(ai.context)}
                </div>
              }
            >
              <AiLine context={ai.context} />
            </Suspense>
          ) : subline ? (
            <div className={styles.sub}>{subline}</div>
          ) : null}
        </div>

        <div className={styles.right}>
          {actions.slice(0, 2).map((a) => (
            <Link
              key={`${a.href}-${a.label}`}
              href={a.href}
              className={[
                styles.btn,
                a.kind === 'primary' ? styles.btnPrimary : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {a.label}
            </Link>
          ))}
        </div>
      </div>
    </Surface>
  )
}

export function DashboardCommandStrip({ d }: { d: DashboardData }) {
  const headline =
    d.overdue_count > 0
      ? `연체 거래처 ${d.overdue_count}곳 · 오늘 수금 우선`
      : d.total_receivable > 0
        ? `미수금이 있습니다 · 오늘 수금 흐름을 확인하세요`
        : `오늘 처리할 수금이 없습니다`

  return (
    <CommandStrip
      headline={headline}
      actions={[
        { label: '수금 등록', href: '/payments/new', kind: 'primary' },
        { label: '연체 거래처 보기', href: '/customers?filter=overdue' },
      ]}
      ai={{ context: d.ai_context }}
    />
  )
}

async function AiLine({ context }: { context: Parameters<typeof getAiInsight>[0] }) {
  const msg = await getAiInsight(context)
  return <div className={styles.sub}>{msg}</div>
}

