import Link from 'next/link'
import { getProducts } from '@/actions/product'
import { getCategories } from '@/actions/category'
import { getSettings } from '@/actions/settings'
import { DEFAULT_SETTINGS } from '@/constants/settings'
import { formatKRW, calcMarginRate } from '@/lib/calc'
import ProductListClient from '@/components/product/ProductListClient'

export const metadata = { title: '상품 목록 — RealMyOS' }

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: { q?: string; category_id?: string; tax_type?: string }
}) {
  const { q, category_id, tax_type } = searchParams

  const [productsResult, categoriesResult, settingsResult] = await Promise.all([
    getProducts({ q, category_id, tax_type }),
    getCategories(),
    getSettings(),
  ])

  const products = productsResult.data ?? []
  const categories = categoriesResult.data ?? []
  const threshold = settingsResult.success && settingsResult.data
    ? settingsResult.data.margin_warning_threshold
    : DEFAULT_SETTINGS.margin_warning_threshold

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>상품 목록</h1>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0' }}>{products.length}개</p>
        </div>
        <Link href="/products/bulk" style={{ padding: "8px 14px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, color: "#374151", textDecoration: "none" }}>대량등록</Link>
        <Link href="/products/new" style={s.newBtn}>+ 상품 등록</Link>
      </div>

      {/* 필터 */}
      <form method="get" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input name="q" defaultValue={q} placeholder="상품명 검색"
          style={s.input} />
        <select name="category_id" defaultValue={category_id ?? ''} style={s.select}>
          <option value="">전체 카테고리</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="tax_type" defaultValue={tax_type ?? ''} style={s.select}>
          <option value="">과세/면세 전체</option>
          <option value="taxable">과세</option>
          <option value="exempt">면세</option>
        </select>
        <button type="submit" style={s.searchBtn}>검색</button>
        <Link href="/products" style={s.resetBtn}>초기화</Link>
      </form>

      <ProductListClient products={products} marginThreshold={threshold} />
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  newBtn:    { padding: '8px 16px', background: '#111827', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' },
  input:     { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none' },
  select:    { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' },
  searchBtn: { padding: '8px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  resetBtn:  { padding: '8px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#6b7280', textDecoration: 'none' },
}
