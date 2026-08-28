'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { parseRegion } from '@/lib/region-parse'
import type { ActionResult } from '@/types/order'
import {
  CONTACT_METHOD_VALUES,
  LEAD_STATUS_VALUES,
  type ContactMethod,
  type LeadStatus,
  type LeadType,
  type SalesLeadListRow,
  type SalesLeadNoteRow,
  type SalesLeadRow,
} from '@/types/sales-lead'

const LIST_LIMIT = 500

async function requireAdmin() {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx || ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

function sanitizeContactMethods(input: unknown): ContactMethod[] {
  if (!Array.isArray(input)) return []
  const allowed = new Set<string>(CONTACT_METHOD_VALUES)
  return Array.from(
    new Set(input.filter((m): m is ContactMethod => typeof m === 'string' && allowed.has(m))),
  )
}

function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const cleaned = input
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim().replace(/^#/, ''))
    .filter((t) => t.length > 0 && t.length <= 20)
  return Array.from(new Set(cleaned)).slice(0, 10)
}

function sanitizeStatus(input: unknown): LeadStatus | null {
  return typeof input === 'string' && (LEAD_STATUS_VALUES as string[]).includes(input)
    ? (input as LeadStatus)
    : null
}

function sanitizeInterest(input: unknown): number | null {
  const n = Number(input)
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  return i >= 1 && i <= 3 ? i : null
}

/** 네이버플레이스 링크만 허용 — 임의 URL이 관리자 화면에 심어지는 것을 막는다 */
function sanitizeNaverPlaceUrl(input: unknown): string | null {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!/(^|\.)naver\.(com|me)$/.test(u.hostname)) return null
    return u.toString()
  } catch {
    return null
  }
}

export type LeadFilters = {
  lead_type: LeadType
  status?: string
  region_sido?: string
  region_sigungu?: string
  interest_level?: number
  tag?: string
  q?: string
}

/**
 * 리드 목록.
 * 쿼리 수는 리드 건수와 무관하게 고정이다 (태그필터 1 + 리드 1 + 메모 1).
 * 메모는 lead_id IN (...) 으로 한 번에 가져와 메모리에서 집계한다 — 행당 조회 없음.
 */
export async function listSalesLeads(
  filters: LeadFilters,
): Promise<ActionResult<{ leads: SalesLeadListRow[] }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createSupabaseAdmin()

  // 태그 필터는 메모에 걸려 있으므로 해당 lead_id 집합을 먼저 좁힌다
  let tagLeadIds: string[] | null = null
  const tag = filters.tag?.trim()
  if (tag) {
    const { data, error } = await supabase
      .from('sales_lead_notes')
      .select('lead_id')
      .contains('tags', [tag])
    if (error) return { success: false, error: error.message }
    tagLeadIds = Array.from(new Set((data ?? []).map((r: any) => r.lead_id as string)))
    if (tagLeadIds.length === 0) return { success: true, data: { leads: [] } }
  }

  let query = supabase
    .from('sales_leads')
    .select('*')
    .eq('lead_type', filters.lead_type)
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.region_sido) query = query.eq('region_sido', filters.region_sido)
  if (filters.region_sigungu) query = query.eq('region_sigungu', filters.region_sigungu)
  if (filters.interest_level) query = query.eq('interest_level', filters.interest_level)
  if (tagLeadIds) query = query.in('id', tagLeadIds)
  if (filters.q?.trim()) {
    // PostgREST or() 문법을 깨는 문자만 제거
    const q = filters.q.trim().replace(/[%,()]/g, '')
    if (q) query = query.or(`company_name.ilike.%${q}%,phone.ilike.%${q}%,address.ilike.%${q}%`)
  }

  const { data: leads, error } = await query
  if (error) return { success: false, error: error.message }

  const rows = (leads ?? []) as SalesLeadRow[]
  if (rows.length === 0) return { success: true, data: { leads: [] } }

  const { data: notes, error: noteErr } = await supabase
    .from('sales_lead_notes')
    .select('lead_id, tags, created_at')
    .in(
      'lead_id',
      rows.map((r) => r.id),
    )
  if (noteErr) return { success: false, error: noteErr.message }

  const agg = new Map<string, { count: number; last: string | null; tags: Set<string> }>()
  for (const n of (notes ?? []) as Array<{
    lead_id: string
    tags: string[] | null
    created_at: string
  }>) {
    let entry = agg.get(n.lead_id)
    if (!entry) {
      entry = { count: 0, last: null, tags: new Set<string>() }
      agg.set(n.lead_id, entry)
    }
    entry.count++
    if (!entry.last || n.created_at > entry.last) entry.last = n.created_at
    for (const t of n.tags ?? []) entry.tags.add(t)
  }

  const merged: SalesLeadListRow[] = rows.map((r) => {
    const entry = agg.get(r.id)
    return {
      ...r,
      contact_methods: (r.contact_methods ?? []) as ContactMethod[],
      note_count: entry?.count ?? 0,
      last_note_at: entry?.last ?? null,
      tags: entry ? Array.from(entry.tags) : [],
    }
  })

  return { success: true, data: { leads: merged } }
}

