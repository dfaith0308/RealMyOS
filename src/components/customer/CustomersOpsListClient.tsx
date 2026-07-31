'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatKRW } from '@/lib/calc'
import { classifyAccountsReceivable } from '@/lib/ledger-calc'
import type { CustomerWithScore } from '@/actions/ledger'
import { Surface } from '@/components/ui/Surface'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataCell, DataTableRow } from '@/components/ui/DataTableRow'
import styles from './CustomersOpsListClient.module.css'

type FilterKey = 'all' | 'overdue' | 'risk' | 'new' | 'normal'

function normalize(s: string) {
  return s.trim().toLowerCase()
}

function getRowVariant(c: CustomerWithScore): 'danger' | 'amber' | 'normal' {
  if (c.overdue_amount > 0) return 'danger'
  if ((c.days_since_payment ?? 0) >= 14 && (c.receivable_amount ?? 0) > 0) return 'amber'
  return 'normal'
}

function getBadgeClass(
  c: CustomerWithScore,
  styles: Record<string, string>,
): string {
  if (c.overdue_amount > 0) return styles.badgeDanger
  if ((c.days_since_payment ?? 0) >= 14 && (c.receivable_amount ?? 0) > 0) return styles.badgeAmber
  if (c.status === 'new') return styles.badgeNew
  return styles.badgeNormal
}

function getBadgeLabel(c: CustomerWithScore): string {
  if (c.overdue_amount > 0) return '연체'
  if ((c.days_since_payment ?? 0) >= 14 && (c.receivable_amount ?? 0) > 0) return '수금 지연'
  if (c.status === 'new') return '신규'
  return '정상'
}

function getDaysClass(
  c: CustomerWithScore,
  styles: Record<string, string>,
): string {
  if (c.overdue_amount > 0) return styles.daysRed
  if ((c.days_since_payment ?? 0) >= 14) return styles.daysAmber
  return styles.daysOk
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
      <div className={styles.filterRow}>
        <input
          className={styles.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="거래처 검색 (이름 / 전화번호)"
          aria-label="거래처 검색"
        />

        <div className={styles.chips}>
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            전체 {counts.all}
          </Chip>
          <Chip active={filter === 'overdue'} onClick={() => setFilter('overdue')} variant="danger">
            연체 {counts.overdue}
          </Chip>
          <Chip active={filter === 'risk'} onClick={() => setFilter('risk')} variant="amber">
            수금 지연 {counts.risk}
          </Chip>
          <Chip active={filter === 'new'} onClick={() => setFilter('new')}>
            신규 {counts.new}
          </Chip>
          <Chip active={filter === 'normal'} onClick={() => setFilter('normal')}>
            정상 {counts.normal}
          </Chip>
        </div>
      </div>

      <div className={styles.listCard}>
        <div className={styles.listHead}>
          <div className={styles.listTitle}>거래처 목록 · 수금 우선순위 정렬</div>
          <div className={styles.listMeta}>
            {visible.length} / {items.length}
          </div>
        </div>

        <div className={styles.colHeader}>
          <span>상태</span>
          <span>거래처</span>
          <span className={styles.alR}>마지막 수금</span>
          <span className={styles.alR}>미수/초과입금</span>
          <span className={styles.alR}>액션</span>
        </div>

        <div className={styles.rows}>
          {visible.length === 0 ? (
            <div className={styles.empty}>해당 거래처가 없습니다</div>
          ) : (
            visible.map((c) => {
              const variant = getRowVariant(c)
              const detailHref = `/customers/${c.id}`
              const rowClass = [
                styles.row,
                variant === 'danger' ? styles.rowDanger : '',
                variant === 'amber' ? styles.rowAmber : '',
              ].filter(Boolean).join(' ')

              const badgeCls = [styles.badge, getBadgeClass(c, styles)].join(' ')
              const daysCls = [styles.daysVal, getDaysClass(c, styles)].join(' ')

              const ar = classifyAccountsReceivable(c.receivable_amount ?? 0)
              const moneyMainCls = [
                styles.moneyMain,
                c.overdue_amount > 0 ? styles.moneyDanger : '',
                ar.kind === 'settled' ? styles.moneyZero : '',
                ar.kind === 'prepayment' ? styles.moneyPrepay : '',
              ].filter(Boolean).join(' ')

              const moneySubCls = [
                styles.moneySub,
                c.overdue_amount > 0 ? styles.moneySubDanger : '',
              ].filter(Boolean).join(' ')

              const btnCls = [
                styles.regBtn,
                ar.kind !== 'receivable' ? styles.regBtnDim : '',
              ].filter(Boolean).join(' ')

              return (
                <div
                  key={c.id}
                  className={rowClass}
                  onClick={() => router.push(detailHref)}
                  role="button"
                  tabIndex={0}
                >
                  <div className={badgeCls}>
                    {getBadgeLabel(c)}
                  </div>

                  <div className={styles.rowInfo}>
                    <div className={styles.rowName}>{c.name}</div>
                    <div className={styles.rowSub}>
                      <span>조건 {c.payment_terms_days ?? 0}일</span>
                      <span>·</span>
                      <span>
                        {c.last_payment_date
                          ? `마지막 수금 D+${c.days_since_payment ?? 0}`
                          : '수금 이력 없음'}
                      </span>
                      <span>·</span>
                      <span>
                        {c.last_contacted_at
                          ? `연락 D+${c.days_since_contact ?? 0}`
                          : '연락 기록 없음'}
                      </span>
                    </div>
                  </div>

                  <div className={styles.colDays}>
                    <div className={daysCls}>
                      {c.last_payment_date
                        ? `D+${c.days_since_payment ?? 0}`
                        : '이력 없음'}
                    </div>
                    <div className={styles.daysSub}>마지막 수금</div>
                  </div>

                  <div className={styles.colMoney}>
                    <div className={moneyMainCls}>{formatKRW(ar.absolute)}</div>
                    <div className={moneySubCls}>
                      {ar.kind === 'prepayment'
                        ? ar.hint ?? '초과입금'
                        : `연체 ${formatKRW(c.overdue_amount ?? 0)}`}
                    </div>
                  </div>

                  <div className={styles.colAction}>
                    <Link
                      href={`/payments/new?customer_id=${c.id}`}
                      className={btnCls}
                      onClick={(e) => e.stopPropagation()}
                    >
                      수금 등록
                    </Link>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
  variant,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  variant?: 'danger' | 'amber'
}) {
  const cls = [
    styles.chip,
    active && variant === 'danger' ? styles.chipActiveDanger :
    active && variant === 'amber'  ? styles.chipActiveAmber  :
    active                         ? styles.chipActive       : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

