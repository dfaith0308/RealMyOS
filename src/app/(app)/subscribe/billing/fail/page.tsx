export default async function BillingFailPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const { message } = await searchParams
  const displayMessage = message ?? '구독 결제에 실패했습니다'

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 24px' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>❌</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>결제 실패</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px' }}>{displayMessage}</p>
        <a
          href="/subscribe"
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
          다시 시도
        </a>
      </div>
    </main>
  )
}

