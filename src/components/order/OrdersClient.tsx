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
import styles from '@/app/(app)/orders/orders-ops.module.css'
import { ORDER_OPERATION_STATUS_LIST, type OrderOperationStatus } from '@/types/order'

interface Filters { from: string; to: string; status: string; order_status: OrderOperationStatus | ''; customer_id: string }
interface Customer { id: string; name: string }

interface Props {
  orders: OrderListItem[]
  customers: Customer[]
  filters: Filters
}

type StatusChip = '' | 'draft' | 'confirmed' | 'cancelled' | 'today'
type OpsTab = 'all' | 'today_delivery' | 'delayed' | 'prep' | 'done'
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
  const [opsTab, setOpsTab] = useState<OpsTab>('all')
  const [orderStatus, setOrderStatus] = useState<OrderOperationStatus | ''>(filters.order_status ?? '')

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
      if (orderStatus) params.set('order_status', orderStatus)
      const q = params.toString()
      router.push(q ? `/orders?${q}` : '/orders')
    }, 250)
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current)
    }
  }, [from, to, customerId, status, orderStatus, router])

  const todayStr = useMemo(() => kstTodayStr(), [])

  const baseOrders = useMemo(() => {
    if (status === 'today') {
      return orders.filter((o) => o.order_date === todayStr && o.status !== 'cancelled')
    }
    return orders
  }, [orders, status, todayStr])

  const opsFiltered = useMemo(() => {
    const ms1d = 86400000
    const todayMs = new Date(todayStr + 'T00:00:00Z').getTime()
    const isDelayed = (o: OrderListItem) => {
      // due_date 부재 → 운영 탭의 "지연"은 order_date 기준 근사치
      if (o.order_status === '납품완료' || o.order_status === '취소') return false
      const d = new Date(o.order_date + 'T00:00:00Z').getTime()
      return d <= todayMs - ms1d
    }
    if (opsTab === 'all') return baseOrders
    if (opsTab === 'prep') return baseOrders.filter((o) => o.order_status === '출고준비')
    if (opsTab === 'done') return baseOrders.filter((o) => o.order_status === '납품완료')
    if (opsTab === 'today_delivery') {
      return baseOrders.filter(
        (o) =>
          o.order_date === todayStr &&
          (o.order_status === '출고완료' || o.order_status === '납품완료'),
      )
    }
    // delayed
    return baseOrders.filter(isDelayed)
  }, [baseOrders, opsTab, todayStr])

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
    for (const o of opsFiltered) {
      const g = map.get(o.order_date) ?? { date: o.order_date, rows: [], cnt: 0, sum: 0 }
      g.rows.push(o)
      g.cnt += 1
      g.sum += o.total_amount ?? 0
      map.set(o.order_date, g)
    }
    return [...map.values()]
  }, [opsFiltered])

  function statusBadge(o: OrderListItem): { label: string; bg: string; fg: string } | null {
    if (o.status === 'cancelled') return { label: '취소', bg: 'var(--bg-danger)', fg: 'var(--text-danger)' }
    if (o.status === 'confirmed') return { label: '확정', bg: 'var(--bg-success)', fg: 'var(--text-success)' }
    if (o.status === 'draft') return { label: '진행', bg: 'var(--bg-accent)', fg: 'var(--text-accent)' }
    return null
  }

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
          <div className={styles.chipRow} aria-label="주문현황 탭">
            <Chip active={opsTab === 'all'} onClick={() => setOpsTab('all')}>전체</Chip>
            <Chip active={opsTab === 'today_delivery'} onClick={() => setOpsTab('today_delivery')}>오늘납품</Chip>
            <Chip active={opsTab === 'delayed'} onClick={() => setOpsTab('delayed')}>지연</Chip>
            <Chip active={opsTab === 'prep'} onClick={() => setOpsTab('prep')}>출고준비</Chip>
            <Chip active={opsTab === 'done'} onClick={() => setOpsTab('done')}>완료</Chip>
          </div>

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

          <select
            className={styles.select}
            value={orderStatus}
            onChange={(e) => setOrderStatus((e.target.value || '') as OrderOperationStatus | '')}
            aria-label="주문상태"
          >
            <option value="">주문상태 전체</option>
            {ORDER_OPERATION_STATUS_LIST.map((s) => (
              <option key={s} value={s}>
                {s}
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
            <div
              style={{
                background: 'var(--surface-2)',
                borderRadius: 12,
                border: '1px solid var(--border)',
                overflow: 'hidden',
              }}
            >
              {groupedByDate.map((g, gi) => (
                <div key={`g-${g.date}`} style={{ borderTop: gi === 0 ? 'none' : '1px solid var(--border)' }}>
                  {/* 날짜 그룹 헤더 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 20px',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--surface-2)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        {g.date}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-hint)', whiteSpace: 'nowrap' }}>{g.cnt}건</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      합계 {formatKRW(g.sum)}
                    </span>
                  </div>

                  {/* 컬럼 헤더 */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 80px',
                      padding: '8px 20px',
                      background: 'var(--surface-0)',
                      borderBottom: '1px solid var(--border)',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--text-hint)', fontWeight: 500, whiteSpace: 'nowrap' }}>거래처 · 상품</span>
                    <span style={{ fontSize: 11, color: 'var(--text-hint)', fontWeight: 500, textAlign: 'right', whiteSpace: 'nowrap' }}>금액</span>
                    <span style={{ fontSize: 11, color: 'var(--text-hint)', fontWeight: 500, textAlign: 'right', whiteSpace: 'nowrap' }}>미수금</span>
                    <span />
                  </div>

                  {g.rows.map((o) => {
                    const bal = o.current_balance ?? 0
                    const dep = o.deposit_amount ?? 0
                    const hasDep = dep >= 100
                    const st = statusBadge(o)
                    return (
                      <div
                        key={o.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '2fr 1fr 1fr 80px',
                          padding: '14px 20px',
                          borderBottom: '0.5px solid var(--border)',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        {/* 거래처 + 상품 */}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, minWidth: 0 }}>
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: 500,
                                color: 'var(--text-primary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={o.customer_name}
                            >
                              {o.customer_name}
                            </span>

                            {st && (
                              <span
                                style={{
                                  fontSize: 11,
                                  background: st.bg,
                                  color: st.fg,
                                  padding: '2px 7px',
                                  borderRadius: 20,
                                  fontWeight: 500,
                                  flexShrink: 0,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {st.label}
                              </span>
                            )}

                            {hasDep ? (
                              <span
                                style={{
                                  fontSize: 11,
                                  background: 'var(--bg-warning)',
                                  color: 'var(--text-warning)',
                                  padding: '2px 7px',
                                  borderRadius: 20,
                                  fontWeight: 500,
                                  flexShrink: 0,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                예치 {formatKRW(dep)}
                              </span>
                            ) : null}
                          </div>

                          <span
                            style={{
                              fontSize: 12,
                              color: 'var(--text-hint)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: 'block',
                            }}
                            title={summarizeLines(o.order_lines)}
                          >
                            {summarizeLines(o.order_lines)}
                          </span>
                        </div>

                        {/* 금액 */}
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: 'var(--text-primary)',
                            textAlign: 'right',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatKRW(o.total_amount)}
                        </span>

                        {/* 미수금 */}
                        <span
                          style={{
                            fontSize: 13,
                            color: bal > 0 ? 'var(--text-danger)' : 'var(--text-hint)',
                            textAlign: 'right',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatKRW(bal)}
                        </span>

                        {/* 열기 버튼 */}
                        <div style={{ textAlign: 'right' }}>
                          <Link
                            href={`/orders/${o.id}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              color: 'var(--text-muted)',
                              background: 'var(--surface-0)',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              padding: '5px 12px',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              textDecoration: 'none',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            열기
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
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
