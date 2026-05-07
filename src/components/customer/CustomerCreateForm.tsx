'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCustomer, checkCustomerDuplicate } from '@/actions/customer'
import { formatPaymentTerms } from '@/lib/payment-terms'
import type { PaymentTermsType } from '@/lib/payment-terms'

interface Props {}

type CustomerType = 'business' | 'individual' | 'prospect'

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

export default function CustomerCreateForm(_: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dupWarning, setDupWarning] = useState<string | null>(null)   // 경고 (계속 가능)
  const [dupBlock, setDupBlock] = useState<{ id: string; name: string } | null>(null) // 차단

  const [customerType, setCustomerType] = useState<CustomerType>('business')
  const [bizNumber, setBizNumber] = useState('')
  const [name, setName] = useState('')
  const [repName, setRepName] = useState('')
  const [bizType, setBizType] = useState('') // 업태
  const [bizItem, setBizItem] = useState('') // 종목 (schema 없으면 business_type에 합쳐 저장)
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')

  const [openingBalance, setOpeningBalance] = useState('')
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().slice(0, 10))
  const [termsType, setTermsType] = useState<PaymentTermsType>('immediate')
  const [termsDays, setTermsDays] = useState('')
  const [termsDay, setTermsDay] = useState('')

  // payment_terms_days 역산
  function getTermsDays(): number {
    if (termsType === 'immediate') return 0
    if (termsType === 'days_after') return Number(termsDays) || 0
    return 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('상호명/이름을 입력해주세요.'); return }
    if (!phone.trim()) { setError('연락처를 입력해주세요.'); return }
    if (dupBlock) { setError('이미 등록된 사업자번호입니다. 기존 거래처를 수정해주세요.'); return }

    startTransition(async () => {
      const bizCombined =
        customerType === 'business'
          ? [bizType.trim(), bizItem.trim()].filter(Boolean).join(' / ')
          : ''

      const result = await createCustomer({
        customer_type:          customerType,
        name,
        phone:                  phone,
        address:                address || undefined,
        email:                  email || undefined,
        biz_number:             bizNumber || undefined,
        representative_name:    repName || undefined,
        business_type:          bizCombined || undefined,
        opening_balance:        openingBalance ? Number(openingBalance) : 0,
        opening_balance_date:   openingDate,
        payment_terms_type:     termsType,
        payment_terms_days:     getTermsDays(),
        payment_day:            termsType === 'monthly_day' ? (termsDay ? Number(termsDay) : undefined)
                              : termsType === 'days_after'  ? (termsDays ? Number(termsDays) : undefined)
                              : undefined,
        payment_terms: buildPaymentTermsString(termsType, termsDay, termsDays),
        // 분류/유입/연락상태/역할/목표매출은 등록 폼에서 제거 (상세 분류/기본정보에서 관리)
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

        {/* 고객유형 */}
        <F label="고객유형 (선택)">
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

        <F label="상호명 / 이름 (필수)">
          <input style={s.input} value={name}
            onChange={(e) => setName(e.target.value)} placeholder="예: 정무식당" required />
        </F>

        {customerType === 'business' && (
          <>
            <F label="대표자명">
              <input style={s.input} value={repName}
                onChange={(e) => setRepName(e.target.value)} placeholder="홍길동" />
            </F>
            <F label="업태·종목">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input style={s.input} value={bizType}
                  onChange={(e) => setBizType(e.target.value)} placeholder="업태 (예: 음식점업)" />
                <input style={s.input} value={bizItem}
                  onChange={(e) => setBizItem(e.target.value)} placeholder="종목 (예: 한식)" />
              </div>
            </F>
          </>
        )}

        <F label="연락처 (필수)">
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

        <F label="이메일">
          <input style={s.input} value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="선택 입력" />
        </F>

        <div style={s.divider} />

        <F label="최초 미수금">
          <input style={s.input} type="number" value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0" />
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
            기존에 발생한 미수금이 있을 경우 입력하세요. 등록 후 직접 수정은 이력과 함께 진행합니다.
          </div>
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
