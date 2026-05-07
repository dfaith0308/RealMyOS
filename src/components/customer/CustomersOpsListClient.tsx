'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatKRW } from '@/lib/calc'
import type { CustomerWithScore } from '@/actions/ledger'
import { Surface } from '@/components/ui/Surface'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataCell, DataTableRow } from '@/components/ui/DataTableRow'
import styles from './CustomersOpsListClient.module.css'

type FilterKey = 'all' | 'overdue' | 'risk' | 'new' | 'normal'

function normalize(s: string) {
  return s.trim().toLowerCase()
}

function tagTexts(c: CustomerWithScore) {
  const tags: string[] = []
  if (c.status === 'new') tags.push('신규')
  if (c.status === 'normal') tags.push('정상')
  if (c.status === 'danger') tags.push('위험')
  if (c.status === 'scheduled') tags.push('수금예정')
  if (c.overdue_amount > 0) tags.push('연체')
  // cap 2
  return tags.slice(0, 2)
}

function badgeStatus(c: CustomerWithScore): 'overdue' | 'warning' | 'pending' | null {
  if (c.overdue_amount > 0) return 'overdue'
  if (c.status === 'scheduled') return 'pending'
  if (c.status === 'danger' || c.status === 'warning') return 'warning'
  return null
}

export function CustomersOpsListClient({
  items,
  initialFilter = 'all',
}: {
  items: CustomerWithScore[]
  initialFilter?: FilterKey
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<FilterKey>(initialFilter)

  const counts = useMemo(() => {
    const c = { all: items.length, overdue: 0, risk: 0, new: 0, normal: 0 }
    for (const it of items) {
      if (it.overdue_amount > 0) c.overdue++
      if (it.status === 'danger' || it.status === 'warning') c.risk++
      if (it.status === 'new') c.new++
      if (it.status === 'normal') c.normal++
    }
    return c
  }, [items])

  const visible = useMemo(() => {
    const nq = normalize(q)
    return items.filter((c) => {
      if (filter === 'overdue' && !(c.overdue_amount > 0)) return false
      if (filter === 'risk' && !(c.status === 'danger' || c.status === 'warning')) return false
      if (filter === 'new' && c.status !== 'new') return false
      if (filter === 'normal' && c.status !== 'normal') return false

      if (!nq) return true
      return normalize(c.name).includes(nq) || normalize(c.phone ?? '').includes(nq)
    })
  }, [items, q, filter])

  return (
    <div className={styles.wrap}>
      <Surface variant="panel" density="comfortable">
        <div className={styles.filters}>
          <input
            className={styles.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="거래처 검색 (이름/전화)"
            aria-label="거래처 검색"
          />

          <div className={styles.chips} role="tablist" aria-label="거래처 필터">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
              전체 {counts.all}
            </Chip>
            <Chip active={filter === 'overdue'} onClick={() => setFilter('overdue')}>
              연체 {counts.overdue}
            </Chip>
            <Chip active={filter === 'risk'} onClick={() => setFilter('risk')}>
              위험 {counts.risk}
            </Chip>
            <Chip active={filter === 'new'} onClick={() => setFilter('new')}>
              신규 {counts.new}
            </Chip>
            <Chip active={filter === 'normal'} onClick={() => setFilter('normal')}>
              정상 {counts.normal}
            </Chip>
          </div>
        </div>
      </Surface>

      <Surface variant="panel" density="comfortable">
        <div className={styles.listHead}>
          <div className={styles.listTitle}>거래처 (채권 운영)</div>
          <div className={styles.listMeta}>
            {visible.length} / {items.length}
          </div>
        </div>

        <div className={styles.rows}>
          {visible.length === 0 ? (
            <div className={styles.empty}>해당 거래처가 없습니다</div>
          ) : (
            visible.map((c) => {
              const badge = badgeStatus(c)
              const tags = tagTexts(c)
              const ledgerHref = `/customers/${c.id}/ledger`

              return (
                <DataTableRow
                  key={c.id}
                  density="compact"
                  onClick={() => router.push(ledgerHref)}
                >
                  <DataCell>
                    <div className={styles.rowLeft}>
                      <div className={styles.nameRow}>
                        {badge ? <StatusBadge status={badge} size="sm" /> : null}
                        <div className={styles.name}>{c.name}</div>
                        {tags.length > 0 ? (
                          <div className={styles.tags}>
                            {tags.map((t) => (
                              <span key={`${c.id}-${t}`} className={styles.tag}>
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className={styles.evidence}>
                        <span className={styles.eItem}>
                          조건 {c.payment_terms_days ?? 0}일
                        </span>
                        <span className={styles.eItem}>
                          최근 수금(7일) {c.payments_7d ?? 0}회
                        </span>
                        <span className={styles.eItem}>
                          연락{' '}
                          {c.last_contacted_at
                            ? `D+${c.days_since_contact ?? 0}`
                            : '기록 없음'}
                        </span>
                      </div>
                    </div>
                  </DataCell>

                  <DataCell align="end">
                    <div className={styles.moneyCol}>
                      <div className={styles.moneyMain}>
                        {formatKRW(c.receivable_amount ?? 0)}
                      </div>
                      <div
                        className={[
                          styles.moneySub,
                          c.overdue_amount > 0 ? styles.moneySubStrong : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        연체 {formatKRW(c.overdue_amount ?? 0)}
                      </div>
                      <div className={styles.moneySub}>
                        예치 {formatKRW((c as any).deposit_amount ?? 0)}
                      </div>
                    </div>
                  </DataCell>

                  <DataCell align="end">
                    <Link
                      href={`/payments/new?customer_id=${c.id}`}
                      className={styles.actionBtn}
                      onClick={(e) => e.stopPropagation()}
                    >
                      수금 등록
                    </Link>
                  </DataCell>
                </DataTableRow>
              )
            })
          )}
        </div>
      </Surface>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={[styles.chip, active ? styles.chipActive : '']
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

