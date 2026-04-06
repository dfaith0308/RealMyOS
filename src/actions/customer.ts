'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

// ============================================================
// 거래처 등록
// ============================================================

export interface CreateCustomerInput {
  name: string
  phone?: string
  payment_terms_days: 0 | 30 | 45 | 60
  opening_balance: number
  opening_balance_date?: string   // YYYY-MM-DD, 기본값 오늘
  is_buyer: boolean               // 매출처 여부 (기본 true)
}

export async function createCustomer(
  input: CreateCustomerInput,
): Promise<ActionResult<{ id: string; name: string }>> {
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

  // 3. 검증
  const name = input.name.trim()
  if (!name) return { success: false, error: '거래처명을 입력해주세요.' }

  // 4. INSERT
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('customers')
    .insert({
      tenant_id: me.tenant_id,
      customer_type: 'business',
      name,
      phone: input.phone?.trim() || null,
      payment_terms_days: input.payment_terms_days,
      opening_balance: input.opening_balance,
      opening_balance_date: input.opening_balance_date || today,
      is_buyer: input.is_buyer,
      is_supplier: false,
      status: 'active',
    })
    .select('id, name')
    .single()

  if (error) return { success: false, error: `저장 실패: ${error.message}` }

  // 5. opening_balance가 있으면 이력 기록
  if (input.opening_balance !== 0) {
    await supabase.from('opening_balance_logs').insert({
      customer_id: data.id,
      before_amount: 0,
      after_amount: input.opening_balance,
      changed_by: user.id,
      reason: '최초 등록',
    })
  }

  revalidatePath('/customers')

  return { success: true, data: { id: data.id, name: data.name } }
}
