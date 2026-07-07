'use client'

import { useMemo, useState } from 'react'
import { loadTossPayments } from '@tosspayments/tosspayments-sdk'
import type { SubscriptionPlan } from '@/actions/subscribe'

type SelectablePlan = 'monthly' | 'annual'

export type SubscriptionStatusProps = {
  plan: SubscriptionPlan
  subscribed_at: string | null
  plan_expires_at: string | null
  is_active: boolean
}

const tossEnabled = Boolean(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY)

const PLANS: Array<{
  id: SelectablePlan
  label: string
  amount: number
  displayPrice: string
  note: string
}> = [
  { id: 'monthly', label: '월간', amount: 99000, displayPrice: '99,000원/월', note: '' },
  { id: 'annual', label: '연간', amount: 948000, displayPrice: '948,000원/년', note: '월 79,000원' },
]

function planLabel(plan: SubscriptionPlan): string {
  if (plan === 'annual') return '연간'
  if (plan === 'monthly') return '월간'
  if (plan === 'earlybird') return '얼리버드'
  if (plan === 'pro') return '월간(legacy)'
  return '무료'
}

export default function SubscribeClient({ status }: { status: SubscriptionStatusProps }) {
  const [selectedPlan, setSelectedPlan] = useState<SelectablePlan>('monthly')
  const selected = useMemo(() => PLANS.find((p) => p.id === selectedPlan) ?? PLANS[0], [selectedPlan])
  const [pending, setPending] = useState(false)

  async function handleSubscribe() {
    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
    if (!clientKey) {
      alert('결제 준비 중입니다. (NEXT_PUBLIC_TOSS_CLIENT_KEY 미설정)')
      return
    }

    const customerKey = crypto.randomUUID()
    setPending(true)
    try {
      const tossPayments = await loadTossPayments(clientKey)
      const payment = tossPayments.payment({ customerKey })
      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl: `${window.location.origin}/subscribe/billing/success?plan=${selected.id}&amount=${selected.amount}&customerKey=${customerKey}`,
        failUrl: `${window.location.origin}/subscribe/billing/fail`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('USER_CANCEL') && !message.includes('취소')) {
        alert(message || '결제 요청에 실패했습니다.')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '20px 0 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827' }}>구독 결제</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
            월간/연간 플랜을 선택하고 토스페이먼츠로 결제합니다.
          </p>
        </div>
      </div>

      {status.is_active && (
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#15803D' }}>
            ✓ 현재 {planLabel(status.plan)} 플랜 이용 중
          </div>
          {status.plan_expires_at && (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              만료일: {new Date(status.plan_expires_at).toLocaleDateString('ko-KR')}
            </div>
          )}
        </div>
      )}

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          {['플랜', '금액', '비고'].map((h) => (
            <div key={h} style={{ padding: '12px 14px', fontSize: 12, fontWeight: 900, color: '#6b7280' }}>{h}</div>
          ))}
        </div>

        {PLANS.map((p) => {
          const active = selected.id === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPlan(p.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                width: '100%',
                textAlign: 'left',
                padding: 0,
                border: 'none',
                background: active ? '#ecfdf5' : '#fff',
                cursor: 'pointer',
                fontFamily: 'inherit',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <div style={{ padding: '12px 14px', fontSize: 14, fontWeight: 800, color: '#111827' }}>
                {p.label} {active ? '✓' : ''}
              </div>
              <div style={{ padding: '12px 14px', fontSize: 13, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                {p.displayPrice}
              </div>
              <div style={{ padding: '12px 14px', fontSize: 13, color: '#6b7280' }}>
                {p.note || '-'}
              </div>
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={pending || !tossEnabled}
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            border: 'none',
            background: pending || !tossEnabled ? '#9ca3af' : '#111827',
            color: '#fff',
            fontSize: 14,
            fontWeight: 800,
            cursor: pending || !tossEnabled ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {pending ? '결제창 여는 중...' : tossEnabled ? `${selected.label} 결제 시작` : '결제 준비 중 (키 미설정)'}
        </button>
      </div>
    </main>
  )
}

