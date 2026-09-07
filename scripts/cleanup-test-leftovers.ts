/**
 * [TEST] 잔여 데이터 정리 — 2026-09-07
 *
 *   npx tsx scripts/cleanup-test-leftovers.ts          # 드라이런 (기본, 아무것도 안 바꿈)
 *   npx tsx scripts/cleanup-test-leftovers.ts --apply  # 실제 반영
 *
 * 방침
 *  - 물리 삭제는 하지 않는다. commerce_order_items 7건이 [TEST] listing 을 참조하고 있고,
 *    과거 주문 표시는 listing_title 스냅샷으로 유지되므로 "노출만 끊는다".
 *      · commerce_product_listings → deleted_at, is_visible=false  (되돌리기 가능)
 *      · products                  → deleted_at                    (되돌리기 가능)
 *      · field_observations        → status='discarded'            (설계된 소프트 삭제)
 *  - 예외 둘은 물리 삭제한다. 되돌릴 스키마가 없고 오늘 만든 테스트 산출물이다.
 *      · sales_leads   : deleted_at 컬럼이 없다. 앱의 리드 삭제와 같은 경로(메모는 CASCADE)
 *      · storage 이미지: 이번 검증에서 올린 8x8 PNG
 *  - product_costs 는 건드리지 않는다. 원가 이력이라 남겨둔다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const APPLY = process.argv.includes('--apply')
const BUCKET = 'commerce-images'

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

type ProductRow = {
  id: string
  product_code: string
  name: string
  deleted_at: string | null
  commerce_product_listings: { id: string; status: string; is_visible: boolean; deleted_at: string | null }[] | null
}

type ObsRow = { id: string; memo: string; status: string; photo_urls: string[] | null }
type LeadRow = { id: string; company_name: string }

async function collect(db: SupabaseClient) {
  const { data: prods, error: pErr } = await db
    .from('products')
    .select('id, product_code, name, deleted_at, commerce_product_listings(id, status, is_visible, deleted_at)')
    .ilike('name', '[TEST]%')
    .order('product_code', { ascending: true })
  if (pErr) throw new Error(pErr.message)

  const { data: obs, error: oErr } = await db
    .from('field_observations')
    .select('id, memo, status, photo_urls')
    .ilike('memo', '%[TEST]%')
  if (oErr) throw new Error(oErr.message)

  const { data: leads, error: lErr } = await db
    .from('sales_leads')
    .select('id, company_name')
    .ilike('company_name', '[TEST]%')
  if (lErr) throw new Error(lErr.message)

  return {
    products: (prods ?? []) as unknown as ProductRow[],
    observations: (obs ?? []) as unknown as ObsRow[],
    leads: (leads ?? []) as unknown as LeadRow[],
  }
}

async function main() {
  const env = loadEnv(resolve(process.cwd(), '.env.local'))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')

  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { products, observations, leads } = await collect(db)

  const listingsToHide = products
    .flatMap((p) => (p.commerce_product_listings ?? []).map((l) => ({ ...l, code: p.product_code, name: p.name })))
    .filter((l) => !l.deleted_at)
  const productsToHide = products.filter((p) => !p.deleted_at)
  const obsToDiscard = observations.filter((o) => o.status !== 'discarded')
  // storage 는 관찰기록이 들고 있는 URL 만 지운다 (상품 이미지는 건드리지 않는다)
  const photoPaths = observations
    .flatMap((o) => o.photo_urls ?? [])
    .map((u) => u.split(`/object/public/${BUCKET}/`)[1])
    .filter((v): v is string => !!v)

  console.log(`모드: ${APPLY ? '★ 실제 반영 (--apply)' : '드라이런 (변경 없음)'}\n`)
  console.log(`[1] listing 숨김 (deleted_at + is_visible=false) — ${listingsToHide.length}건`)
  for (const l of listingsToHide) {
    console.log(`    ${l.code} ${l.name.slice(0, 40)} — 현재 ${l.status}${l.is_visible ? '/노출' : ''}`)
  }
  console.log(`\n[2] product 소프트 삭제 (deleted_at) — ${productsToHide.length}건`)
  for (const p of productsToHide) console.log(`    ${p.product_code} ${p.name.slice(0, 46)}`)
  console.log(`\n[3] 관찰기록 status='discarded' — ${obsToDiscard.length}건`)
  for (const o of obsToDiscard) console.log(`    ${o.status} → discarded | ${o.memo.split('\n')[0].slice(0, 46)}`)
  console.log(`\n[4] 리드 물리 삭제 (메모 CASCADE) — ${leads.length}건`)
  for (const l of leads) console.log(`    ${l.company_name}`)
  console.log(`\n[5] storage 이미지 삭제 — ${photoPaths.length}건`)
  for (const p of photoPaths) console.log(`    ${p}`)

  if (!APPLY) {
    console.log('\n드라이런입니다. 반영하려면 --apply 를 붙이세요.')
    return
  }

  const now = new Date().toISOString()

  if (listingsToHide.length > 0) {
    const { error } = await db
      .from('commerce_product_listings')
      .update({ deleted_at: now, is_visible: false })
      .in('id', listingsToHide.map((l) => l.id))
    if (error) throw new Error(`listing: ${error.message}`)
  }
  if (productsToHide.length > 0) {
    const { error } = await db
      .from('products')
      .update({ deleted_at: now })
      .in('id', productsToHide.map((p) => p.id))
    if (error) throw new Error(`product: ${error.message}`)
  }
  if (obsToDiscard.length > 0) {
    const { error } = await db
      .from('field_observations')
      .update({ status: 'discarded' })
      .in('id', obsToDiscard.map((o) => o.id))
    if (error) throw new Error(`observation: ${error.message}`)
  }
  if (leads.length > 0) {
    const { error } = await db.from('sales_leads').delete().in('id', leads.map((l) => l.id))
    if (error) throw new Error(`lead: ${error.message}`)
  }
  if (photoPaths.length > 0) {
    const { error } = await db.storage.from(BUCKET).remove(photoPaths)
    if (error) throw new Error(`storage: ${error.message}`)
  }

  console.log('\n반영 완료. 확인 조회:')
  const after = await collect(db)
  console.log(`  살아있는 [TEST] 상품: ${after.products.filter((p) => !p.deleted_at).length}건`)
  console.log(
    `  살아있는 [TEST] listing: ${after.products.flatMap((p) => p.commerce_product_listings ?? []).filter((l) => !l.deleted_at).length}건`,
  )
  console.log(`  discarded 아닌 [TEST] 관찰기록: ${after.observations.filter((o) => o.status !== 'discarded').length}건`)
  console.log(`  남은 [TEST] 리드: ${after.leads.length}건`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
