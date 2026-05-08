import { createSupabaseServer } from '@/lib/supabase-server'
import { getCategories } from '@/actions/category'
import { getProductById } from '@/actions/product'
import ProductCreateForm from '@/components/product/ProductCreateForm'
import { getAuthCtx } from '@/lib/supabase-server'

export const metadata = { title: '상품 등록 — RealMyOS' }

export default async function ProductNewPage({
  searchParams,
}: {
  searchParams: { copyId?: string }
}) {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)

  const [catResult, { data: suppliers }, copyResult] = await Promise.all([
    getCategories(),
    ctx
      ? supabase.from('customers').select('id, name')
          .eq('tenant_id', ctx.tenant_id)
          .eq('is_supplier', true).is('deleted_at', null).order('name')
      : Promise.resolve({ data: [] }),
    searchParams.copyId
      ? getProductById(searchParams.copyId)
      : Promise.resolve(null),
  ])

  return (
    <main style={{ minHeight: '100vh', background: '#f8f9fa', paddingTop: 32 }}>
      <ProductCreateForm
        categories={catResult.data ?? []}
        suppliers={(suppliers ?? []).map((s: any) => ({ id: s.id, name: s.name }))}
        copyData={copyResult?.success ? copyResult.data : undefined}
      />
    </main>
  )
}