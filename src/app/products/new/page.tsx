import { createSupabaseServer } from '@/lib/supabase-server'
import { getCategories } from '@/actions/category'
import ProductCreateForm from '@/components/product/ProductCreateForm'

export const metadata = { title: '상품 등록 — RealMyOS' }

export default async function ProductNewPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  const [catResult, { data: suppliers }] = await Promise.all([
    getCategories(),
    user ? supabase.from('customers').select('id, name')
      .eq('is_supplier', true).is('deleted_at', null).order('name') : Promise.resolve({ data: [] }),
  ])

  return (
    <main style={{ minHeight: '100vh', background: '#f8f9fa', paddingTop: 32 }}>
      <ProductCreateForm
        categories={catResult.data ?? []}
        suppliers={(suppliers ?? []).map((s: any) => ({ id: s.id, name: s.name }))}
      />
    </main>
  )
}
