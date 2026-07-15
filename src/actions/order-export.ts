'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

export interface OrderExportLine {
  product_name: string
  quantity: number
  unit_price: number
  amount: number
}

export interface OrderExportParty {
  name: string
  business_number: string | null
  representative_name: string | null
  address: string | null
  phone?: string | null
}

export interface OrderForExport {
  order_id: string
  document_number: string
  order_date: string
  memo: string | null
  supplier: OrderExportParty & {
    stamp_image_url: string | null
    bank_name: string | null
    bank_account: string | null
    bank_holder: string | null
  }
  buyer: OrderExportParty
  lines: OrderExportLine[]
}

function pickSetting(map: Map<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const v = map.get(k)
    if (v != null && String(v).trim() !== '') return String(v)
  }
  return null
}

function joinAddress(address?: string | null, detail?: string | null): string | null {
  const parts = [address, detail].map((x) => (x ?? '').trim()).filter(Boolean)
  return parts.length ? parts.join(' ') : null
}

/**
 * 거래명세서 출력용 주문 데이터.
 * 합계는 저장하지 않음 — 라인의 quantity·unit_price로 클라이언트에서 계산.
 */
export async function getOrderForExport(orderId: string): Promise<ActionResult<OrderForExport>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx?.tenant_id) return { success: false, error: '로그인 필요' }

  const [{ data: order, error: oErr }, { data: tenant }, { data: settingsRows }] = await Promise.all([
    supabase
      .from('orders')
      .select(`
        id, order_number, order_date, memo, tenant_id, seller_tenant_id, customer_id,
        customers(name, biz_number, representative_name, address, phone),
        order_lines(product_name, quantity, unit_price, line_total)
      `)
      .eq('id', orderId)
      .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
      .is('deleted_at', null)
      .single(),
    supabase.from('tenants').select('*').eq('id', ctx.tenant_id).maybeSingle(),
    supabase.from('settings').select('key, value').eq('tenant_id', ctx.tenant_id),
  ])

  if (oErr || !order) return { success: false, error: oErr?.message ?? '주문 조회 실패' }

  const settingsMap = new Map((settingsRows ?? []).map((r: any) => [r.key as string, r.value as string]))
  const t: any = tenant ?? {}

  const stamp_image_url =
    (t.stamp_image_url as string | null | undefined)?.trim() ||
    pickSetting(settingsMap, ['stamp_image_url', 'company_stamp_url', 'voucher_stamp_url'])

  const bank_name =
    (t.bank_name as string | null | undefined)?.trim() ||
    pickSetting(settingsMap, ['bank_name', 'statement_bank_name'])

  const bank_account =
    (t.bank_account as string | null | undefined)?.trim() ||
    pickSetting(settingsMap, ['bank_account', 'statement_bank_account'])

  const bank_holder =
    (t.bank_holder as string | null | undefined)?.trim() ||
    pickSetting(settingsMap, ['bank_holder', 'statement_bank_holder'])

  const custRaw = (order as any).customers
  const cust = Array.isArray(custRaw) ? custRaw[0] : custRaw

  const lines: OrderExportLine[] = ((order as any).order_lines ?? []).map((l: any) => ({
    product_name: String(l.product_name ?? ''),
    quantity: Number(l.quantity ?? 0),
    unit_price: Number(l.unit_price ?? 0),
    // amount는 표시용 스냅샷; PDF 합계는 quantity×unit_price로 재계산
    amount: Number(l.line_total ?? 0),
  }))

  const orderNumber = String((order as any).order_number ?? order.id)
  const document_number = orderNumber.startsWith('TS-') ? orderNumber : `TS-${orderNumber}`

  return {
    success: true,
    data: {
      order_id: order.id,
      document_number,
      order_date: String((order as any).order_date ?? '').slice(0, 10),
      memo: (order as any).memo ?? null,
      supplier: {
        name: String(t.name ?? ''),
        business_number: t.business_number ?? null,
        representative_name: t.representative_name ?? null,
        address: joinAddress(t.address, t.address_detail),
        phone: t.contact_phone ?? t.phone ?? null,
        stamp_image_url,
        bank_name,
        bank_account,
        bank_holder,
      },
      buyer: {
        name: String(cust?.name ?? '-'),
        business_number: cust?.biz_number ?? null,
        representative_name: cust?.representative_name ?? null,
        address: cust?.address ?? null,
        phone: cust?.phone ?? null,
      },
      lines,
    },
  }
}
