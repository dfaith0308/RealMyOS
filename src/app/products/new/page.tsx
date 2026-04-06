import ProductCreateForm from '@/components/product/ProductCreateForm'

export const metadata = { title: '상품 등록 — RealMyOS' }

export default function ProductNewPage() {
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
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>상품 등록</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
            매입가는 반드시 입력하세요. 마진 계산의 기준이 됩니다.
          </p>
        </div>
        <ProductCreateForm />
      </div>
    </main>
  )
}
