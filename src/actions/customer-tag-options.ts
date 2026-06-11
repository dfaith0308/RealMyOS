'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

export interface TagOptionRow {
  id: string
  category: string
  value: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

const DEFAULT_SEED: Array<{ category: string; options: string[] }> = [
  { category: '고객유형', options: ['사업자', '개인', '예비'] },
  { category: '식식이회원여부', options: ['비회원', '일반회원', '사업자회원', '식식이구독회원', '협력업체'] },
  { category: '식식이OS', options: ['구독', '미구독'] },
  { category: '관리등급', options: ['방치', '정기관리', '주력관리'] },
  { category: '유입경로', options: ['쿠팡', '스마트스토어', '소개', '오프라인', '기타'] },
  { category: '업종', options: ['카페', '고깃집', '분식', '한식', '중식', '일식', '기타'] },
  { category: '운영관계', options: ['식당/업소', '도매처', '협력업체', '매입처', '개인소비자', '예비업장'] },
  { category: '연락상태', options: ['미확인', '안심번호', '연락가능', '전환완료'] },
]

export async function seedDefaultOptions(): Promise<ActionResult<{ seeded: boolean }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: anyRow, error } = await supabase
    .from('customer_tag_options')
    .select('id')
    .eq('tenant_id', ctx.tenant_id)
    .limit(1)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (anyRow) return { success: true, data: { seeded: false } }

  const rows = DEFAULT_SEED.flatMap((c) =>
    c.options.map((v, idx) => ({
      tenant_id: ctx.tenant_id,
      category: c.category,
      value: v,
      is_active: true,
      sort_order: idx,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
  )

  const { error: insErr } = await supabase.from('customer_tag_options').insert(rows)
  if (insErr) return { success: false, error: insErr.message }

  revalidatePath('/settings/tags')
  revalidatePath('/customers')
  return { success: true, data: { seeded: true } }
}

export async function getTagOptions(category?: string): Promise<ActionResult<TagOptionRow[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  let q = supabase
    .from('customer_tag_options')
    .select('id, category, value, sort_order, is_active, created_at, updated_at')
    .eq('tenant_id', ctx.tenant_id)
    .eq('is_active', true)
    .neq('value', '__category__')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('value', { ascending: true })

  if (category) q = q.eq('category', category)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []) as TagOptionRow[] }
}

export async function getAllCategories(): Promise<ActionResult<string[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('customer_tag_options')
    .select('category')
    .eq('tenant_id', ctx.tenant_id)
    .eq('is_active', true)
    .neq('value', '__category__')

  if (error) return { success: false, error: error.message }
  const set = new Set((data ?? []).map((r: any) => r.category).filter(Boolean))
  return { success: true, data: [...set].sort((a, b) => a.localeCompare(b)) }
}

export async function addTagCategory(category: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const c = category.trim()
  if (!c) return { success: false, error: '카테고리명을 입력해주세요.' }

  // 카테고리만 등록(옵션 없이) 허용: placeholder row (value = '')
  const { data: existing, error: exErr } = await supabase
    .from('customer_tag_options')
    .select('id')
    .eq('tenant_id', ctx.tenant_id)
    .eq('category', c)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (exErr) return { success: false, error: exErr.message }
  if (existing) return { success: false, error: '이미 존재하는 카테고리입니다.' }

  const now = new Date().toISOString()
  const { error } = await supabase.from('customer_tag_options').insert({
    tenant_id: ctx.tenant_id,
    category: c,
    value: '__category__',
    is_active: true,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/settings/tags')
  return { success: true }
}

export async function addTagOption(category: string, value: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const c = category.trim()
  const v = value.trim()
  if (!c) return { success: false, error: 'category 필수' }
  if (!v) return { success: false, error: 'value 필수' }

  const { data: existing } = await supabase
    .from('customer_tag_options')
    .select('id')
    .eq('tenant_id', ctx.tenant_id)
    .eq('category', c)
    .eq('value', v)
    .eq('is_active', true)
    .maybeSingle()
  if (existing) return { success: false, error: '이미 존재하는 옵션입니다.' }

  const { data: maxRow } = await supabase
    .from('customer_tag_options')
    .select('sort_order')
    .eq('tenant_id', ctx.tenant_id)
    .eq('category', c)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextSort = (maxRow?.sort_order ?? 0) + 1
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('customer_tag_options')
    .insert({
      tenant_id: ctx.tenant_id,
      category: c,
      value: v,
      is_active: true,
      sort_order: nextSort,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? '저장 실패' }
  revalidatePath('/settings/tags')
  return { success: true, data: { id: data.id } }
}

export async function updateTagOption(id: string, value: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const v = value.trim()
  if (!v) return { success: false, error: 'value 필수' }

  const { error } = await supabase
    .from('customer_tag_options')
    .update({ value: v, updated_at: new Date().toISOString() })
    .eq('tenant_id', ctx.tenant_id)
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/settings/tags')
  return { success: true }
}

export async function deactivateTagOption(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { error } = await supabase
    .from('customer_tag_options')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', ctx.tenant_id)
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/settings/tags')
  return { success: true }
}

export async function deactivateTagCategory(category: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const c = category.trim()
  if (!c) return { success: false, error: 'category 필수' }

  const { error } = await supabase
    .from('customer_tag_options')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', ctx.tenant_id)
    .eq('category', c)
    .eq('is_active', true)

  if (error) return { success: false, error: error.message }
  revalidatePath('/settings/tags')
  return { success: true }
}

