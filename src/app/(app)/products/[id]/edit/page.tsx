import { notFound } from 'next/navigation'
import { getCategories } from '@/actions/category'
import { getSettings } from '@/actions/settings'
import { DEFAULT_SETTINGS } from '@/constants/settings'
import { createSupabaseServer } from '@/lib/supabase-server'
import ProductEditForm from '@/components/product/ProductEditForm'

export const metadata = { title: '상품 수정 — RealMyOS' }

export default async function ProductEditPage({
  params,
}: {
  params: { id: string }
}) {
  const { id } = params
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: product }, catResult, settingsResult, { data: suppliers }] = await Promise.all([
    supabase.from('products')
      .select('id, product_code, name, tax_type, category_id, supplier_id, barcode, min_margin_rate, product_costs(cost_price,end_date), product_prices(price_type,price), product_logs(action,before_data,after_data,created_at)')
      .eq('id', id).is('deleted_at', null).single(),
    getCategories(),
    getSettings(),
    user ? supabase.from('customers').select('id, name').eq('is_supplier', true).is('deleted_at', null).order('name') : Promise.resolve({ data: [] }),
  ])

  if (!product) notFound()

  const threshold = settingsResult.success && settingsResult.data
    ? settingsResult.data.margin_warning_threshold
    : DEFAULT_SETTINGS.margin_warning_threshold

  return (
    <main style={{ minHeight: '100vh', background: '#f8f9fa', paddingTop: 32 }}>
      <ProductEditForm
        product={product as any}
        categories={catResult.data ?? []}
        suppliers={(suppliers ?? []).map((s: any) => ({ id: s.id, name: s.name }))}
        marginThreshold={threshold}
      />
    </main>
  )
}
