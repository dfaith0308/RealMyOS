import type { DashboardData } from '@/actions/dashboard'

export function fallbackMessage(ctx: DashboardData['ai_context']): string {
  if (ctx.overdue_count > 0)
    return `사장님, 연체 거래처가 ${ctx.overdue_count}곳입니다. 오늘 ${ctx.top_score_name}에 먼저 연락해보세요.`
  if (ctx.max_days_contact >= 14)
    return `사장님, ${ctx.max_days_contact}일 이상 연락이 없는 거래처가 있습니다. 오늘 미연락 거래처부터 확인하세요.`
  if (ctx.receivable_amount > 0)
    return `사장님, 미수금 ${Math.round(ctx.receivable_amount / 10000)}만원이 있습니다. 오늘 미수금과 자금계획부터 확인하세요.`
  if (ctx.receivable_amount < 0)
    return `사장님, 초과입금 ${Math.round(Math.abs(ctx.receivable_amount) / 10000)}만원이 있습니다. 다음 주문에 자동 차감됩니다.`
  return '사장님, 오늘은 매출 현황과 자금계획을 확인하고 하루를 시작하세요.'
}

