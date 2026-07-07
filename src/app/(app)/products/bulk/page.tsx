import ProductBulkUpload from '@/components/product/ProductBulkUpload'
import Link from 'next/link'

export const metadata = { title: '상품 대량등록 — RealMyOS' }

export default function ProductBulkPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--surface-0)', paddingTop: 32 }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ marginBottom: 16 }}>
          <Link href="/products" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>
            ← 상품 목록
          </Link>
        </div>
      </div>
      <ProductBulkUpload />
    </main>
  )
}
