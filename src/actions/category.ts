'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

export interface Category { id: string; name: string }

export async function getCategories(): Promise<ActionResult<Category[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('product_categories')
    .select('id, name')
    .eq('tenant_id', ctx.tenant_id)
    .order('name')

  if (error) return { success: false, error: error.message }
  return { success: true, data: data ?? [] }
}

export async function addCategory(name: string): Promise<ActionResult<Category>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: '카테고리명을 입력해주세요.' }

  const { data, error } = await supabase
    .from('product_categories')
    .insert({ tenant_id: ctx.tenant_id, name: trimmed })
    .select('id, name')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? '저장 실패' }
  revalidatePath('/products')
  return { success: true, data }
}