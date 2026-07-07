import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

function orderNameForPlan(plan: string): string {
  if (plan === 'annual') return '공급자OS 연간 구독'
  return '공급자OS 월간 구독'
}

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    authKey?: string
    customerKey?: string
    plan?: string
    amount?: string
  }>
}) {
  const { authKey, customerKey, plan, amount } = await searchParams

  if (!authKey || !customerKey || !plan || !amount) {
    redirect('/subscribe/billing/fail?message=' + encodeURIComponent('결제 정보가 올바르지 않습니다'))
  }

  const cookie = (await headers()).get('cookie') ?? ''

  const res = await fetch(`${appBaseUrl()}/api/toss/billing`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie,
    },
    body: JSON.stringify({
      authKey,
      customerKey,
      plan,
      amount: Number(amount),
      orderName: orderNameForPlan(plan),
    }),
    cache: 'no-store',
  })

  const data = await res.json()

  if (!res.ok) {
    redirect(`/subscribe/billing/fail?message=${encodeURIComponent(data.error ?? '구독 결제 실패')}`)
  }

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 24px' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>구독 완료!</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px' }}>구독이 시작됐습니다</p>
        <a
          href="/dashboard"
          style={{
            display: 'block',
            padding: 14,
            background: 'var(--color-primary)',
            borderRadius: 12,
            color: '#fff',
            textDecoration: 'none',
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          대시보드로
        </a>
      </div>
    </main>
  )
}

