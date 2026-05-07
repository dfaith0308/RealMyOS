'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCustomer, checkCustomerDuplicate } from '@/actions/customer'
import { addAcquisitionChannel } from '@/actions/acquisition-channel'
import { formatPaymentTerms } from '@/lib/payment-terms'
import type { AcquisitionChannel } from '@/actions/acquisition-channel'
import type { PaymentTermsType } from '@/lib/payment-terms'

interface Props {
  channels: AcquisitionChannel[]
}

type CustomerType = 'business' | 'individual' | 'prospect'
type CustomerRole = '' | 'buyer' | 'supplier' | 'both'
type ContactStatus = 'unknown' | 'safe_number' | 'connected' | 'converted'

function buildPaymentTermsString(
  termsType: PaymentTermsType,
  termsDay: string,
  termsDays: string,
) {
  if (termsType === 'monthly_day') {
    const d = Number(termsDay)
    return d ? `monthly_day:${d}` : 'monthly_day'
  }
  if (termsType === 'days_after') {
    const n = Number(termsDays)
    return n ? `days_after:${n}` : 'days_after'
  }
  return termsType
}

export default function CustomerCreateForm({ channels: init }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dupWarning, setDupWarning] = useState<string | null>(null)   // 경고 (계속 가능)
  const [dupBlock, setDupBlock] = useState<{ id: string; name: string } | null>(null) // 차단

  const [customerType, setCustomerType] = useState<CustomerType>('business')
  const [bizNumber, setBizNumber] = useState('')
  const [name, setName] = useState('')
  const [repName, setRepName] = useState('')
  const [bizType, setBizType] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  const [openingBalance, setOpeningBalance] = useState('')
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().slice(0, 10))
  const [termsType, setTermsType] = useState<PaymentTermsType>('immediate')
  const [termsDays, setTermsDays] = useState('')
  const [termsDay, setTermsDay] = useState('')
  const [targetRevenue, setTargetRevenue] = useState('')
  const [isBuyer, setIsBuyer] = useState(true)
  const [isSupplier, setIsSupplier] = useState(false)
  const [role, setRole] = useState<CustomerRole>('')
  const [contactStatus, setContactStatus] = useState<ContactStatus>('unknown')

  const [channels, setChannels] = useState(init)
  const [channelId, setChannelId] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [showAddChannel, setShowAddChannel] = useState(false)
  const [, startCh] = useTransition()

  function handleAddChannel() {
    if (!newChannelName.trim()) return
    startCh(async () => {
      const r = await addAcquisitionChannel(newChannelName)
      if (r.success && r.data) {
        setChannels((p) => [...p, r.data!])
        setChannelId(r.data.id)
        setNewChannelName('')
        setShowAddChannel(false)
      }
    })
  }

  // payment_terms_days 역산
  function getTermsDays(): number {
    if (termsType === 'immediate') return 0
    if (termsType === 'days_after') return Number(termsDays) || 0
    return 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('거래처명을 입력해주세요.'); return }
    if (dupBlock) { setError('이미 등록된 사업자번호입니다. 기존 거래처를 수정해주세요.'); return }

    startTransition(async () => {
      const derivedRole =
        role ||
        (isBuyer && isSupplier ? 'both' : isBuyer ? 'buyer' : isSupplier ? 'supplier' : '')
      const nextIsBuyer = derivedRole ? derivedRole === 'buyer' || derivedRole === 'both' : isBuyer
      const nextIsSupplier = derivedRole
        ? derivedRole === 'supplier' || derivedRole === 'both'
        : isSupplier

      const result = await createCustomer({
        customer_type:          customerType,
        name,
        phone:                  phone || undefined,
        address:                address || undefined,
        biz_number:             bizNumber || undefined,
        representative_name:    repName || undefined,
        business_type:          bizType || undefined,
        opening_balance:        openingBalance ? Number(openingBalance) : 0,
        opening_balance_date:   openingDate,
        payment_terms_type:     termsType,
        payment_terms_days:     getTermsDays(),
        payment_day:            termsType === 'monthly_day' ? (termsDay ? Number(termsDay) : undefined)
                              : termsType === 'days_after'  ? (termsDays ? Number(termsDays) : undefined)
                              : undefined,
        payment_terms: buildPaymentTermsString(termsType, termsDay, termsDays),
        role: derivedRole ? (derivedRole as any) : undefined,
        contact_status: contactStatus,
        target_monthly_revenue: targetRevenue ? Number(targetRevenue) : undefined,
        acquisition_channel_id: channelId || undefined,
        is_buyer:  nextIsBuyer,
        is_supplier: nextIsSupplier,
      })
      if (result.success) router.push('/customers')
      else setError(result.error ?? '저장 실패')
    })
  }

  const termsPreview = formatPaymentTerms(termsType, termsDay ? Number(termsDay) : (termsDays ? Number(termsDays) : null))

  return (
    <div style={s.wrap}>
      <h1 style={s.title}>거래처 등록</h1>
      {error && <div style={s.err}>{error}</div>}

      <form onSubmit={handleSubmit} style={s.form}>

        {/* 고객 유형 */}
        <F label="고객 유형 *">
          <Seg options={[
            { value: 'business',   label: '사업자' },
            { value: 'individual', label: '개인' },
            { value: 'prospect',   label: '예비' },
          ]} value={customerType} onChange={(v) => setCustomerType(v as CustomerType)} />
        </F>

        {/* 사업자 전용 */}
        {customerType === 'business' && (
          <F label="사업자등록번호">
            <input style={s.input} value={bizNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/-/g, '')
                setBizNumber(val)
                setDupBlock(null)
                setDupWarning(null)
              }}
              onBlur={async () => {
                if (bizNumber.length < 10) return
                const r = await checkCustomerDuplicate({ business_number: bizNumber })
                if (r.success && r.data?.hasDuplicate) {
                  setDupBlock({ id: r.data.existingId!, name: r.data.existingName! })
                }
              }}
              placeholder="숫자만 입력" maxLength={10} />
            {dupBlock && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#B91C1C', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>이미 등록된 거래처입니다 — {dupBlock.name}</span>
                <Link href={`/customers/${dupBlock.id}/edit`} style={{ color: '#1D4ED8', textDecoration: 'underline', fontSize: 12 }}>
                  거래처 보기
                </Link>
              </div>
            )}
          </F>
        )}

        <F label="상호명 / 이름 *">
          <input style={s.input} value={name}
            onChange={(e) => setName(e.target.value)} placeholder="예: 정무식당" required />
        </F>

        {customerType === 'business' && (
          <>
            <F label="대표자명">
              <input style={s.input} value={repName}
                onChange={(e) => setRepName(e.target.value)} placeholder="홍길동" />
            </F>
            <F label="업태">
              <input style={s.input} value={bizType}
                onChange={(e) => setBizType(e.target.value)} placeholder="음식점업" />
            </F>
          </>
        )}

        <F label="연락처">
          <input style={s.input} value={phone}
            onChange={(e) => { setPhone(e.target.value); setDupWarning(null) }}
            onBlur={async () => {
              if (!name.trim() || !phone.trim()) return
              const r = await checkCustomerDuplicate({ name, phone })
              if (r.success && r.data?.hasSimilar) {
                setDupWarning(`동일한 이름과 연락처의 거래처가 있습니다 (${r.data.existingName}). 계속 등록하시겠습니까?`)
              }
            }}
            placeholder="010-0000-0000" />
          {dupWarning && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#B45309' }}>
              ⚠️ {dupWarning}
            </div>
          )}
        </F>

        <F label="주소">
          <input style={s.input} value={address}
            onChange={(e) => setAddress(e.target.value)} placeholder="주소 입력" />
        </F>

        <div style={s.divider} />

        <F label="최초 미수금">
          <input style={s.input} type="number" value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0" />
        </F>

        <F label="최초 미수금 기준일">
          <input style={s.input} type="date" value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)} />
        </F>

        {/* 거래 설정 */}
        <F label={`결제조건 (선택) — ${termsPreview}`}>
          <select
            style={s.input}
            value={termsType}
            onChange={(e) => setTermsType(e.target.value as PaymentTermsType)}
          >
            <option value="immediate">즉시결제</option>
            <option value="monthly_end">말일</option>
            <option value="monthly_day">매월N일</option>
            <option value="days_after">N일후</option>
          </select>
          {termsType === 'monthly_day' && (
            <input
              style={{ ...s.input, marginTop: 8 }}
              type="number"
              value={termsDay}
              onChange={(e) => setTermsDay(e.target.value)}
              placeholder="몇 일? (예: 15)"
              min={1}
              max={31}
            />
          )}
          {termsType === 'days_after' && (
            <input
              style={{ ...s.input, marginTop: 8 }}
              type="number"
              value={termsDays}
              onChange={(e) => setTermsDays(e.target.value)}
              placeholder="며칠 후? (예: 30)"
              min={1}
            />
          )}
        </F>

        <F label="역할 (선택)">
          <select style={s.input} value={role} onChange={(e) => setRole(e.target.value as CustomerRole)}>
            <option value="">선택 안 함</option>
            <option value="buyer">매출처(buyer)</option>
            <option value="supplier">매입처(supplier)</option>
            <option value="both">둘다(both)</option>
          </select>
        </F>

        <F label="연락 상태 (기본: 미확인)">
          <select
            style={s.input}
            value={contactStatus}
            onChange={(e) => setContactStatus(e.target.value as ContactStatus)}
          >
            <option value="unknown">미확인</option>
            <option value="safe_number">안심번호</option>
            <option value="connected">연락가능</option>
            <option value="converted">전환완료</option>
          </select>
        </F>

        <F label="목표 월매출">
          <input style={s.input} type="number" value={targetRevenue}
            onChange={(e) => setTargetRevenue(e.target.value)}
            placeholder="미입력 시 기본값 적용" />
        </F>

        <F label="유입경로">
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={{ ...s.input, flex: 1 }} value={channelId}
              onChange={(e) => setChannelId(e.target.value)}>
              <option value="">선택 안 함</option>
              {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" style={s.iconBtn}
              onClick={() => setShowAddChannel((v) => !v)}>+</button>
          </div>
          {showAddChannel && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input style={{ ...s.input, flex: 1 }} value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="새 채널명" />
              <button type="button" style={s.saveBtn} onClick={handleAddChannel}>추가</button>
            </div>
          )}
        </F>

        <div style={s.divider} />

        <button type="submit" style={isPending ? s.submitOff : s.submit} disabled={isPending}>
          {isPending ? '저장 중...' : '거래처 등록'}
        </button>
      </form>
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{label}</label>
      {children}
    </div>
  )
}

function Seg({ options, value, onChange }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden' }}>
      {options.map((o, i) => (
        <button key={o.value} type="button"
          onClick={() => onChange(o.value)}
          style={{
            flex: 1, padding: '8px 4px', border: 'none',
            borderRight: i < options.length - 1 ? '1px solid #d1d5db' : 'none',
            background: value === o.value ? '#111827' : '#fff',
            color: value === o.value ? '#fff' : '#374151',
            fontSize: 12, cursor: 'pointer',
            fontWeight: value === o.value ? 500 : 400,
          }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap:      { maxWidth: 540, margin: '0 auto', padding: '32px 24px 60px' },
  title:     { fontSize: 18, fontWeight: 600, marginBottom: 24 },
  err:       { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  form:      { display: 'flex', flexDirection: 'column', gap: 16 },
  input:     { padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' },
  check:     { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' },
  iconBtn:   { padding: '8px 14px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 16, cursor: 'pointer', fontWeight: 700 },
  saveBtn:   { padding: '8px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  divider:   { height: 1, background: '#f3f4f6', margin: '4px 0' },
  submit:    { padding: '12px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  submitOff: { padding: '12px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'not-allowed' },
}
