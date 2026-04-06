'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

// ============================================================
// 상품 등록
// ============================================================

export interface CreateProductInput {
  name: string
  cost_price: number       // 필수 — 없으면 마진 계산 불가
  selling_price?: number   // 선택 — normal 가격으로 저장
  tax_type: 'taxable' | 'exempt'
}

export async function createProduct(
  input: CreateProductInput,
): Promise<ActionResult<{ id: string; product_code: string }>> {
  const supabase = await createSupabaseServer()

  // 1. 인증
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: '로그인이 필요합니다.' }

  // 2. tenant_id 조회
  const { data: me } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()
  if (!me?.tenant_id) return { success: false, error: '테넌트 정보를 불러올 수 없습니다.' }
  const tenant_id = me.tenant_id

  // 3. 검증
  const name = input.name.trim()
  if (!name) return { success: false, error: '상품명을 입력해주세요.' }
  if (!input.cost_price || input.cost_price <= 0)
    return { success: false, error: '매입가를 입력해주세요.' }

  // 4. product_code 채번
  // product_code_sequences에서 tenant별 시퀀스 관리
  const product_code = await issueProductCode(supabase, tenant_id)
  if (!product_code) return { success: false, error: '상품코드 생성 실패' }

  // 5. products INSERT
  const { data: product, error: productErr } = await supabase
    .from('products')
    .insert({
      tenant_id,
      product_code,
      name,
      tax_type: input.tax_type,
      procurement_type: 'consignment', // 기본값
    })
    .select('id, product_code')
    .single()

  if (productErr || !product)
    return { success: false, error: `상품 저장 실패: ${productErr?.message}` }

  // 6. product_costs INSERT (핵심 — 반드시 저장)
  const today = new Date().toISOString().slice(0, 10)
  const { error: costErr } = await supabase.from('product_costs').insert({
    product_id: product.id,
    cost_price: input.cost_price,
    start_date: today,
    end_date: null,   // 현재 적용 중
  })

  if (costErr) {
    // 상품은 들어갔는데 원가가 실패 → 상품 soft delete 후 에러 반환
    await supabase
      .from('products')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', product.id)
    return { success: false, error: `매입가 저장 실패: ${costErr.message}` }
  }

  // 7. selling_price가 있으면 product_prices INSERT
  if (input.selling_price && input.selling_price > 0) {
    await supabase.from('product_prices').insert({
      product_id: product.id,
      price_type: 'normal',
      price: input.selling_price,
    })
    // 실패해도 상품 등록은 완료 처리 (판매가는 나중에 수정 가능)
  }

  revalidatePath('/products')

  return {
    success: true,
    data: { id: product.id, product_code: product.product_code },
  }
}

// ============================================================
// product_code 채번
// 형식: P-001, P-002 ... (tenant별 독립 시퀀스)
// 한 번 쓴 코드는 삭제해도 재사용하지 않음
// ============================================================

async function issueProductCode(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  tenant_id: string,
): Promise<string | null> {
  // upsert로 시퀀스 +1
  const { data, error } = await supabase.rpc('increment_product_code_seq', {
    p_tenant_id: tenant_id,
  })

  if (error || data === null) {
    // RPC 없는 경우 fallback: 현재 상품 수 기반으로 채번
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
    const seq = (count ?? 0) + 1
    return `P-${String(seq).padStart(3, '0')}`
  }

  return `P-${String(data).padStart(3, '0')}`
}
