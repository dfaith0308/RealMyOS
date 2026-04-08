'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateCustomer } from '@/actions/customer'
import { addAcquisitionChannel } from '@/actions/acquisition-channel'
import { formatPaymentTerms } from '@/lib/payment-terms'
import type { AcquisitionChannel } from '@/actions/acquisition-channel'
import type { CustomerListItem } from '@/actions/customer-query'
import type { PaymentTermsType } from '@/lib/payment-terms'

interface Props {
  customer: CustomerListItem
  channels: AcquisitionChannel[]
}

export default function CustomerEditForm({ customer, channels: init }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [name, setName] = useState(customer.name)
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [address, setAddress] = useState(customer.address ?? '')
  const [bizNumber, setBizNumber] = useState(customer.biz_number ?? '')
  const [repName, setRepName] = useState(customer.representative_name ?? '')
  const [bizType, setBizType] = useState(customer.business_type ?? '')
  const [tradeStatus, setTradeStatus] = useState(customer.trade_status)
  const [termsType, setTermsType] = useState<PaymentTermsType>(
    (customer.payment_terms_type as PaymentTermsType) ?? 'immediate'
  )
  const [termsDays, setTermsDays] = useState(String(customer.payment_terms_days ?? ''))
  const [termsDay, setTermsDay] = useState(String(customer.payment_day ?? ''))
  const [targetRevenue, setTargetRevenue] = useState(String(customer.target_monthly_revenue ?? ''))
  const [isBuyer, setIsBuyer] = useState(customer.is_buyer)
  const [isSupplier, setIsSupplier] = useState(customer.is_supplier)
  const [channelId, setChannelId] = useState(customer.acquisition_channel_id ?? '')

  // opening_balance 수정
  const [openingBalance, setOpeningBalance] = useState(String(customer.opening_balance ?? 0))
  const [openingReason, setOpeningReason] = useState('')
  const [showOpeningEdit, setShowOpeningEdit] = useState(false)

  const [channels, setChannels] = useState(init)
  const [newChannelName, setNewChannelName] = useState('')
  const [showAddCh, setShowAddCh] = useState(false)
  const [, startCh] = useTransition()

  function handleAddChannel() {
    if (!newChannelName.trim()) return
    startCh(async () => {
      const r = await addAcquisitionChannel(newChannelName)
      if (r.success && r.data) {
        setChannels((p) => [...p, r.data!])
        setChannelId(r.data.id)
        setNewChannelName('')
        setShowAddCh(false)
      }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('거래처명을 입력해주세요.'); return }
    if (showOpeningEdit && !openingReason.trim()) {
      setError('최초 미수금 변경 사유를 입력해주세요.'); return
    }

    startTransition(async () => {
      const payload: any = {
        name, phone: phone || undefined, address: address || undefined,
        biz_number: bizNumber || undefined,
        representative_name: repName || undefined,
        business_type: bizType || undefined,
        trade_status: tradeStatus,
        payment_terms_type: termsType,
        payment_terms_days: termsType === 'days_after' ? Number(termsDays) || 0 : 0,
        payment_day: (termsType === 'monthly_day' || termsType === 'days_after')
          ? Number(termsDay || termsDays) || null : null,
        target_monthly_revenue: targetRevenue ? Number(targetRevenue) : null,
        acquisition_channel_id: channelId || undefined,
        is_buyer: isBuyer, is_supplier: isSupplier,
      }
      if (showOpeningEdit) payload.opening_balance = Number(openingBalance) || 0

      const result = await updateCustomer(
        customer.id, payload,
        showOpeningEdit ? openingReason : undefined,
      )

      if (result.success) {
        setSuccess(true)
        setTimeout(() => router.push('/customers/list'), 800)
      } else {
        setError(result.error ?? '저장 실패')
      }
    })
  }

  const termsPreview = formatPaymentTerms(
    termsType,
    termsDay ? Number(termsDay) : (termsDays ? Number(termsDays) : null)
  )

  return (
    <div style={s.wrap}>
      <h1 style={s.title}>거래처 수정</h1>
      <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 20 }}>{customer.name}</p>

      {error && <div style={s.err}>{error}</div>}
      {success && <div style={s.ok}>저장됐습니다.</div>}

      <form onSubmit={handleSubmit} style={s.form}>
        <F label="상호명 / 이름 *">
          <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} required />
        </F>
        <F label="사업자등록번호">
          <input style={s.input} value={bizNumber}
            onChange={(e) => setBizNumber(e.target.value.replace(/-/g, ''))} />
        </F>
        <F label="대표자명">
          <input style={s.input} value={repName} onChange={(e) => setRepName(e.target.value)} />
        </F>
        <F label="업태">
          <input style={s.input} value={bizType} onChange={(e) => setBizType(e.target.value)} />
        </F>
        <F label="연락처">
          <input style={s.input} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </F>
        <F label="주소">
          <input style={s.input} value={address} onChange={(e) => setAddress(e.target.value)} />
        </F>

        <div style={s.divider} />

        {/* 최초 미수금 */}
        <F label="최초 미수금">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>
              {Number(openingBalance).toLocaleString()}원
            </span>
            <button type="button" style={s.smallBtn}
              onClick={() => setShowOpeningEdit((v) => !v)}>
              {showOpeningEdit ? '취소' : '수정'}
            </button>
          </div>
          {showOpeningEdit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <input style={s.input} type="number" value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)} placeholder="새 금액" />
              <input style={s.input} value={openingReason}
                onChange={(e) => setOpeningReason(e.target.value)}
                placeholder="변경 사유 (필수)" />
            </div>
          )}
        </F>

        {/* 결제조건 */}
        <F label={`결제조건 — ${termsPreview}`}>
          <Seg options={[
            { value: 'immediate',   label: '즉시' },
            { value: 'monthly_end', label: '말일' },
            { value: 'monthly_day', label: '매월N일' },
            { value: 'days_after',  label: 'N일후' },
          ]} value={termsType} onChange={(v) => setTermsType(v as PaymentTermsType)} />
          {termsType === 'monthly_day' && (
            <input style={{ ...s.input, marginTop: 8 }} type="number"
              value={termsDay} onChange={(e) => setTermsDay(e.target.value)}
              placeholder="몇 일? (1~31)" min={1} max={31} />
          )}
          {termsType === 'days_after' && (
            <input style={{ ...s.input, marginTop: 8 }} type="number"
              value={termsDays} onChange={(e) => setTermsDays(e.target.value)}
              placeholder="며칠 후?" min={1} />
          )}
        </F>

        <F label="목표 월매출">
          <input style={s.input} type="number" value={targetRevenue}
            onChange={(e) => setTargetRevenue(e.target.value)} />
        </F>

        <F label="거래 상태">
          <Seg options={[
            { value: 'active',   label: '거래중' },
            { value: 'inactive', label: '거래중단' },
            { value: 'lead',     label: '잠재' },
          ]} value={tradeStatus} onChange={setTradeStatus} />
        </F>

        <F label="역할">
          <div style={{ display: 'flex', gap: 16 }}>
            <label style={s.check}>
              <input type="checkbox" checked={isBuyer}
                onChange={(e) => setIsBuyer(e.target.checked)} /> 매출처
            </label>
            <label style={s.check}>
              <input type="checkbox" checked={isSupplier}
                onChange={(e) => setIsSupplier(e.target.checked)} /> 매입처
            </label>
          </div>
        </F>

        <F label="유입경로">
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={{ ...s.input, flex: 1 }} value={channelId}
              onChange={(e) => setChannelId(e.target.value)}>
              <option value="">선택 안 함</option>
              {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" style={s.smallBtn}
              onClick={() => setShowAddCh((v) => !v)}>+</button>
          </div>
          {showAddCh && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input style={{ ...s.input, flex: 1 }} value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)} placeholder="새 채널명" />
              <button type="button" style={s.saveBtn} onClick={handleAddChannel}>추가</button>
            </div>
          )}
        </F>

        <div style={s.divider} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={s.cancelBtn}
            onClick={() => router.push('/customers/list')}>취소</button>
          <button type="submit" style={isPending ? s.submitOff : s.submit}
            disabled={isPending}>
            {isPending ? '저장 중...' : '저장'}
          </button>
        </div>
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
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
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
  title:     { fontSize: 18, fontWeight: 600, marginBottom: 4 },
  err:       { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  ok:        { background: '#F0FDF4', color: '#15803D', border: '1px solid #86EFAC', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  form:      { display: 'flex', flexDirection: 'column', gap: 16 },
  input:     { padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' },
  check:     { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' },
  smallBtn:  { padding: '6px 12px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  saveBtn:   { padding: '8px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  cancelBtn: { flex: 1, padding: '12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
  submit:    { flex: 2, padding: '12px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  submitOff: { flex: 2, padding: '12px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'not-allowed' },
  divider:   { height: 1, background: '#f3f4f6', margin: '4px 0' },
}
