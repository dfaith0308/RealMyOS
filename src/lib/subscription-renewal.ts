/**
 * 구독 자동 재청구 — 핵심 로직
 *
 * 라우트(/api/cron/billing-renewal)는 인증만 하고 전부 여기로 넘긴다.
 * 스크립트에서 dry-run 으로 직접 호출해 검증할 수 있게 라우트와 분리했다.
 *
 * 안전장치 (요구사항 대응)
 *  - 하루 이중청구 금지: 결제 호출 전에 subscription_billing_attempts 에 pending 행을
 *    먼저 INSERT 한다. (tenant_id, attempt_date) UNIQUE 라서 두 번째 실행은 23505 로
 *    튕기고 그 테넌트를 건너뛴다. 크론 중복 실행·수동 호출 겹침 모두 여기서 막힌다.
 *  - 무한 재시도 금지: billing_failed_count 가 MAX_RETRY 에 도달하면 billing_status='failed'
 *    로 굳히고, 조회 단계에서 failed 를 아예 제외한다.
 *  - N+1 금지: 대상 테넌트와 쿠폰 무료기간을 각각 1번의 질의로 가져온다. 테넌트별 반복은
 *    토스 결제 호출(외부 API)뿐이고, 그마저 CONCURRENCY 만큼 묶어 돌린다.
 *  - 예외 격리: 테넌트 하나가 어떻게 터지든 try/catch 로 가두고 나머지를 계속 처리한다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** 실패해도 이 횟수까지만 재시도한다. 도달하면 billing_status='failed' 로 굳히고 자동 청구를 멈춘다. */
export const MAX_RETRY = 3

/** 토스 결제 호출 동시 실행 수. 외부 API 이므로 과하게 벌리지 않는다. */
const CONCURRENCY = 4

/** /api/toss/billing 의 PLAN_AMOUNTS 와 같은 값이어야 한다. */
export const PLAN_AMOUNTS: Record<string, number> = {
  monthly: 99000,
  annual: 948000,
}

/** 플랜별 갱신 주기(개월) */
const PLAN_MONTHS: Record<string, number> = {
  monthly: 1,
  annual: 12,
}

export const PLATFORM_OWNER_TENANT = '00000000-0000-0000-0000-000000000000'

const TOSS_BILLING_URL = 'https://api.tosspayments.com/v1/billing'

export type RenewalOutcome = 'success' | 'failed' | 'skipped'

export type RenewalResult = {
  tenant_id: string
  tenant_name: string | null
  outcome: RenewalOutcome
  plan?: string
  amount?: number
  /** skipped 사유 또는 실패 사유 */
  reason?: string
  error_code?: string
  prev_expires_at?: string | null
  next_expires_at?: string | null
  attempt_no?: number
  /** 이번 실패로 billing_status='failed' 가 되었는지 (= 재시도 소진) */
  exhausted?: boolean
}

export type RenewalSummary = {
  ran_at: string
  attempt_date: string
  dry_run: boolean
  candidates: number
  success: number
  failed: number
  skipped: number
  exhausted: number
  charged_amount: number
  results: RenewalResult[]
}

type TenantRow = {
  id: string
  name: string | null
  subscription_plan: string | null
  plan_expires_at: string | null
  billing_key: string | null
  toss_customer_key: string | null
  billing_status: string | null
  billing_failed_count: number | null
}

/** KST 기준 오늘 날짜(YYYY-MM-DD). 크론이 09:00 KST 에 도는 하루의 기준. */
export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * n개월 뒤 — 월말을 넘치지 않게 자른다.
 *
 * Date.setMonth 는 1/31 에 1개월을 더하면 2/31 → 3/3 으로 넘겨버린다. 그대로 두면
 * 말일 구독자가 한 달을 통째로 건너뛰고 결제일이 계속 뒤로 밀린다. 해당 월의 말일로 자른다.
 * (예: 1/31 +1개월 = 2/28, 5/31 +1개월 = 6/30)
 *
 * 한국은 서머타임이 없어 KST = UTC+9 고정이므로, UTC 로 계산해도 KST 기준 시:분이 보존된다.
 */
