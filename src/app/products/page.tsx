import { createSupabaseServer } from '@/lib/supabase-server'
import ProductList from '@/components/product/ProductList'

export const metadata = { title: '상품 목록 — RealMyOS' }

async function getProducts() {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('products')
    .select(`
      id,
      product_code,
      name,
      tax_type,
      product_prices ( price_type, price ),
      product_costs ( cost_price, end_date )
    `)
    .is('deleted_at', null)
    .order('name')
  return data ?? []
}

export default async function ProductsPage() {
  const raw = await getProducts()

  const products = raw.map((p) => ({
    id: p.id,
    product_code: p.product_code,
    name: p.name,
    tax_type: p.tax_type as 'taxable' | 'exempt',
    cost_price: (p.product_costs ?? []).find((c: any) => c.end_date === null)?.cost_price ?? 0,
    selling_price: (p.product_prices ?? []).find((pp: any) => pp.price_type === 'normal')?.price ?? 0,
  }))

  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
        상품 목록 ({products.length}개)
      </h1>
      <ProductList products={products} />
    </main>
  )
}
