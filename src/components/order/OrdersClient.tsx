'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatKRW } from '@/lib/calc'
import type { OrderListItem } from '@/actions/order-query'
import { CommandStrip } from '@/components/dashboard/CommandStrip'
import { Surface } from '@/components/ui/Surface'
import { KPIBlock } from '@/components/ui/KPIBlock'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataCell, DataTableRow } from '@/components/ui/DataTableRow'
import styles from '@/app/(app)/orders/orders-ops.module.css'

interface Filters { from: string; to: string; status: string; customer_id: string }
interface Customer { id: string; name: string }

interface Props {
  orders: OrderListItem[]
  customers: Customer[]
  filters: Filters
}

type StatusChip = '' | 'draft' | 'confirmed' | 'cancelled' | 'today'
type Preset = 'month' | '7d' | 'custom'

function kstTodayStr() {
  const now = new Date(Date.now() + 9 * 3600000)
  return now.toISOString().slice(0, 10)
}

function monthStartStr() {
  const d = new Date(Date.now() + 9 * 3600000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function daysAgoStr(n: number) {
  const d = new Date(Date.now() + 9 * 3600000)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function OrdersClient({ orders, customers, filters }: Props) {
  const router   = useRouter()

  const [from, setFrom] = useState(filters.from)
  const [to, setTo] = useState(filters.to)
  const [customerId, setCustomerId] = useState(filters.customer_id)
  const [status, setStatus] = useState<StatusChip>(
    filters.status === 'draft' || filters.status === 'confirmed' || filters.status === 'cancelled'
      ? (filters.status as StatusChip)
      : '',
  )

  const preset: Preset = useMemo(() => {
    if (from === monthStartStr() && to === kstTodayStr()) return 'month'
    if (from === daysAgoStr(6) && to === kstTodayStr()) return '7d'
    return 'custom'
  }, [from, to])

  const debounce = useRef<number | null>(null)
  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (customerId) params.set('customer_id', customerId)
      if (status && status !== 'today') params.set('status', status)
      const q = params.toString()
      router.push(q ? `/orders?${q}` : '/orders')
    }, 250)
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current)
    }
  }, [from, to, customerId, status, router])

  const todayStr = useMemo(() => kstTodayStr(), [])

  const baseOrders = useMemo(() => {
    if (status === 'today') {
      return orders.filter((o) => o.order_date === todayStr && o.status !== 'cancelled')
    }
    return orders
  }, [orders, status, todayStr])

  const counts = useMemo(() => {
    const draft = orders.filter((o) => o.status === 'draft').length
    const confirmed = orders.filter((o) => o.status === 'confirmed').length
    const cancelled = orders.filter((o) => o.status === 'cancelled').length
    const today = orders.filter((o) => o.order_date === todayStr && o.status !== 'cancelled').length
    const todayNeeds = orders.filter((o) => o.order_date === todayStr && o.status === 'draft').length
    const periodConfirmedAmt = orders
      .filter((o) => o.status === 'confirmed')
      .reduce((s, o) => s + o.total_amount, 0)
    return { draft, confirmed, cancelled, today, todayNeeds, periodConfirmedAmt }
  }, [orders, todayStr])

  const headline = `오늘 처리할 주문 ${counts.today}건`
  const subline = (
    <>
      처리 필요(draft) {counts.draft} · 오늘 주문 {counts.today} · 진행 {counts.confirmed}
    </>
  )

  const badgeStatus = counts.draft > 0 ? ('warning' as const) : ('confirmed' as const)

  function summarizeLines(lines: OrderListItem['order_lines']): string {
    if (!lines.length) return '-'
    if (lines.length === 1) return `${lines[0].product_name} ${lines[0].quantity}개`
    return `${lines[0].product_name} 외 ${lines.length - 1}건`
  }

  const groupedByDate = useMemo(() => {
    const map = new Map<string, { date: string; rows: OrderListItem[]; cnt: number; sum: number }>()
    for (const o of baseOrders) {
      const g = map.get(o.order_date) ?? { date: o.order_date, rows: [], cnt: 0, sum: 0 }
      g.rows.push(o)
      g.cnt += 1
      g.sum += o.total_amount ?? 0
      map.set(o.order_date, g)
    }
    return [...map.values()]
  }, [baseOrders])

  return (
    <>
      <CommandStrip
        kicker="Orders"
        headline={headline}
        subline={subline}
        actions={[
          { label: '주문 등록', href: '/orders/new', kind: 'primary' },
          { label: 'Draft 보기', href: '/orders?status=draft', kind: 'secondary' },
        ]}
      />

      <Surface variant="panel" density="comfortable">
        <div className={styles.kpiStrip}>
          <div className={styles.kpiBox}>
            <div className={styles.kpiHead}>
              <div className={styles.kpiHeadLabel}>처리 필요(draft)</div>
              <StatusBadge status={badgeStatus} size="sm" />
            </div>
            <KPIBlock
              label="처리 필요(draft)"
              value={`${counts.draft}건`}
              valueSize="lg"
              align="end"
              hint={`오늘 draft ${counts.todayNeeds}건`}
            />
          </div>

          <KPIBlock label="오늘 주문" value={`${counts.today}건`} align="end" />
          <KPIBlock label="진행(confirmed)" value={`${counts.confirmed}건`} align="end" />
          <KPIBlock label="취소" value={`${counts.cancelled}건`} align="end" />
          <KPIBlock label="기간 확정 매출" value={formatKRW(counts.periodConfirmedAmt)} align="end" />
        </div>

        <div className={styles.kpiNote}>
          기간 {from} ~ {to}
        </div>
      </Surface>

      <Surface variant="panel" density="comfortable">
        <div className={styles.controls}>
          <div className={styles.chipRow} aria-label="상태 필터">
            <Chip active={status === ''} onClick={() => setStatus('')}>전체</Chip>
            <Chip active={status === 'draft'} onClick={() => setStatus('draft')}>처리 필요</Chip>
            <Chip active={status === 'confirmed'} onClick={() => setStatus('confirmed')}>진행</Chip>
            <Chip active={status === 'cancelled'} onClick={() => setStatus('cancelled')}>취소</Chip>
            <Chip
              active={status === 'today'}
              onClick={() => {
                setStatus('today')
                setFrom(todayStr)
                setTo(todayStr)
              }}
            >
              오늘
            </Chip>
          </div>

          <select
            className={styles.select}
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            aria-label="거래처"
          >
            <option value="">전체 거래처</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className={styles.chipRow} aria-label="기간 프리셋">
            <Chip active={preset === 'month'} onClick={() => {
              setFrom(monthStartStr())
              setTo(kstTodayStr())
            }}>이번달</Chip>
            <Chip active={preset === '7d'} onClick={() => {
              setFrom(daysAgoStr(6))
              setTo(kstTodayStr())
            }}>최근7일</Chip>
            <Chip active={preset === 'custom'} onClick={() => {}}>직접</Chip>
          </div>

          <input
            className={styles.dateInput}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="시작일"
          />
          <span className={styles.sep}>~</span>
          <input
            className={styles.dateInput}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="종료일"
          />
        </div>
      </Surface>

      <Surface variant="panel" density="comfortable">
        <div className={styles.queue}>
          {baseOrders.length === 0 ? (
            <div className={styles.empty}>조건에 해당하는 주문이 없습니다</div>
          ) : (
            groupedByDate.map((g) => (
              <div key={`g-${g.date}`}>
                <div className={styles.groupHead}>
                  <div className={styles.groupLeft}>
                    <div className={styles.groupTitle}>{g.date}</div>
                    <div className={styles.groupMeta}>{g.cnt}건</div>
                  </div>
                  <div className={styles.groupNums}>
                    <span className={styles.gNum}>합계 {formatKRW(g.sum)}</span>
                  </div>
                </div>

                {g.rows.map((o) => {
                  const statusKey =
                    o.status === 'draft'
                      ? ('pending' as const)
                      : o.status === 'confirmed'
                        ? ('confirmed' as const)
                        : ('cancelled' as const)

                  const statusLabel =
                    o.status === 'draft'
                      ? '처리 필요'
                      : o.status === 'confirmed'
                        ? '진행'
                        : '종료'

                  const bal = o.current_balance ?? null
                  const dep = o.deposit_amount ?? 0
                  const hasDep = dep >= 100

                  return (
                    <DataTableRow key={o.id} density="compact">
                      <DataCell>
                        <div className={styles.rowMain}>
                          <div className={styles.rowTitle}>
                            {o.customer_name}{' '}
                            <span className={styles.rowSub}>· #{o.order_number}</span>
                          </div>
                          <div className={styles.rowSub}>
                            {summarizeLines(o.order_lines)}
                          </div>
                        </div>
                      </DataCell>

                      <DataCell align="end" tone="secondary">
                        <StatusBadge status={statusKey} size="sm" />{' '}
                        <span className={styles.rowSub}>{statusLabel}</span>
                      </DataCell>

                      <DataCell align="end">
                        <span className={styles.num}>{formatKRW(o.total_amount)}</span>
                      </DataCell>

                      <DataCell align="end" tone="secondary">
                        <span className={styles.numSecondary}>
                          {bal === null ? '미수 -' : `미수 ${formatKRW(bal)}`}
                        </span>
                      </DataCell>

                      <DataCell align="end" tone="muted">
                        {hasDep ? <span className={styles.tag}>예치 {formatKRW(dep)}</span> : null}
                      </DataCell>

                      <DataCell align="end">
                        <Link href={`/orders/${o.id}`} className={styles.btnOpen}>
                          열기
                        </Link>
                      </DataCell>
                    </DataTableRow>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </Surface>
    </>
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
