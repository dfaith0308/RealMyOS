/** 문의관리 — 등록 → 목록 → 상세 → 수동 매칭 전 과정 검증 */
import { chromium } from 'playwright'
import { injectAdminSession } from './_probe-login'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

function load(p: string) {
  const e: Record<string, string> = {}
  for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!l || l.startsWith('#') || !l.includes('=')) continue
    const i = l.indexOf('=')
    e[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return e
}

const env = load(resolve(process.cwd(), '.env.local'))
const OUT = resolve(process.cwd(), '.tmp-e2e', 'inquiry')
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3000'

// ── 오늘 실제로 있었던 문의 (육회전용 참기름) ────────────────────────────
const CASE = {
  customerName: process.env.INQ_NAME ?? '[테스트] 이기욱',
  customerPhone: process.env.INQ_PHONE ?? '010-6716-0207',
  type: process.env.INQ_TYPE ?? 'product', // 상품문의
  method: process.env.INQ_METHOD ?? 'phone', // 전화
  priceNote: process.env.INQ_PRICE_NOTE ?? '육회전용 참기름 1병 12,000원 안내',
  paymentNote: process.env.INQ_PAY_NOTE ?? '계좌이체 안내',
  shippingNote: process.env.INQ_SHIP_NOTE ?? '당일발송',
  memo:
    process.env.INQ_MEMO ??
    '육회전용 참기름 있냐고 전화 주심. 일반 참기름과 뭐가 다른지 물어보셔서 향이 덜 강하고 육회 맛을 안 덮는다고 설명드림.\n가격 안내 후 바로 주문하시겠다고 해서 계좌 알려드림.',
  /** 매칭 확인용 검색어 — 이 회원과 연결한다 */
  searchQuery: process.env.INQ_MATCH_Q ?? '이기욱',
}

