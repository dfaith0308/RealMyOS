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
  total_amount: number
  discount_amount: number
  point_used: number
  /** 클라이언트 계산 실청구액 (total - discount - point) */
  payable_amount: number
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

const PLACEHOLDER_COMPANY_NAMES = new Set(['내 회사', '내회사', 'my company', 'My Company'])

function resolveSupplierName(tenantName: unknown, settingsMap: Map<string, string>): string {
  const fromSettings = pickSetting(settingsMap, ['company_name', 'business_name', 'shop_name'])
  if (fromSettings) return fromSettings

  const raw = String(tenantName ?? '').trim()
  if (raw && !PLACEHOLDER_COMPANY_NAMES.has(raw)) return raw

  // 플레이스홀더면 settings 재시도용 키 / 최후 tenants.name
  return fromSettings || raw || ''
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
        total_amount, discount_amount, point_used, final_amount,
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
    pickSetting(settingsMap, ['statement_bank_name', 'bank_name'])

  const bank_account =
    (t.bank_account as string | null | undefined)?.trim() ||
    pickSetting(settingsMap, ['statement_bank_account', 'bank_account'])

  const bank_holder =
    (t.bank_holder as string | null | undefined)?.trim() ||
    pickSetting(settingsMap, ['statement_bank_holder', 'bank_holder'])

  const custRaw = (order as any).customers
  const cust = Array.isArray(custRaw) ? custRaw[0] : custRaw

  const lines: OrderExportLine[] = ((order as any).order_lines ?? []).map((l: any) => ({
    product_name: String(l.product_name ?? ''),
    quantity: Number(l.quantity ?? 0),
    unit_price: Number(l.unit_price ?? 0),
    // amount는 표시용 스냅샷; PDF 합계는 quantity×unit_price로 재계산
    amount: Number(l.line_total ?? 0),
  }))

  const linesSubtotal = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
    0,
  )
  const discount_amount = Math.max(0, Number((order as any).discount_amount ?? 0))
  const point_used = Math.max(0, Number((order as any).point_used ?? 0))
  const total_amount = Number((order as any).total_amount ?? linesSubtotal)
  const payable_amount = Math.max(0, total_amount - discount_amount - point_used)

  const orderNumber = String((order as any).order_number ?? order.id)
  const document_number = orderNumber.startsWith('TS-') ? orderNumber : `TS-${orderNumber}`

  const supplierName = resolveSupplierName(t.name, settingsMap)
  const supplierBiz =
    (t.business_number as string | null | undefined)?.trim() ||
    pickSetting(settingsMap, ['business_number', 'company_biz_number', 'biz_number'])
  const supplierRep =
    (t.representative_name as string | null | undefined)?.trim() ||
    pickSetting(settingsMap, ['representative_name', 'company_representative'])
  const supplierAddress =
    joinAddress(t.address, t.address_detail) ||
    pickSetting(settingsMap, ['company_address', 'address'])
  const supplierPhone =
    (t.contact_phone as string | null | undefined)?.trim() ||
    (t.phone as string | null | undefined)?.trim() ||
    pickSetting(settingsMap, ['company_phone', 'contact_phone', 'phone'])

  return {
    success: true,
    data: {
      order_id: order.id,
      document_number,
      order_date: String((order as any).order_date ?? '').slice(0, 10),
      memo: (order as any).memo ?? null,
      total_amount,
      discount_amount,
      point_used,
      payable_amount,
      supplier: {
        name: supplierName,
        business_number: supplierBiz,
        representative_name: supplierRep,
        address: supplierAddress,
        phone: supplierPhone,
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