function addMonths(d: Date, months: number): Date {
  const day = d.getUTCDate()
  const r = new Date(d)
  r.setUTCDate(1) // 말일 넘침을 막기 위해 먼저 1일로 내린다
  r.setUTCMonth(r.getUTCMonth() + months)
  const lastDayOfTarget = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()
  r.setUTCDate(Math.min(day, lastDayOfTarget))
  return r
}

/**
 * 다음 만료일.
 *
 * 기준은 항상 기존 만료일이다 — 구독 주기(예: 매월 7일)를 유지하기 위해서다.
 * now 를 기준으로 잡으면 크론이 만료 다음 날 09:00 에 도는 만큼 결제일이 매달 뒤로 밀린다.
 *
 * 다만 만료일이 여러 주기 전이면(장기 미납·수동 조정) 한 번 더해도 여전히 과거일 수 있다.
 * 그 경우 미래가 될 때까지 주기를 민다. 그러지 않으면 연장하고도 만료 상태라 다음 날 또
 * 청구되는 루프에 빠진다.
 */
export function nextExpiresAt(plan: string, prevExpiresAt: string | null, now: Date = new Date()): string {
  const months = PLAN_MONTHS[plan] ?? 1
  const prev = prevExpiresAt ? new Date(prevExpiresAt) : null
  const base = prev && !Number.isNaN(prev.getTime()) ? prev : now

  let next = addMonths(base, months)
  // 안전상한: 주기를 미는 횟수를 제한해 어떤 입력에도 무한 루프가 되지 않게 한다.
  for (let i = 0; next.getTime() <= now.getTime() && i < 600; i += 1) {
    next = addMonths(next, months)
  }
  return next.toISOString()
}

/** 동시 실행 수를 제한한 map. 외부 API 를 테넌트 수만큼 한꺼번에 때리지 않기 위한 것. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

async function insertAdminLog(
  supabase: SupabaseClient,
  input: {
    tenant_id?: string | null
    action_type: string
    reason?: string | null
    target_table?: string | null
    target_id?: string | null
    new_value?: unknown
  },
) {
  // 로그 기록 실패가 결제 결과를 뒤집지는 않는다. 삼키되 서버 로그에는 남긴다.
  const { error } = await supabase.from('admin_logs').insert({
    admin_tenant_id: PLATFORM_OWNER_TENANT,
    admin_id: null, // 사람이 아닌 크론이 남긴 기록
    tenant_id: input.tenant_id ?? null,
    action_type: input.action_type,
    reason: input.reason ?? null,
    target_table: input.target_table ?? null,
    target_id: input.target_id ?? null,
    new_value: input.new_value ?? null,
  })
  if (error) console.error('[billing-renewal] admin_logs insert failed', error.message)
}

/**
 * 만료된 구독을 재청구한다.
 *
 * @param opts.dryRun true 면 토스 결제 호출과 tenants 갱신을 하지 않고 대상 조회·판정까지만 한다.
 */
