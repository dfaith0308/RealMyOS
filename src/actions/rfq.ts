'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'

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

/** 공급자가 입찰할 수 있는 오픈 RFQ (`get_supplier_rfqs` RPC — RLS 우회 + 노출 단계). */
export async function getSupplierRfqs(): Promise<{ data: SupplierRfqRow[] | null; error: string | null }> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { data: null, error: '로그인 필요' }

  const { data, error } = await supabase.rpc('get_supplier_rfqs', {
    p_supplier_tenant_id: ctx.tenant_id,
  })

  if (error) return { data: null, error: error.message }

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

  const normalized: SupplierRfqRow[] = rows.map((row) => ({
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

  return { data: normalized, error: null }
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
