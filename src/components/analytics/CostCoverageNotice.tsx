import type { CostCoverage } from '@/lib/analytics-calc'

/**
 * 원가가 비어 있던(0/1원) 주문 라인이 섞여 있으면 알린다.
 *
 * 숫자 자체는 손대지 않는다. order_lines.cost_price 는 주문 시점 스냅샷이라
 * 지금 상품 매입가를 채워도 과거 주문은 그대로다 (RULE-03). 그래서 "고쳐진 값"이 아니라
 * "얼마나 섞였는지"를 보여주고, 순이익이 어느 방향으로 틀어져 있는지를 못박는다.
 */
export default function CostCoverageNotice({ coverage }: { coverage: CostCoverage }) {
  if (coverage.unconfirmed_line_count === 0) return null

  const share = coverage.unconfirmed_revenue_share
  const amount = coverage.unconfirmed_revenue.toLocaleString('ko-KR')

  return (
    <div
      style={{
        margin: '16px 0 0',
        padding: '12px 14px',
        border: '1px solid #fde68a',
        background: '#fffbeb',
        borderRadius: 10,
        fontSize: 13,
        lineHeight: 1.6,
        color: '#92400e',
      }}
    >
      <strong style={{ fontWeight: 700 }}>
        원가 미확정 {coverage.unconfirmed_line_count}건 포함 — 순이익·마진율이 실제보다 높게
        나옵니다
      </strong>
      <div style={{ marginTop: 4, color: '#78350f' }}>
        이 기간 주문 {coverage.line_count}건 중 {coverage.unconfirmed_line_count}건은 매입가가 없는
        상태로 팔려 원가가 0원으로 잡혀 있습니다 (해당 매출 {amount}원 · 전체의{' '}
        {share.toFixed(1)}%). 상품관리에서 매입가를 채우면 <em>그 뒤 주문부터</em> 정확해집니다 —
        이미 확정된 주문의 원가 스냅샷은 바뀌지 않습니다.
      </div>
    </div>
  )
}