/** 필터 드롭다운 채우기용 — 현재 존재하는 지역/태그 값만 노출 */
export async function getLeadFilterOptions(
  lead_type: LeadType,
): Promise<ActionResult<{ sidos: string[]; sigungus: string[]; tags: string[] }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createSupabaseAdmin()

  const [{ data: regions, error: regionErr }, { data: noteTags, error: tagErr }] = await Promise.all([
    supabase.from('sales_leads').select('region_sido, region_sigungu').eq('lead_type', lead_type),
    supabase.from('sales_lead_notes').select('tags').limit(2000),
  ])

  if (regionErr) return { success: false, error: regionErr.message }
  if (tagErr) return { success: false, error: tagErr.message }

  const sidos = new Set<string>()
  const sigungus = new Set<string>()
  for (const r of (regions ?? []) as Array<{
    region_sido: string | null
    region_sigungu: string | null
  }>) {
    if (r.region_sido) sidos.add(r.region_sido)
    if (r.region_sigungu) sigungus.add(r.region_sigungu)
  }

  const tags = new Set<string>()
  for (const n of (noteTags ?? []) as Array<{ tags: string[] | null }>) {
    for (const t of n.tags ?? []) tags.add(t)
  }

  return {
    success: true,
    data: {
      sidos: Array.from(sidos).sort(),
      sigungus: Array.from(sigungus).sort(),
      tags: Array.from(tags).sort(),
    },
  }
}

