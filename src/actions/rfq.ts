'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

/** 발주 확정 후 공급자 알림: `@/lib/rfq-notify-suppliers`의 `notifyRfqBidOutcomesAfterAccept` — 식당OS `acceptBidAndCreateOrder`에서 호출. */

export type SupplierRfqRow = {
  id: string
  product_name: string
  quantity: number
  unit: string | null
  target_price: number | null
  deadline: string | null
  region: string | null
  status: string
  created_at: string
  /** 1 기존 거래처 / 2 지역 확장 / 3 전체 공개 — RPC `get_supplier_rfqs` */
  expose_level: number | null
}

export type MyBidRow = {
  id: string
  rfq_id: string
  price: number
  delivery_days: number | null
  status: string
  rfq_requests: {
    product_name: string
    quantity: number
    unit: string | null
    deadline: string | null
    status: string
  } | null
}

export type SubmitRfqBidInput = {
  rfq_id: string
  price: number
  delivery_days?: number | null
  note?: string | null
}

function normalizeSupplierRfqsRpcData(data: unknown): SupplierRfqRow[] {
  const rows = (data ?? []) as Array<{
    id: string
    product_name: string
    quantity: number
    unit: string | null
    target_price: number | null
    deadline: string | null
    region: string | null
    status: string
    created_at: string
    expose_level: number | null
  }>

  return rows.map((row) => ({
    id: row.id,
    product_name: row.product_name,
    quantity: row.quantity,
    unit: row.unit ?? null,
    target_price: row.target_price ?? null,
    deadline: row.deadline ?? null,
    region: row.region ?? null,
    status: row.status,
    created_at: row.created_at,
    expose_level: row.expose_level ?? null,
  }))
}

/** 공급자가 입찰할 수 있는 오픈 RFQ (`get_supplier_rfqs` RPC — RLS 우회 + 노출 단계). */
export async function getSupplierRfqs(): Promise<{ data: SupplierRfqRow[] | null; error: string | null }> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { data: null, error: '로그인 필요' }

  const { data, error } = await supabase.rpc('get_supplier_rfqs', {
    p_supplier_tenant_id: ctx.tenant_id,
  })

  if (error) return { data: null, error: error.message }
  return { data: normalizeSupplierRfqsRpcData(data), error: null }
}

/** RPC 목록에서 단건 조회 (상세·RLS 우회와 동일 노출 집합). */
export async function getRfqDetail(
  rfq_id: string,
): Promise<{ data: SupplierRfqRow | null; error: string | null }> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { data: null, error: '로그인 필요' }

  const { data, error } = await supabase.rpc('get_supplier_rfqs', {
    p_supplier_tenant_id: ctx.tenant_id,
  })

  if (error) return { data: null, error: error.message }
  const row = normalizeSupplierRfqsRpcData(data).find((r) => r.id === rfq_id) ?? null
  return { data: row, error: null }
}

/** 내 테넌트가 해당 RFQ에 입찰했는지 (상세 폼 노출용). */
export async function getMyBidForRfq(
  rfq_id: string,
): Promise<{ data: { id: string } | null; error: string | null }> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { data: null, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('rfq_bids')
    .select('id')
    .eq('rfq_id', rfq_id)
    .eq('supplier_tenant_id', ctx.tenant_id)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  return { data: data?.id ? { id: data.id } : null, error: null }
}

/** RFQ 입찰 제출 (단일 INSERT, RULE-19 해당 없음). */
export async function submitRfqBid(input: SubmitRfqBidInput): Promise<ActionResult<{ bid_id: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!input.rfq_id?.trim()) return { success: false, error: '발주요청이 올바르지 않습니다.' }
  if (!Number.isFinite(input.price) || input.price <= 0) return { success: false, error: '유효한 가격을 입력해주세요.' }
  if (input.delivery_days != null) {
    if (!Number.isInteger(input.delivery_days) || input.delivery_days < 0)
      return { success: false, error: '납기(일)는 0 이상의 정수여야 합니다.' }
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_supplier_rfqs', {
    p_supplier_tenant_id: ctx.tenant_id,
  })
  if (rpcErr) return { success: false, error: rpcErr.message }

  const visible = normalizeSupplierRfqsRpcData(rpcData).find((r) => r.id === input.rfq_id)
  if (!visible || visible.status !== 'open')
    return { success: false, error: '입찰할 수 없는 발주요청입니다.' }

  const { data: existing } = await supabase
    .from('rfq_bids')
    .select('id')
    .eq('rfq_id', input.rfq_id)
    .eq('supplier_tenant_id', ctx.tenant_id)
    .maybeSingle()

  if (existing) return { success: false, error: '이미 입찰하셨습니다' }

  const { data: tenantRow, error: tenantErr } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', ctx.tenant_id)
    .maybeSingle()

  if (tenantErr) return { success: false, error: tenantErr.message }
  const supplier_name = tenantRow?.name?.trim()
  if (!supplier_name) return { success: false, error: '공급자 이름을 확인할 수 없습니다.' }

  const { data: inserted, error: insErr } = await supabase
    .from('rfq_bids')
    .insert({
      rfq_id: input.rfq_id,
      supplier_tenant_id: ctx.tenant_id,
      supplier_name,
      price: Math.round(input.price),
      delivery_days: input.delivery_days ?? null,
      note: input.note?.trim() || null,
    })
    .select('id')
    .single()

  if (insErr) {
    if (insErr.code === '23505') return { success: false, error: '이미 입찰하셨습니다' }
    return { success: false, error: insErr.message }
  }

  if (!inserted?.id) return { success: false, error: '입찰 저장에 실패했습니다.' }

  revalidatePath('/rfq')
  revalidatePath(`/rfq/${input.rfq_id}`)
  return { success: true, data: { bid_id: inserted.id } }
}

/** 내 테넌트가 제출한 입찰 + RFQ 요약(조인 단일 쿼리). */
export async function getMyBids(): Promise<{ data: MyBidRow[] | null; error: string | null }> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { data: null, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('rfq_bids')
    .select(`
      id,
      rfq_id,
      price,
      delivery_days,
      status,
      rfq_requests (
        product_name,
        quantity,
        unit,
        deadline,
        status
      )
    `)
    .eq('supplier_tenant_id', ctx.tenant_id)
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: error.message }

  const rows = (data ?? []) as Array<
    Omit<MyBidRow, 'rfq_requests'> & { rfq_requests: MyBidRow['rfq_requests'] | MyBidRow['rfq_requests'][] }
  >
  const normalized: MyBidRow[] = rows.map((row) => {
    const rq = row.rfq_requests
    const rfq_requests = Array.isArray(rq) ? (rq[0] ?? null) : rq ?? null
    return {
      id: row.id,
      rfq_id: row.rfq_id,
      price: row.price,
      delivery_days: row.delivery_days,
      status: row.status,
      rfq_requests,
    }
  })
  return { data: normalized, error: null }
}