async function main() {
  const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const before = await svc.from('inquiries').select('id', { count: 'exact', head: true })
  console.log('시작 전 문의 건수:', before.error ? `오류 ${before.error.message}` : before.count)

  const b = await chromium.launch({ headless: true })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } })
  await injectAdminSession(ctx)
  const p = await ctx.newPage()

  // ── 1) 메뉴 확인 ──
  await p.goto(`${BASE}/admin/inquiries`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(6000)
  console.log('url:', p.url())
  console.log('사이드바 "잠재고객 관리":', (await p.getByText('잠재고객 관리', { exact: true }).count()) > 0)
  console.log('사이드바 "리드 관리"(옛 이름):', (await p.getByText('리드 관리', { exact: true }).count()) > 0)
  console.log('사이드바 "문의관리":', (await p.getByText('문의관리', { exact: true }).count()) > 0)
  await p.screenshot({ path: resolve(OUT, '01-list-empty.png'), fullPage: true })

  // ── 2) 등록 폼 ──
  await p.getByRole('button', { name: '＋ 문의 기록하기' }).click()
  await p.waitForTimeout(800)

  await p.locator('#inq-name').fill(CASE.customerName)
  await p.locator('#inq-phone').fill(CASE.customerPhone)
  await p.locator('#inq-type').selectOption(CASE.type)
  await p.locator('#inq-method').selectOption(CASE.method)

  await p.getByLabel('가격안내 내용').isDisabled()
  await p.locator('label', { hasText: '가격안내' }).locator('input[type=checkbox]').check()
  await p.getByLabel('가격안내 내용').fill(CASE.priceNote)
  await p.locator('label', { hasText: '결제안내' }).locator('input[type=checkbox]').check()
  await p.getByLabel('결제안내 내용').fill(CASE.paymentNote)
  await p.locator('label', { hasText: '발송' }).locator('input[type=checkbox]').check()
  await p.getByLabel('발송 내용').fill(CASE.shippingNote)

  await p.locator('#inq-memo').fill(CASE.memo)
  await p.waitForTimeout(400)
  await p.screenshot({ path: resolve(OUT, '02-form-filled.png'), fullPage: true })

  await p.getByRole('button', { name: '저장', exact: true }).click()
  await p.waitForTimeout(5000)
  await p.screenshot({ path: resolve(OUT, '03-list-after-save.png'), fullPage: true })

  // ── 3) DB 확인 ──
  const saved = await svc
    .from('inquiries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
  const row = saved.data?.[0] as Record<string, unknown> | undefined
  console.log('\n저장된 행:')
  console.log('  ', JSON.stringify(row))

  if (!row) {
    console.error('저장된 문의를 찾지 못해 중단합니다')
    await b.close()
    process.exit(1)
  }

  // ── 4) 상세 ──
  await p.goto(`${BASE}/admin/inquiries/${row.id}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(5000)
  await p.screenshot({ path: resolve(OUT, '04-detail-unmatched.png'), fullPage: true })
  const detailText = await p.locator('body').innerText()
  console.log('상세에 메모 전문 표시:', detailText.includes('향이 덜 강하고') || detailText.includes(CASE.memo.slice(0, 12)))
  console.log('상세에 담당자 표시  :', detailText.includes('admin@siksiki.com'))

  // ── 5) 수동 매칭 — 검색 ──
  await p.getByLabel('회원 검색어').fill(CASE.searchQuery)
  await p.getByRole('button', { name: '회원 찾기' }).click()
  await p.waitForTimeout(4000)
  await p.screenshot({ path: resolve(OUT, '05-candidates.png'), fullPage: true })

  const candCount = await p.getByRole('button', { name: '이 회원 선택' }).count()
  console.log('\n후보 수:', candCount)
  if (candCount === 0) {
    console.log('후보가 없어 매칭 단계를 건너뜁니다 (검색어:', CASE.searchQuery, ')')
    await b.close()
    return
  }

  // 자동으로 붙지 않는다 — 여기서 아직 matched 가 아니어야 한다
  const midway = await svc.from('inquiries').select('match_status').eq('id', row.id).single()
  console.log('후보 조회만 한 시점의 상태:', (midway.data as { match_status: string } | null)?.match_status)

  // ── 6) 사람이 고르고 확인 ──
  await p.getByRole('button', { name: '이 회원 선택' }).first().click()
  await p.waitForTimeout(800)
  await p.screenshot({ path: resolve(OUT, '06-confirm.png'), fullPage: true })

  await p.getByRole('button', { name: '이 사람이 맞다 · 연결' }).click()
  await p.waitForTimeout(5000)
  await p.screenshot({ path: resolve(OUT, '07-matched.png'), fullPage: true })

  // ── 7) 결과 확인 ──
  const after = await svc
    .from('inquiries')
    .select('id, match_status, matched_tenant_id, matched_at, matched_by')
    .eq('id', row.id)
    .single()
  console.log('\n매칭 후 문의 행:', JSON.stringify(after.data))

  const tn = await svc
    .from('tenants')
    .select('name, role')
    .eq('id', (after.data as { matched_tenant_id: string }).matched_tenant_id)
    .maybeSingle()
  console.log('연결된 회원:', JSON.stringify(tn.data))

  const logs = await svc
    .from('admin_logs')
    .select('admin_id, tenant_id, action_type, reason, target_table, target_id, new_value, created_at')
    .eq('action_type', 'inquiry_matched')
    .order('created_at', { ascending: false })
    .limit(1)
  console.log('admin_logs:', JSON.stringify(logs.data))

  // 이미 연결된 문의를 다시 연결하려 하면 거부되어야 한다
  const dup = await svc.rpc('match_inquiry_to_tenant', {
    p_inquiry_id: row.id,
    p_tenant_id: (after.data as { matched_tenant_id: string }).matched_tenant_id,
    p_admin_id: 'c56d6000-e4b0-4d6e-b8af-cbb65c9969f7',
  })
  console.log('중복 연결 시도 결과:', JSON.stringify(dup.data ?? dup.error?.message))

  // ── 8) 목록 재확인 (매칭됨 필터) ──
  await p.goto(`${BASE}/admin/inquiries?view=matched`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(5000)
  await p.screenshot({ path: resolve(OUT, '08-list-matched.png'), fullPage: true })

  await b.close()
  console.log('\n스크린샷:', OUT)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
