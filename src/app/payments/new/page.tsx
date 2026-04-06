import PaymentCreateForm from '@/components/payment/PaymentCreateForm'

export const metadata = { title: '수금 등록 — RealMyOS' }

export default function PaymentNewPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#f8f9fa', paddingTop: 40 }}>
      <div
        style={{
          maxWidth: 480,
          margin: '0 auto',
          background: '#fff',
          borderRadius: 12,
          padding: '32px 28px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>수금 등록</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
            거래처 선택 시 현재 미수금이 표시됩니다.
          </p>
        </div>
        <PaymentCreateForm />
      </div>
    </main>
  )
}
