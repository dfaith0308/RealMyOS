'use server'

// 3rd copy — order-export.ts, quote-export.ts 참고. 4번째 문서 타입 생기면 공유 모듈 검토 필요

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { getCustomerLedger, type LedgerRow } from '@/actions/ledger'

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

export interface LedgerExportParty {
  name: string
  business_number: string | null
  representative_name: string | null
  address: string | null
  phone?: string | null
}

export interface LedgerForExport {
  customer_id: string
  document_number: string
  issued_date: string
  period_from: string
  period_to: string
  supplier: LedgerExportParty & {
    stamp_image_url: string | null
    bank_name: string | null
    bank_account: string | null
    bank_holder: string | null
  }
  buyer: LedgerExportParty
  rows: LedgerRow[]
  opening_balance: number
  period_sales: number
  period_payments: number
  current_balance: number
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

  return fromSettings || raw || ''
}

function todayKST(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
}

/**
 * 거래처 원장 거래명세서 출력용.
 * 원장 rows/summary는 getCustomerLedger 재사용 (재계산·DB 저장 금지).
 */
export async function getCustomerLedgerForExport(
  customerId: string,
  range: { from: string; to: string },
): Promise<ActionResult<LedgerForExport>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx?.tenant_id) return { success: false, error: '로그인 필요' }
  if (!customerId) return { success: false, error: 'customer_id 필요' }

  const from = String(range.from ?? '').slice(0, 10)
  const to = String(range.to ?? '').slice(0, 10)
  if (!from || !to) return { success: false, error: '조회 기간(from/to) 필요' }

  const [ledgerRes, { data: tenant }, { data: settingsRows }, { data: customer }] = await Promise.all([
    getCustomerLedger(customerId, { from, to }),
    supabase.from('tenants').select('*').eq('id', ctx.tenant_id).maybeSingle(),
    supabase.from('settings').select('key, value').eq('tenant_id', ctx.tenant_id),
    supabase
      .from('customers')
      .select('id, name, biz_number, representative_name, address, phone')
      .eq('id', customerId)
      .eq('tenant_id', ctx.tenant_id)
      .is('deleted_at', null)
      .maybeSingle(),
  ])

  if (!ledgerRes.success || !ledgerRes.data) {
    return { success: false, error: ledgerRes.error ?? '원장 조회 실패' }
  }
  if (!customer) return { success: false, error: '거래처를 찾을 수 없습니다.' }

  const { rows, summary } = ledgerRes.data
  const settingsMap = new Map(
    (settingsRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]),
  )
  const t: Record<string, unknown> = (tenant as Record<string, unknown> | null) ?? {}

  const stamp_image_url =
    (typeof t.stamp_image_url === 'string' ? t.stamp_image_url.trim() : '') ||
    pickSetting(settingsMap, ['stamp_image_url', 'company_stamp_url', 'voucher_stamp_url'])

  const bank_name =
    (typeof t.bank_name === 'string' ? t.bank_name.trim() : '') ||
    pickSetting(settingsMap, ['statement_bank_name', 'bank_name'])

  const bank_account =
    (typeof t.bank_account === 'string' ? t.bank_account.trim() : '') ||
    pickSetting(settingsMap, ['statement_bank_account', 'bank_account'])

  const bank_holder =
    (typeof t.bank_holder === 'string' ? t.bank_holder.trim() : '') ||
    pickSetting(settingsMap, ['statement_bank_holder', 'bank_holder'])

  const supplierName = resolveSupplierName(t.name, settingsMap)
  const supplierBiz =
    (typeof t.business_number === 'string' ? t.business_number.trim() : '') ||
    pickSetting(settingsMap, ['business_number', 'company_biz_number', 'biz_number'])
  const supplierRep =
    (typeof t.representative_name === 'string' ? t.representative_name.trim() : '') ||
    pickSetting(settingsMap, ['representative_name', 'company_representative'])
  const supplierAddress =
    joinAddress(
      typeof t.address === 'string' ? t.address : null,
      typeof t.address_detail === 'string' ? t.address_detail : null,
    ) || pickSetting(settingsMap, ['company_address', 'address'])
  const supplierPhone =
    (typeof t.contact_phone === 'string' ? t.contact_phone.trim() : '') ||
    (typeof t.phone === 'string' ? t.phone.trim() : '') ||
    pickSetting(settingsMap, ['company_phone', 'contact_phone', 'phone'])

  const issued_date = todayKST()
  const shortId = customerId.replace(/-/g, '').slice(0, 8).toUpperCase()
  const document_number = `LS-${issued_date.replace(/-/g, '')}-${shortId}`

  const lastRunning =
    rows.length > 0 ? rows[rows.length - 1].running_balance : summary.opening_balance

  return {
    success: true,
    data: {
      customer_id: customer.id,
      document_number,
      issued_date,
      period_from: from,
      period_to: to,
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
        name: String(customer.name ?? summary.customer_name ?? '-'),
        business_number: customer.biz_number ?? null,
        representative_name: customer.representative_name ?? null,
        address: customer.address ?? null,
        phone: customer.phone ?? null,
      },
      rows,
      opening_balance: summary.opening_balance,
      period_sales: summary.total_orders,
      period_payments: summary.total_payments,
      current_balance: summary.current_balance ?? lastRunning,
    },
  }
}
