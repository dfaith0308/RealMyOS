import CustomerCreateForm from '@/components/customer/CustomerCreateForm'

export const metadata = { title: '거래처 등록 — RealMyOS' }

export default function CustomerNewPage() {
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
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>거래처 등록</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
            필수 정보만 입력하세요. 나머지는 나중에 추가 가능합니다.
          </p>
        </div>
        <CustomerCreateForm />
      </div>
    </main>
  )
}