export async function runSubscriptionRenewal(
  supabase: SupabaseClient,
  opts: { dryRun?: boolean; now?: Date; tenantIds?: string[] } = {},
): Promise<RenewalSummary> {
  const dryRun = opts.dryRun ?? false
  const now = opts.now ?? new Date()
  const nowIso = now.toISOString()
  const attemptDate = kstToday(now)

  const summary: RenewalSummary = {
    ran_at: nowIso,
    attempt_date: attemptDate,
    dry_run: dryRun,
    candidates: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    exhausted: 0,
    charged_amount: 0,
    results: [],
  }

  const secretKey = process.env.TOSS_SECRET_KEY
  if (!secretKey && !dryRun) {
    throw new Error('TOSS_SECRET_KEY 미설정 — 재청구를 중단합니다')
  }

  // 1) 대상 조회 — 1회 질의.
  //    만료일이 지났고 / 빌링키가 있고 / 유료 플랜이고 / 재시도가 아직 남은 테넌트.
  let query = supabase
    .from('tenants')
    .select(
      'id, name, subscription_plan, plan_expires_at, billing_key, toss_customer_key, billing_status, billing_failed_count',
    )
    .not('billing_key', 'is', null)
    .not('plan_expires_at', 'is', null)
    .lte('plan_expires_at', nowIso)
    .in('subscription_plan', Object.keys(PLAN_AMOUNTS))
    .neq('billing_status', 'failed') // 재시도 소진 테넌트는 아예 후보에서 뺀다
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('plan_expires_at', { ascending: true })
    .limit(500)

  if (opts.tenantIds?.length) query = query.in('id', opts.tenantIds)

  const { data: tenantRows, error: tenantErr } = await query
  if (tenantErr) throw new Error(`대상 조회 실패: ${tenantErr.message}`)

  const tenants = (tenantRows ?? []) as TenantRow[]
  summary.candidates = tenants.length

  if (tenants.length === 0) {
    await insertAdminLog(supabase, {
      action_type: 'subscription_renewal_run',
      reason: `재청구 대상 없음 (${attemptDate}${dryRun ? ', dry-run' : ''})`,
      target_table: 'subscription_billing_attempts',
      new_value: summary,
    })
    return summary
  }

  // 2) 쿠폰 무료기간 확인 — 1회 질의(N+1 회피).
  //    redeem_coupon 이 plan_expires_at 을 미래로 밀어두므로 1)의 조회로도 대개 걸러지지만,
  //    관리자가 만료일을 손댄 경우까지 막기 위한 명시적 이중 안전장치다.
  const freeUntil = new Map<string, string>()
  {
    const { data: uses, error: useErr } = await supabase
      .from('coupon_uses')
      .select('tenant_id, plan_expires_at')
      .in('tenant_id', tenants.map((t) => t.id))
      .gt('plan_expires_at', nowIso)
    if (useErr) {
      // 쿠폰 조회가 실패했는데 그냥 청구해버리면 무료기간 중인 곳에 돈을 물린다. 중단이 맞다.
      throw new Error(`쿠폰 무료기간 조회 실패 — 안전을 위해 중단합니다: ${useErr.message}`)
    }
    for (const u of uses ?? []) {
      const tid = (u as { tenant_id: string }).tenant_id
      const cur = (u as { plan_expires_at: string }).plan_expires_at
      const prev = freeUntil.get(tid)
      if (!prev || cur > prev) freeUntil.set(tid, cur)
    }
  }

  const encoded = secretKey ? Buffer.from(`${secretKey}:`).toString('base64') : ''

  const results = await mapWithConcurrency(tenants, CONCURRENCY, async (t): Promise<RenewalResult> => {
    const base: RenewalResult = { tenant_id: t.id, tenant_name: t.name, outcome: 'skipped' }
    try {
      const plan = t.subscription_plan ?? ''
      const amount = PLAN_AMOUNTS[plan]
      if (!amount) return { ...base, reason: `청구 금액을 알 수 없는 플랜: ${plan}` }

      // 2-1) 프로모션 무료기간 중이면 제외
      const free = freeUntil.get(t.id)
      if (free) return { ...base, plan, reason: `프로모션 무료기간 중 (${free.slice(0, 10)}까지)` }

      if (!t.toss_customer_key) {
        return { ...base, plan, reason: 'toss_customer_key 없음 — 카드 재등록 필요' }
      }

      const attemptNo = (t.billing_failed_count ?? 0) + 1
      if (attemptNo > MAX_RETRY) {
        // 조회에서 이미 걸렀어야 하지만, 상태가 어긋난 경우를 대비한 최후 방어선.
        return { ...base, plan, reason: `재시도 한도 초과 (${MAX_RETRY}회)` }
      }

      if (dryRun) {
        return {
          ...base,
          outcome: 'skipped',
          plan,
          amount,
          attempt_no: attemptNo,
          reason: 'dry-run — 실제 청구하지 않음',
          prev_expires_at: t.plan_expires_at,
          next_expires_at: nextExpiresAt(plan, t.plan_expires_at, now),
        }
      }

      // 2-2) 자리 선점(claim). 여기서 튕기면 오늘 이미 시도한 테넌트다.
      const orderId = crypto.randomUUID()
      const { data: attempt, error: claimErr } = await supabase
        .from('subscription_billing_attempts')
        .insert({
          tenant_id: t.id,
          attempt_date: attemptDate,
          attempt_no: attemptNo,
          plan,
          amount,
          status: 'pending',
          order_id: orderId,
          prev_expires_at: t.plan_expires_at,
        })
        .select('id')
        .single()

      if (claimErr) {
        if (claimErr.code === '23505') {
          return { ...base, plan, reason: `오늘(${attemptDate}) 이미 시도함 — 중복청구 방지로 건너뜀` }
        }
        return { ...base, plan, reason: `시도 기록 실패로 건너뜀: ${claimErr.message}` }
      }
      const attemptId = (attempt as { id: string }).id

      // 2-3) 토스 자동결제 승인 — 첫 결제와 같은 /v1/billing/{billingKey} 방식.
      //      Idempotency-Key 로 네트워크 재시도 시의 이중승인까지 막는다.
      let payRes: Response
      let payData: { paymentKey?: string; code?: string; message?: string }
      try {
        payRes = await fetch(`${TOSS_BILLING_URL}/${t.billing_key}`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${encoded}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': orderId,
          },
          body: JSON.stringify({
            customerKey: t.toss_customer_key,
            amount,
            orderId,
            orderName: `공급자OS ${plan === 'annual' ? '연간' : '월간'} 구독 자동결제`,
          }),
          signal: AbortSignal.timeout(20000),
        })
        payData = await payRes.json().catch(() => ({}))
      } catch (e) {
        // 네트워크/타임아웃. 승인됐는지 알 수 없으므로 만료일은 건드리지 않고 실패로 기록한다.
        const msg = e instanceof Error ? e.message : String(e)
        await markFailure(supabase, t, attemptId, attemptNo, 'NETWORK_ERROR', msg, now)
        return {
          ...base, outcome: 'failed', plan, amount, attempt_no: attemptNo,
          reason: msg, error_code: 'NETWORK_ERROR',
          exhausted: attemptNo >= MAX_RETRY,
        }
      }

      if (!payRes.ok) {
        const code = payData?.code ?? String(payRes.status)
        const msg = payData?.message ?? '결제 승인 실패'
        await markFailure(supabase, t, attemptId, attemptNo, code, msg, now)
        return {
          ...base, outcome: 'failed', plan, amount, attempt_no: attemptNo,
          reason: msg, error_code: code,
          exhausted: attemptNo >= MAX_RETRY,
        }
      }

      // 2-4) 성공 — 만료일 연장
      const next = nextExpiresAt(plan, t.plan_expires_at, now)
      const paymentKey = payData?.paymentKey ?? null

      const { error: updErr } = await supabase
        .from('tenants')
        .update({
          plan_expires_at: next,
          billing_status: 'active',
          billing_failed_count: 0,
          billing_last_attempt_at: nowIso,
          billing_last_error: null,
        })
        .eq('id', t.id)

      if (updErr) {
        // 돈은 빠져나갔는데 만료일이 안 늘어난 상태. 사람이 봐야 하므로 별도 action_type 으로 남긴다.
        console.error('[billing-renewal] 결제 성공 후 tenants 갱신 실패', t.id, updErr.message)
        await insertAdminLog(supabase, {
          tenant_id: t.id,
          action_type: 'subscription_renewal_desync',
          reason: `결제는 성공했으나 만료일 갱신 실패 — 수동 확인 필요: ${updErr.message}`,
          target_table: 'tenants',
          target_id: t.id,
          new_value: { order_id: orderId, payment_key: paymentKey, amount, intended_expires_at: next },
        })
      }

      await supabase
        .from('subscription_billing_attempts')
        .update({
          status: 'success',
          payment_key: paymentKey,
          next_expires_at: next,
          updated_at: nowIso,
        })
        .eq('id', attemptId)

      await insertAdminLog(supabase, {
        tenant_id: t.id,
        action_type: 'subscription_renewal_success',
        reason: `${t.name ?? t.id} · ${plan} ${amount.toLocaleString('ko-KR')}원 재청구 성공 · 만료일 ${(t.plan_expires_at ?? '').slice(0, 10)} → ${next.slice(0, 10)}`,
        target_table: 'subscription_billing_attempts',
        target_id: attemptId,
        new_value: { order_id: orderId, payment_key: paymentKey, amount, plan, next_expires_at: next },
      })

      return {
        ...base, outcome: 'success', plan, amount, attempt_no: attemptNo,
        prev_expires_at: t.plan_expires_at, next_expires_at: next,
      }
    } catch (e) {
      // 한 테넌트의 예외가 전체 크론을 죽이지 않게 가둔다.
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[billing-renewal] 테넌트 처리 중 예외', t.id, msg)
      return { ...base, outcome: 'failed', reason: `처리 중 예외: ${msg}`, error_code: 'UNCAUGHT' }
    }
  })

  for (const r of results) {
    summary.results.push(r)
    if (r.outcome === 'success') {
      summary.success += 1
      summary.charged_amount += r.amount ?? 0
    } else if (r.outcome === 'failed') {
      summary.failed += 1
      if (r.exhausted) summary.exhausted += 1
    } else {
      summary.skipped += 1
    }
  }

  const failLines = results
    .filter((r) => r.outcome === 'failed')
    .map((r) => `${r.tenant_name ?? r.tenant_id}: ${r.error_code ?? '-'} ${r.reason ?? ''}`.trim())

  await insertAdminLog(supabase, {
    action_type: 'subscription_renewal_run',
    reason:
      `${attemptDate}${dryRun ? ' (dry-run)' : ''} 재청구 — 대상 ${summary.candidates} · ` +
      `성공 ${summary.success} · 실패 ${summary.failed} · 제외 ${summary.skipped}` +
      (summary.exhausted ? ` · 재시도소진 ${summary.exhausted}` : '') +
      (failLines.length ? ` | 실패사유: ${failLines.join(' / ')}` : ''),
    target_table: 'subscription_billing_attempts',
    new_value: summary,
  })

  return summary
}

