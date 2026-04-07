'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCustomer } from '@/actions/customer'
import { addAcquisitionChannel } from '@/actions/acquisition-channel'
import type { AcquisitionChannel } from '@/actions/acquisition-channel'

interface Props {
  channels: AcquisitionChannel[]
}

type CustomerType = 'business' | 'individual' | 'prospect'
type PaymentTerms = 0 | 30 | 45 | 60

export default function CustomerCreateForm({ channels: initialChannels }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // 기본 정보
  const [customerType, setCustomerType] = useState<CustomerType>('business')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  // 사업자 전용
  const [bizNumber, setBizNumber] = useState('')
  const [repName, setRepName] = useState('')
  const [bizType, setBizType] = useState('')

  // 거래 설정
  const [openingBalance, setOpeningBalance] = useState('')
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(0)
  const [targetRevenue, setTargetRevenue] = useState('')
  const [isBuyer, setIsBuyer] = useState(true)
  const [isSupplier, setIsSupplier] = useState(false)

  // 유입경로
  const [channels, setChannels] = useState<AcquisitionChannel[]>(initialChannels)
  const [channelId, setChannelId] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [showAddChannel, setShowAddChannel] = useState(false)
  const [channelPending, startChannelTransition] = useTransition()

  function handleAddChannel() {
    if (!newChannelName.trim()) return
    startChannelTransition(async () => {
      const result = await addAcquisitionChannel(newChannelName)
      if (result.success && result.data) {
        setChannels((prev) => [...prev, result.data!])
        setChannelId(result.data.id)
        setNewChannelName('')
        setShowAddChannel(false)
      }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('거래처명을 입력해주세요.'); return }

    startTransition(async () => {
      const result = await createCustomer({
        customer_type:          customerType,
        name:                   name.trim(),
        phone:                  phone || undefined,
        address:                address || undefined,
        business_number:        bizNumber || undefined,
        representative_name:    repName || undefined,
        business_type:          bizType || undefined,
        opening_balance:        openingBalance ? Number(openingBalance) : 0,
        opening_balance_date:   openingDate,
        payment_terms_days:     paymentTerms,
        target_monthly_revenue: targetRevenue ? Number(targetRevenue) : undefined,
        acquisition_channel_id: channelId || undefined,
        is_buyer:               isBuyer,
        is_supplier:            isSupplier,
        trade_status:           'active',
      })

      if (result.success) {
        router.push('/customers')
      } else {
        setError(result.error ?? '저장 실패')
      }
    })
  }

  return (
    <div style={s.wrap}>
      <h1 style={s.title}>거래처 등록</h1>

      {error && <div style={s.err}>{error}</div>}

      <form onSubmit={handleSubmit} style={s.form}>

        {/* 고객 유형 */}
        <Field label="고객 유형 *">
          <div style={s.seg}>
            {(['business', 'individual', 'prospect'] as CustomerType[]).map((t) => (
              <button key={t} type="button"
                style={customerType === t ? s.segActive : s.segBtn}
                onClick={() => setCustomerType(t)}>
                {{ business: '사업자', individual: '개인', prospect: '예비' }[t]}
              </button>
            ))}
          </div>
        </Field>

        {/* 기본 정보 */}
        <Field label="상호명 / 이름 *">
          <input style={s.input} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="예: 정무식당" required />
        </Field>

        <Field label="연락처">
          <input style={s.input} value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="010-0000-0000" />
        </Field>

        <Field label="주소">
          <input style={s.input} value={address} onChange={(e) => setAddress(e.target.value)}
            placeholder="주소 입력" />
        </Field>

        {/* 사업자 전용 */}
        {customerType === 'business' && (
          <>
            <Field label="사업자등록번호">
              <input style={s.input} value={bizNumber}
                onChange={(e) => setBizNumber(e.target.value.replace(/-/g, ''))}
                placeholder="하이픈 없이 입력" maxLength={10} />
            </Field>
            <Field label="대표자명">
              <input style={s.input} value={repName}
                onChange={(e) => setRepName(e.target.value)} placeholder="홍길동" />
            </Field>
            <Field label="업태">
              <input style={s.input} value={bizType}
                onChange={(e) => setBizType(e.target.value)} placeholder="음식점업" />
            </Field>
          </>
        )}

        {/* 거래 설정 */}
        <div style={s.divider} />

        <Field label="최초 미수금">
          <input style={s.input} type="number" value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0" />
        </Field>

        <Field label="최초 미수금 기준일">
          <input style={s.input} type="date" value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)} />
        </Field>

        <Field label="결제조건">
          <div style={s.seg}>
            {([0, 30, 45, 60] as PaymentTerms[]).map((d) => (
              <button key={d} type="button"
                style={paymentTerms === d ? s.segActive : s.segBtn}
                onClick={() => setPaymentTerms(d)}>
                {d === 0 ? '즉시' : `${d}일`}
              </button>
            ))}
          </div>
        </Field>

        <Field label="목표 월매출">
          <input style={s.input} type="number" value={targetRevenue}
            onChange={(e) => setTargetRevenue(e.target.value)} placeholder="미입력 시 기본값 적용" />
        </Field>

        {/* 역할 */}
        <Field label="역할">
          <div style={{ display: 'flex', gap: 16 }}>
            <label style={s.check}>
              <input type="checkbox" checked={isBuyer}
                onChange={(e) => setIsBuyer(e.target.checked)} />
              매출처
            </label>
            <label style={s.check}>
              <input type="checkbox" checked={isSupplier}
                onChange={(e) => setIsSupplier(e.target.checked)} />
              매입처
            </label>
          </div>
        </Field>

        {/* 유입경로 */}
        <Field label="유입경로">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select style={{ ...s.input, flex: 1 }} value={channelId}
              onChange={(e) => setChannelId(e.target.value)}>
              <option value="">선택 안 함</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button type="button" style={s.addBtn}
              onClick={() => setShowAddChannel((v) => !v)}>
              +
            </button>
          </div>
          {showAddChannel && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input style={{ ...s.input, flex: 1 }}
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="새 채널명 입력" />
              <button type="button" style={s.saveBtn}
                onClick={handleAddChannel} disabled={channelPending}>
                추가
              </button>
            </div>
          )}
        </Field>

        <div style={s.divider} />

        <button type="submit" style={isPending ? s.submitOff : s.submit}
          disabled={isPending}>
          {isPending ? '저장 중...' : '거래처 등록'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{label}</label>
      {children}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap:      { maxWidth: 540, margin: '0 auto', padding: '32px 24px 60px' },
  title:     { fontSize: 18, fontWeight: 600, marginBottom: 24 },
  err:       { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  form:      { display: 'flex', flexDirection: 'column', gap: 16 },
  input:     { padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' },
  seg:       { display: 'flex', border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden' },
  segBtn:    { flex: 1, padding: '8px', border: 'none', borderRight: '1px solid #d1d5db', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' },
  segActive: { flex: 1, padding: '8px', border: 'none', borderRight: '1px solid #d1d5db', background: '#111827', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 500 },
  check:     { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' },
  addBtn:    { padding: '8px 14px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 16, cursor: 'pointer', fontWeight: 700 },
  saveBtn:   { padding: '8px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  divider:   { height: 1, background: '#f3f4f6', margin: '4px 0' },
  submit:    { padding: '12px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  submitOff: { padding: '12px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'not-allowed' },
}
