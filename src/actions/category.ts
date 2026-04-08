'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

export interface Category { id: string; name: string; is_active: boolean }

async function getTenantId(supabase: any, userId: string) {
  const { data } = await supabase.from('users').select('tenant_id').eq('id', userId).single()
  return data?.tenant_id ?? null
}

export async function getCategories(): Promise<ActionResult<Category[]>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, is_active')
    .eq('is_active', true)
    .order('name')
  if (error) return { success: false, error: error.message }
  return { success: true, data: data ?? [] }
}

export async function addCategory(name: string): Promise<ActionResult<Category>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }
  const tenant_id = await getTenantId(supabase, user.id)
  if (!tenant_id) return { success: false, error: '테넌트 없음' }
  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: '카테고리명을 입력해주세요.' }
  const { data, error } = await supabase
    .from('categories')
    .insert({ tenant_id, name: trimmed })
    .select('id, name, is_active')
    .single()
  if (error || !data) return { success: false, error: error?.message ?? '저장 실패' }
  revalidatePath('/products')
  return { success: true, data }
}
