/**
 * 식당OS 발주 확정(RPC) 이후 공급자 테넌트 알림 INSERT.
 * buyer 세션(supabase)으로 호출 — notifications RLS가 타 테넌트 insert를 막으면 DB 정책 조정 필요.
 */

export type InsertNotificationInput = {
  tenant_id: string
  type: string
  title: string
  message: string
  action_link?: string | null
  priority?: 'urgent' | 'important' | 'normal'
}

export async function insertNotificationRow(
  supabase: { from: (t: string) => any },
  input: InsertNotificationInput,
) {
  return supabase.from('notifications').insert({
    tenant_id: input.tenant_id,
    type: input.type,
    title: input.title,
    message: input.message,
    action_link: input.action_link ?? '/rfq',
    priority: input.priority ?? 'important',
  })
}

/** 단일 입찰 결과 알림 (내부·테스트용). */
export async function notifyBidResult(
  supabase: { from: (t: string) => any },
  bid_id: string,
  result: 'accepted' | 'rejected',
) {
  const { data: bid, error: bErr } = await supabase
    .from('rfq_bids')
    .select('id, supplier_tenant_id, rfq_id')
    .eq('id', bid_id)
    .maybeSingle()

  if (bErr || !bid?.supplier_tenant_id) return

  const { data: rfq } = await supabase
    .from('rfq_requests')
    .select('product_name')
    .eq('id', bid.rfq_id)
    .maybeSingle()

  const product = rfq?.product_name ?? '발주요청'

  if (result === 'accepted') {
    await insertNotificationRow(supabase, {
      tenant_id: bid.supplier_tenant_id,
      type: 'rfq_bid_accepted',
      title: '입찰 낙찰',
      message: `「${product}」 입찰이 채택되었습니다.`,
      action_link: '/rfq',
      priority: 'urgent',
    })
  } else {
    await insertNotificationRow(supabase, {
      tenant_id: bid.supplier_tenant_id,
      type: 'rfq_bid_rejected',
      title: '입찰 탈락',
      message: `「${product}」 입찰이 채택되지 않았습니다.`,
      action_link: '/rfq',
      priority: 'normal',
    })
  }
}

/**
 * accept_bid_and_create_order_atomic 성공 직후 호출.
 * RPC가 낙찰/탈락 status를 반영한 뒤 실행할 것.
 */
export async function notifyRfqBidOutcomesAfterAccept(
  supabase: { from: (t: string) => any },
  rfq_id: string,
  buyer_tenant_id: string,
) {
  const { data: rfq, error: rErr } = await supabase
    .from('rfq_requests')
    .select('tenant_id, product_name')
    .eq('id', rfq_id)
    .maybeSingle()

  if (rErr || !rfq || rfq.tenant_id !== buyer_tenant_id) return

  const { data: bids, error: bErr } = await supabase
    .from('rfq_bids')
    .select('id, supplier_tenant_id, status')
    .eq('rfq_id', rfq_id)

  if (bErr) return

  const product = rfq.product_name ?? '발주요청'

  for (const b of bids ?? []) {
    if (!b.supplier_tenant_id) continue
    const st = String(b.status)
    if (st === 'accepted') {
      const { error } = await insertNotificationRow(supabase, {
        tenant_id: b.supplier_tenant_id,
        type: 'rfq_bid_accepted',
        title: '입찰 낙찰',
        message: `「${product}」 입찰이 채택되었습니다.`,
        action_link: '/rfq',
        priority: 'urgent',
      })
      if (error) console.error('[notifyRfqBidOutcomesAfterAccept] insert', error)
    } else if (st === 'rejected') {
      const { error } = await insertNotificationRow(supabase, {
        tenant_id: b.supplier_tenant_id,
        type: 'rfq_bid_rejected',
        title: '입찰 탈락',
        message: `「${product}」 입찰이 채택되지 않았습니다.`,
        action_link: '/rfq',
        priority: 'normal',
      })
      if (error) console.error('[notifyRfqBidOutcomesAfterAccept] insert', error)
    }
  }
}
