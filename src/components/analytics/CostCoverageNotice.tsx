import type { CostCoverage } from '@/lib/analytics-calc'

/**
 * 원가가 비어 있던(0/1원) 주문 라인이 얼마나 섞였는지 알린다.
 *
 * order_lines.cost_price 는 주문 시점 스냅샷이라, 지금 상품 매입가를 채워도 과거 주문은
 * 그대로다 (RULE-03). 그래서 원가·순이익·마진율은 원가 확정 라인만으로 계산하고,
 * 총매출은 전부 센다 — 매출 숫자가 원장·정산과 어긋나면 안 되기 때문이다.
 * 이 배너는 두 지표의 모집단이 다르다는 사실을 화면에 남긴다.
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
        원가 미확정 {coverage.unconfirmed_line_count}건은 원가·순이익·마진율 계산에서 제외했습니다
      </strong>
      <div style={{ marginTop: 4, color: '#78350f' }}>
        이 기간 주문 {coverage.line_count}건 중 {coverage.unconfirmed_line_count}건은 매입가가 없는
        상태로 팔려 원가가 0원으로 남아 있습니다 (해당 매출 {amount}원 · 전체의{' '}
        {share.toFixed(1)}%). <strong>총매출에는 그대로 포함</strong>되어 원장·정산과 같은 값이고,
        원가 기반 지표만 확정분 기준입니다. 상품관리에서 매입가를 채우면{' '}
        <em>그 뒤 주문부터</em> 집계에 들어옵니다 — 이미 확정된 주문의 원가 스냅샷은 바뀌지 않습니다.
        {coverage.test_line_count > 0 ? (
          <>
            {' '}
            (별도로 [TEST] 라인 {coverage.test_line_count}건은 미확정 집계에서 제외했습니다)
          </>
        ) : null}
      </div>
    </div>
  )
}
