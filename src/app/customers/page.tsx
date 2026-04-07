import Link from 'next/link'
import { getCustomersWithScore } from '@/actions/ledger'
import { formatKRW } from '@/lib/calc'
import { calcRecontactMessage, calcNoContactMessage } from '@/lib/customer-logic'
import type { CustomerStatus, CustomerWithScore } from '@/actions/ledger'
import type { ActionType } from '@/lib/customer-logic'
import CallButton from '@/components/customer/CallButton'
import ActionButton from '@/components/customer/ActionButton'

export const metadata = { title: '오늘 할 일 — RealMyOS' }

const STATUS_CFG: Record<CustomerStatus, { label: string; color: string; bg: string; border: string }> = {
  danger:  { label: '위험', color: '#B91C1C', bg: '#FEF2F2', border: '#FCA5A5' },
  warning: { label: '주의', color: '#B45309', bg: '#FFFBEB', border: '#FCD34D' },
  new:     { label: '신규', color: '#1D4ED8', bg: '#EFF6FF', border: '#93C5FD' },
  normal:  { label: '정상', color: '#15803D', bg: '#F0FDF4', border: '#86EFAC' },
}

const ACTION_CFG: Record<ActionType, { label: string; color: string; bg: string }> = {
  collect_payment: { label: '수금 요청', color: '#B91C1C', bg: '#FEF2F2' },
  visit:           { label: '방문 필요', color: '#7C3AED', bg: '#F5F3FF' },
  call:            { label: '주문 독려', color: '#B45309', bg: '#FFFBEB' },
  new_customer:    { label: '신규 관리', color: '#1D4ED8', bg: '#EFF6FF' },
  maintain:        { label: '유지',      color: '#15803D', bg: '#F0FDF4' },
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter } = await searchParams
  const result = await getCustomersWithScore()
  const all = result.data ?? []

  const dangerList  = all.filter((c) => c.status === 'danger')
  const warningList = all.filter((c) => c.status === 'warning')
  const newList     = all.filter((c) => c.status === 'new')
  const normalList  = all.filter((c) => c.status === 'normal')
  const totalBalance = all.reduce((s, c) => s + c.current_balance, 0)
  const totalOverdue = all.reduce((s, c) => s + c.overdue_amount, 0)
  const mustAct = all.filter((c) =>
    c.status === 'danger' ||
    (c.status === 'warning' && ((c.days_since_contact ?? 99) >= 3 || !c.last_contacted_at))
  )
  const top3 = dangerList.slice(0, 3)

  const displayed =
    filter === 'danger'  ? dangerList  :
    filter === 'warning' ? warningList :
    filter === 'new'     ? newList     :
    filter === 'normal'  ? normalList  : all

  return (
    <main style={s.page}>
      {/* 헤더 */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>오늘 할 일</h1>
          <div style={s.subtitleRow}>
            {mustAct.length > 0 && (
              <span style={s.mustBadge}>⚡ 오늘 반드시 {mustAct.length}건 행동 필요</span>
            )}
            <span style={s.subtitle}>
              전체 {all.length}개 · 연체금{' '}
              <strong style={{ color: totalOverdue > 0 ? '#B91C1C' : '#15803D' }}>
                {formatKRW(totalOverdue)}
              </strong>
              {' '}· 미수금 {formatKRW(totalBalance)}
            </span>
          </div>
        </div>
        <div style={s.headerBtns}>
          <Link href="/payments/new" style={s.subBtn}>수금 등록</Link>
          <Link href="/orders/new"   style={s.subBtn}>주문 등록</Link>
          <Link href="/customers/new" style={s.newBtn}>+ 거래처 등록</Link>
        </div>
      </div>

      {/* TOP 3 */}
      {top3.length > 0 && (
        <div style={s.alertBox}>
          <p style={s.alertTitle}>🚨 지금 바로 전화해야 할 거래처 — {top3.length}건</p>
          <div style={s.alertList}>
            {top3.map((c) => (
              <div key={c.id} style={s.alertRow}>
                <div style={s.alertLeft}>
                  <span style={s.alertName}>{c.name}</span>
                  <span style={s.alertMsg}>{c.action.text}</span>
                </div>
                <div style={s.alertBtns}>
                  {c.phone && (
                    <CallButton customerId={c.id} phone={c.phone} style="red"
                      triggeredMessage={c.action.text} messageKey={c.action.key}
                      customerStatus={c.status} scoreAtTime={c.score} amountAtTime={c.overdue_amount} />
                  )}
                  <ActionButton customerId={c.id} actionType="collect" href="/payments/new"
                    label="수금" btnStyle={bs.collectRed}
                    triggeredMessage={c.action.text} messageKey={c.action.key}
                    customerStatus={c.status} scoreAtTime={c.score} amountAtTime={c.overdue_amount} />
                  <Link href={`/customers/${c.id}/ledger`} style={s.ledgerBtnSm}>원장</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 필터 */}
      <div style={s.filterRow}>
        {[
          { key: undefined,   label: `전체 ${all.length}` },
          { key: 'danger',    label: `🔴 위험 ${dangerList.length}` },
          { key: 'warning',   label: `🟡 주의 ${warningList.length}` },
          { key: 'new',       label: `🔵 신규 ${newList.length}` },
          { key: 'normal',    label: `🟢 정상 ${normalList.length}` },
        ].map(({ key, label }) => (
          <Link key={label}
            href={key ? `/customers?filter=${key}` : '/customers'}
            style={(filter ?? undefined) === key ? s.filterActive : s.filterBtn}>
            {label}
          </Link>
        ))}
      </div>

      {displayed.length === 0 && <div style={s.empty}>해당 거래처가 없습니다.</div>}
      <div style={s.list}>
        {displayed.map((c) => <CustomerCard key={c.id} c={c} />)}
      </div>
    </main>
  )
}

function CustomerCard({ c }: { c: CustomerWithScore }) {
  const cfg    = STATUS_CFG[c.status]
  const actCfg = ACTION_CFG[c.action.action_type]
  const isHigh = c.action.urgency === 'high'
  const isMid  = c.action.urgency === 'mid'
  const recontact    = calcRecontactMessage(c.overdue_amount, c.days_since_contact, c.status)
  const noContactMsg = !c.last_contacted_at ? calcNoContactMessage(c.status, c.overdue_amount) : null

  return (
    <div style={{ ...s.card, borderLeft: `4px solid ${cfg.color}` }}>
      {recontact && <div style={s.recontactBanner}>🔁 {recontact}</div>}

      <div style={{
        ...s.actionBanner,
        background: isHigh ? '#FEF2F2' : isMid ? '#FFFBEB' : '#F9FAFB',
        borderBottom: `1px solid ${cfg.border}`,
        color: isHigh ? '#B91C1C' : isMid ? '#B45309' : '#6b7280',
      }}>
        <span style={s.actionIcon}>{isHigh ? '🔴' : isMid ? '🟡' : '🟢'}</span>
        <span style={{ ...s.actionText, fontWeight: isHigh ? 700 : 500, fontSize: isHigh ? 14 : 13 }}>
          {c.action.text}
        </span>
        {c.score > 30 && <span style={s.scorePill}>긴급도 {c.score}점</span>}
      </div>

      <div style={s.cardBody}>
        <div style={s.cardInfo}>
          <div style={s.nameRow}>
            <span style={s.custName}>{c.name}</span>
            <span style={{ ...s.badge, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
              {cfg.label}
            </span>
            <span style={{ ...s.badge, color: actCfg.color, background: actCfg.bg }}>
              {actCfg.label}
            </span>
          </div>

          <div style={s.metaRow}>
            <MetaItem label="연체금" value={formatKRW(c.overdue_amount)}
              highlight={c.overdue_amount > 0} />
            <MetaItem label="이번달" value={formatKRW(c.monthly_revenue)} />
            <MetaItem label="최근주문"
              value={c.last_order_date
                ? `${c.days_since_order}일 전${c.last_order_amount ? ` · ${formatKRW(c.last_order_amount)}` : ''}`
                : '없음'} />
            <MetaItem label="주문주기"
              value={c.order_cycle_days ? `${c.order_cycle_days}일` : '-'} />
            <MetaItem label="전화"
              value={c.last_contacted_at
                ? `${c.days_since_contact}일 전`
                : (noContactMsg ?? '기록 없음')}
              highlight={!c.last_contacted_at && (c.status === 'danger' || c.status === 'warning')}
              warn={(c.days_since_contact ?? 0) >= 5} />
          </div>
        </div>

        <div style={s.cardBtns}>
          {c.phone && (
            <CallButton customerId={c.id} phone={c.phone} style={isHigh ? 'hot' : 'cold'}
              triggeredMessage={c.action.text} messageKey={c.action.key}
              customerStatus={c.status} scoreAtTime={c.score} amountAtTime={c.overdue_amount} />
          )}
          <ActionButton customerId={c.id} actionType="collect" href="/payments/new"
            label="수금" btnStyle={isHigh ? bs.payHot : bs.payNormal}
            triggeredMessage={c.action.text} messageKey={c.action.key}
            customerStatus={c.status} scoreAtTime={c.score} amountAtTime={c.overdue_amount} />
          <ActionButton customerId={c.id} actionType="order" href="/orders/new"
            label="주문" btnStyle={bs.order}
            triggeredMessage={c.action.text} messageKey={c.action.key}
            customerStatus={c.status} scoreAtTime={c.score} amountAtTime={c.overdue_amount} />
          <Link href={`/customers/${c.id}/ledger`} style={s.ledgerBtn}>원장 →</Link>
        </div>
      </div>
    </div>
  )
}

function MetaItem({ label, value, highlight, warn }: {
  label: string; value: string; highlight?: boolean; warn?: boolean
}) {
  return (
    <div style={s.metaItem}>
      <span style={s.metaLabel}>{label}</span>
      <span style={{
        ...s.metaVal,
        color: highlight ? '#B91C1C' : warn ? '#B45309' : '#374151',
        fontWeight: (highlight || warn) ? 600 : 400,
      }}>
        {value}
      </span>
    </div>
  )
}

const bs: Record<string, React.CSSProperties> = {
  collectRed: { padding: '6px 12px', background: '#B91C1C', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600 },
  payHot:     { padding: '7px 13px', background: '#B91C1C', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 700 },
  payNormal:  { padding: '7px 13px', background: '#111827', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 500 },
  order:      { padding: '7px 13px', background: '#f3f4f6', color: '#374151', borderRadius: 6, fontSize: 12, border: '1px solid #e5e7eb' },
}

const s: Record<string, React.CSSProperties> = {
  page:            { maxWidth: 960, margin: '0 auto', padding: '32px 24px 60px' },
  header:          { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  title:           { fontSize: 22, fontWeight: 700, margin: '0 0 6px 0' },
  subtitleRow:     { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  mustBadge:       { display: 'inline-block', padding: '4px 12px', background: '#B91C1C', color: '#fff', borderRadius: 20, fontSize: 12, fontWeight: 700 },
  subtitle:        { fontSize: 13, color: '#6b7280' },
  headerBtns:      { display: 'flex', gap: 8, flexShrink: 0 },
  subBtn:          { padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, color: '#374151', textDecoration: 'none' },
  newBtn:          { padding: '8px 16px', background: '#111827', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' },
  alertBox:        { background: '#FFF1F2', border: '2px solid #FCA5A5', borderRadius: 10, padding: '16px 20px', marginBottom: 20 },
  alertTitle:      { fontSize: 13, fontWeight: 700, color: '#B91C1C', margin: '0 0 12px 0' },
  alertList:       { display: 'flex', flexDirection: 'column', gap: 10 },
  alertRow:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  alertLeft:       { display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },
  alertName:       { fontSize: 14, fontWeight: 700, color: '#111827' },
  alertMsg:        { fontSize: 12, color: '#B91C1C', fontWeight: 500 },
  alertBtns:       { display: 'flex', gap: 6 },
  ledgerBtnSm:     { padding: '6px 10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, color: '#6b7280', textDecoration: 'none' },
  filterRow:       { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  filterBtn:       { padding: '6px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, fontSize: 12, color: '#6b7280', textDecoration: 'none' },
  filterActive:    { padding: '6px 14px', background: '#111827', border: '1px solid #111827', borderRadius: 20, fontSize: 12, color: '#fff', textDecoration: 'none', fontWeight: 500 },
  empty:           { textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 14 },
  list:            { display: 'flex', flexDirection: 'column', gap: 8 },
  card:            { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' },
  recontactBanner: { padding: '7px 16px', background: '#FFF7ED', borderBottom: '1px solid #FED7AA', fontSize: 12, fontWeight: 600, color: '#C2410C' },
  actionBanner:    { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px' },
  actionIcon:      { fontSize: 13, flexShrink: 0 },
  actionText:      { flex: 1, lineHeight: 1.4 },
  scorePill:       { fontSize: 10, padding: '2px 8px', background: '#FEF3C7', color: '#92400E', borderRadius: 10, fontWeight: 600, flexShrink: 0 },
  cardBody:        { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 16px', gap: 12, flexWrap: 'wrap' },
  cardInfo:        { display: 'flex', flexDirection: 'column', gap: 8, flex: 1 },
  nameRow:         { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  custName:        { fontSize: 15, fontWeight: 600, color: '#111827' },
  badge:           { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 },
  metaRow:         { display: 'flex', gap: 20, flexWrap: 'wrap' },
  metaItem:        { display: 'flex', flexDirection: 'column', gap: 2 },
  metaLabel:       { fontSize: 10, color: '#9ca3af', fontWeight: 500 },
  metaVal:         { fontSize: 12, fontVariantNumeric: 'tabular-nums' },
  cardBtns:        { display: 'flex', gap: 6, flexShrink: 0, alignSelf: 'center' },
  ledgerBtn:       { padding: '7px 13px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 12, color: '#1D4ED8', textDecoration: 'none', fontWeight: 500 },
}