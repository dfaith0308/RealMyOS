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
  const [selectedPlan, setSelectedPlan] = useState<SelectablePlan>('annual')
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
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '8px 0 72px' }}>
      {/* 상단 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '6px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 800,
                background: status.plan === 'free' ? '#E8701C' : '#1f5d3a',
                color: '#fff',
              }}
            >
              {status.is_active ? `현재 플랜: ${planLabel(status.plan)}` : '현재 플랜: 무료'}
            </span>
            {status.plan_expires_at && (
              <span style={{ fontSize: 12, color: '#2b2b2b', fontWeight: 700 }}>
                만료일 {new Date(status.plan_expires_at).toLocaleDateString('ko-KR')}
              </span>
            )}
          </div>
        </div>
        <h1 style={{ margin: '12px 0 0', fontSize: 22, fontWeight: 900, color: '#2b2b2b' }}>구독 결제</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#2b2b2b' }}>
          플랜을 선택하고 토스페이먼츠로 결제하세요
        </p>
      </div>

      {/* 플랜 카드 2개 (그리드) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* 월간 */}
        <button
          type="button"
          onClick={() => setSelectedPlan('monthly')}
          style={{
            textAlign: 'left',
            padding: 18,
            borderRadius: 14,
            border: selectedPlan === 'monthly' ? '2px solid #52B788' : '1px solid #2b2b2b',
            background: '#fff',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#2b2b2b' }}>월간</div>
            {selectedPlan === 'monthly' && (
              <div style={{ fontSize: 12, fontWeight: 900, color: '#52B788' }}>선택됨</div>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 26, fontWeight: 900, color: '#2b2b2b' }}>
            99,000원<span style={{ fontSize: 14, fontWeight: 800 }}> /월</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 13, fontWeight: 800, color: '#2b2b2b' }}>매월 자동 결제</div>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['전체 기능 이용', '언제든 해지 가능'].map((t) => (
              <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ width: 18, height: 18, borderRadius: 5, background: '#52B788', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 12 }}>
                  ✓
                </span>
                <span style={{ fontSize: 13, color: '#2b2b2b', fontWeight: 800 }}>{t}</span>
              </div>
            ))}
          </div>
        </button>

        {/* 연간 (기본 선택) */}
        <button
          type="button"
          onClick={() => setSelectedPlan('annual')}
          style={{
            textAlign: 'left',
            padding: 18,
            borderRadius: 14,
            border: selectedPlan === 'annual' ? '2px solid #52B788' : '1px solid #1f5d3a',
            background: '#1f5d3a',
            cursor: 'pointer',
            fontFamily: 'inherit',
            color: '#fff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 999, background: '#E8701C', color: '#fff', fontSize: 12, fontWeight: 900 }}>
                월 20,000원 절감
              </div>
              <div style={{ marginTop: 10, fontSize: 16, fontWeight: 900 }}>연간</div>
            </div>
            {selectedPlan === 'annual' && (
              <div style={{ fontSize: 12, fontWeight: 900, color: '#52B788' }}>선택됨</div>
            )}
          </div>

          <div style={{ marginTop: 10, fontSize: 26, fontWeight: 900 }}>
            948,000원<span style={{ fontSize: 14, fontWeight: 800 }}> /년</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 13, fontWeight: 800, color: '#f7f6f2' }}>
            월 79,000원 · 연 1회 결제
          </div>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['전체 기능 이용', '연간 240,000원 절감'].map((t) => (
              <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ width: 18, height: 18, borderRadius: 5, background: '#52B788', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 12 }}>
                  ✓
                </span>
                <span style={{ fontSize: 13, color: '#f7f6f2', fontWeight: 800 }}>{t}</span>
              </div>
            ))}
          </div>
        </button>
      </div>

      {/* 하단 버튼 */}
      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={pending || !tossEnabled}
          style={{
            width: '100%',
            padding: 16,
            borderRadius: 12,
            border: 'none',
            background: !tossEnabled ? '#9ca3af' : '#1f5d3a',
            color: '#fff',
            fontSize: 15,
            fontWeight: 900,
            cursor: pending || !tossEnabled ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {pending
            ? '결제창 여는 중...'
            : !tossEnabled
              ? '결제 준비 중 (키 미설정)'
              : selectedPlan === 'monthly'
                ? '월간 구독 시작하기 · 99,000원/월'
                : '연간 구독 시작하기 · 948,000원/년'}
        </button>

        <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: '#2b2b2b', fontWeight: 700 }}>
          토스페이먼츠로 안전하게 결제됩니다 · 언제든 해지 가능
        </div>
      </div>
    </main>
  )
}

