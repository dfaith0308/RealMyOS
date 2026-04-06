import { createSupabaseServer } from '@/lib/supabase-server'

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
  const products = await getProducts()

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
        상품 목록 ({products.length}개)
      </h1>

      {products.length === 0 && (
        <p style={{ color: '#9ca3af', fontSize: 14 }}>등록된 상품이 없습니다.</p>
      )}

      {products.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <th style={th}>코드</th>
              <th style={th}>상품명</th>
              <th style={{ ...th, textAlign: 'right' }}>매입가</th>
              <th style={{ ...th, textAlign: 'right' }}>판매가</th>
              <th style={th}>과세</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const currentCost = (p.product_costs ?? [])
                .find((c: any) => c.end_date === null)?.cost_price ?? '-'
              const normalPrice = (p.product_prices ?? [])
                .find((pp: any) => pp.price_type === 'normal')?.price ?? '-'
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...td, color: '#9ca3af', fontFamily: 'monospace', fontSize: 12 }}>
                    {p.product_code}
                  </td>
                  <td style={td}>{p.name}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {typeof currentCost === 'number' ? currentCost.toLocaleString() + '원' : '-'}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {typeof normalPrice === 'number' ? normalPrice.toLocaleString() + '원' : '-'}
                  </td>
                  <td style={{ ...td, color: '#6b7280' }}>
                    {p.tax_type === 'taxable' ? '과세' : '면세'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </main>
  )
}

const th: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left',
  fontSize: 11, fontWeight: 500, color: '#6b7280',
  background: '#f9fafb',
}
const td: React.CSSProperties = {
  padding: '10px 12px', verticalAlign: 'middle',
}