export async function getSalesLead(
  id: string,
): Promise<ActionResult<{ lead: SalesLeadRow; notes: SalesLeadNoteRow[] }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createSupabaseAdmin()

  const [{ data: lead, error: leadErr }, { data: notes, error: noteErr }] = await Promise.all([
    supabase.from('sales_leads').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('sales_lead_notes')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (leadErr) return { success: false, error: leadErr.message }
  if (!lead) return { success: false, error: '리드를 찾을 수 없습니다' }
  if (noteErr) return { success: false, error: noteErr.message }

  return {
    success: true,
    data: {
      lead: {
        ...(lead as SalesLeadRow),
        contact_methods: ((lead as any).contact_methods ?? []) as ContactMethod[],
      },
      notes: ((notes ?? []) as SalesLeadNoteRow[]).map((n) => ({ ...n, tags: n.tags ?? [] })),
    },
  }
}

export async function createSalesLead(input: {
  lead_type: LeadType
  company_name: string
  phone?: string
  address?: string
  contact_methods?: string[]
  status?: string
  interest_level?: number
  naver_place_url?: string
}): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const company_name = (input.company_name ?? '').trim()
  if (!company_name) return { success: false, error: '업체명은 필수입니다' }
  if (input.lead_type !== 'supplier' && input.lead_type !== 'restaurant') {
    return { success: false, error: '리드 유형이 올바르지 않습니다' }
  }

  const address = (input.address ?? '').trim() || null
  const region = parseRegion(address)

  const supabase = await createSupabaseAdmin()
  const { data, error } = await supabase
    .from('sales_leads')
    .insert({
      lead_type: input.lead_type,
      company_name,
      phone: (input.phone ?? '').trim() || null,
      address,
      region_sido: region.sido,
      region_sigungu: region.sigungu,
      contact_methods: sanitizeContactMethods(input.contact_methods),
      status: sanitizeStatus(input.status) ?? 'new',
      interest_level: sanitizeInterest(input.interest_level) ?? 1,
      naver_place_url: sanitizeNaverPlaceUrl(input.naver_place_url),
      created_by: auth.ctx.user_id,
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/sales')
  return { success: true, data: { id: data.id as string } }
}

export async function updateSalesLead(
  id: string,
  patch: {
    company_name?: string
    phone?: string | null
    address?: string | null
    contact_methods?: string[]
    status?: string
    interest_level?: number
    naver_place_url?: string | null
    linked_tenant_id?: string | null
  },
): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (patch.company_name !== undefined) {
    const name = patch.company_name.trim()
    if (!name) return { success: false, error: '업체명은 비울 수 없습니다' }
    update.company_name = name
  }
  if (patch.phone !== undefined) update.phone = (patch.phone ?? '').trim() || null
  if (patch.address !== undefined) {
    const address = (patch.address ?? '').trim() || null
    update.address = address
    // 주소가 바뀌면 지역도 다시 뽑는다
    const region = parseRegion(address)
    update.region_sido = region.sido
    update.region_sigungu = region.sigungu
  }
  if (patch.contact_methods !== undefined) {
    update.contact_methods = sanitizeContactMethods(patch.contact_methods)
  }
  if (patch.status !== undefined) {
    const status = sanitizeStatus(patch.status)
    if (!status) return { success: false, error: '상태값이 올바르지 않습니다' }
    update.status = status
  }
  if (patch.interest_level !== undefined) {
    const level = sanitizeInterest(patch.interest_level)
    if (!level) return { success: false, error: '관심도는 1~3 사이여야 합니다' }
    update.interest_level = level
  }
  if (patch.naver_place_url !== undefined) {
    update.naver_place_url = sanitizeNaverPlaceUrl(patch.naver_place_url)
  }
  if (patch.linked_tenant_id !== undefined) {
    update.linked_tenant_id = patch.linked_tenant_id || null
  }

  const supabase = await createSupabaseAdmin()
  const { error } = await supabase.from('sales_leads').update(update).eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/sales')
  revalidatePath(`/admin/sales/leads/${id}`)
  return { success: true }
}

export async function deleteSalesLead(id: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createSupabaseAdmin()
  // 메모는 FK ON DELETE CASCADE 로 함께 지워진다
  const { error } = await supabase.from('sales_leads').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/sales')
  return { success: true }
}

export async function addSalesLeadNote(input: {
  lead_id: string
  body: string
  tags?: string[]
}): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const body = (input.body ?? '').trim()
  if (!body) return { success: false, error: '메모 내용을 입력하세요' }

  const supabase = await createSupabaseAdmin()
  const { data, error } = await supabase
    .from('sales_lead_notes')
    .insert({
      lead_id: input.lead_id,
      body,
      tags: sanitizeTags(input.tags),
      created_by: auth.ctx.user_id,
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }

  revalidatePath(`/admin/sales/leads/${input.lead_id}`)
  return { success: true, data: { id: data.id as string } }
}

export async function deleteSalesLeadNote(id: string, lead_id: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createSupabaseAdmin()
  const { error } = await supabase.from('sales_lead_notes').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath(`/admin/sales/leads/${lead_id}`)
  return { success: true }
}