/** 실패 처리 — 시도 이력·테넌트 상태·활동 기록을 한 번에 남긴다. */
async function markFailure(
  supabase: SupabaseClient,
  t: TenantRow,
  attemptId: string,
  attemptNo: number,
  code: string,
  message: string,
  now: Date,
) {
  const exhausted = attemptNo >= MAX_RETRY
  const nowIso = now.toISOString()

  await supabase
    .from('subscription_billing_attempts')
    .update({ status: 'failed', error_code: code, error_message: message, updated_at: nowIso })
    .eq('id', attemptId)

  // 재시도 소진 시 'failed' 로 굳힌다. 조회 단계에서 제외되므로 다음 날부터 청구하지 않는다.
  // 정책상 자동 강등(plan='free')이나 서비스 차단(is_approved=false)은 하지 않는다 — 표시만 한다.
  const { error } = await supabase
    .from('tenants')
    .update({
      billing_status: exhausted ? 'failed' : 'retrying',
      billing_failed_count: attemptNo,
      billing_last_attempt_at: nowIso,
      billing_last_error: `[${code}] ${message}`,
    })
    .eq('id', t.id)
  if (error) console.error('[billing-renewal] 실패 상태 갱신 실패', t.id, error.message)

  await insertAdminLog(supabase, {
    tenant_id: t.id,
    action_type: exhausted ? 'subscription_renewal_exhausted' : 'subscription_renewal_failed',
    reason:
      `${t.name ?? t.id} · ${attemptNo}/${MAX_RETRY}회차 재청구 실패 · [${code}] ${message}` +
      (exhausted ? ' · 재시도 소진, 자동 청구 중단 (수동 처리 필요)' : ''),
    target_table: 'subscription_billing_attempts',
    target_id: attemptId,
    new_value: { attempt_no: attemptNo, code, message, exhausted },
  })
}
