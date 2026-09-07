/**
 * 원가 미확정(cost_price <= 1 또는 원가 행 없음) 상품 목록만 뽑는다 — 읽기 전용.
 *
 * 사용:
 *   npx tsx scripts/report-unconfirmed-cost-listings.ts
 *
 * 과거 데이터는 고치지 않는다. 사장님이 하나씩 확인해 매입가를 채워 넣을 목록을 만드는 용도다.
 * (상품 등록/수정 화면에서 공급가를 입력하고 저장하면 그 상품의 원가가 확정된다)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const PLATFORM_OWNER_TENANT = '00000000-0000-0000-0000-000000000000'
/** 화면(commerce-constants.isCostUnconfirmed)과 같은 기준 */
const PLACEHOLDER_COST = 1

function loadEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {}
  let raw = ''
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return env
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    env[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return env
}

type CostRow = { cost_price: number; start_date: string; end_date: string | null }

function activeCost(rows: CostRow[] | null | undefined): number | null {
  const active = (rows ?? [])
    .filter((c) => c.end_date == null)
    .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))
  const top = active[0]
  return top && Number.isFinite(top.cost_price) ? Math.round(top.cost_price) : null
}

async function main() {
  const env = loadEnv(resolve(process.cwd(), '.env.local'))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 판매 중인 listing — 상품·원가를 한 번에 가져온다 (행마다 조회하지 않는다)
  const { data: listings, error: lErr } = await supabase
    .from('commerce_product_listings')
    .select(
      'id, commerce_price, status, is_visible, created_at, products!inner(product_code, name, deleted_at, product_costs(cost_price, start_date, end_date))',
    )
    .is('deleted_at', null)
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .order('created_at', { ascending: true })
  if (lErr) throw new Error(lErr.message)

  type Row = {
    id: string
    commerce_price: number
    status: string
    is_visible: boolean
    created_at: string
    products: {
      product_code: string
      name: string
      deleted_at: string | null
      product_costs: CostRow[] | null
    }
  }

  const rows = (listings ?? []) as unknown as Row[]
  const bad = rows
    .map((r) => ({ r, cost: activeCost(r.products.product_costs) }))
    .filter((x) => x.cost == null || x.cost <= PLACEHOLDER_COST)

  console.log(`판매 listing ${rows.length}건 중 원가 미확정 ${bad.length}건\n`)
  console.log(
    ['코드', '상품명', '판매가', '원가', '상태', '등록일', 'listing_id'].join('\t'),
  )
  for (const { r, cost } of bad) {
    console.log(
      [
        r.products.product_code,
        r.products.name,
        r.commerce_price,
        cost == null ? '(원가행 없음)' : cost,
        r.is_visible ? `${r.status}/노출` : r.status,
        r.created_at.slice(0, 10),
        r.id,
      ].join('\t'),
    )
  }

  // listing 이 없는 채로 남은 상품도 같이 본다 — 화면에서는 안 보이지만 원가는 잘못 들어가 있다
  const { data: orphans, error: oErr } = await supabase
    .from('products')
    .select('product_code, name, product_costs!inner(cost_price, end_date), commerce_product_listings(id, deleted_at)')
    .eq('tenant_id', PLATFORM_OWNER_TENANT)
    .is('deleted_at', null)
    .is('product_costs.end_date', null)
    .lte('product_costs.cost_price', PLACEHOLDER_COST)
    .order('product_code', { ascending: true })
  if (oErr) throw new Error(oErr.message)

  type OrphanRow = {
    product_code: string
    name: string
    commerce_product_listings: { id: string; deleted_at: string | null }[] | null
  }
  const noListing = ((orphans ?? []) as unknown as OrphanRow[]).filter(
    (p) => (p.commerce_product_listings ?? []).filter((l) => !l.deleted_at).length === 0,
  )

  console.log(`\n판매 listing 이 없는 상태로 원가만 자리값인 상품 ${noListing.length}건`)
  for (const p of noListing) console.log([p.product_code, p.name].join('\t'))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
