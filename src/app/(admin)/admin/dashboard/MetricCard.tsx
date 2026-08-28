import Link from 'next/link'
import type { ReactNode } from 'react'
import s from '../../admin-blue.module.css'

/**
 * 지표 카드 — 큰 숫자 + 짧은 라벨 + 기준 안내.
 * `alert`가 true면 파란 톤 대신 경고색으로 칠해 "챙겨야 하는 것"이 한눈에 보이게 한다.
 * href가 있으면 카드 전체가 상세 목록 링크가 된다.
 */
export default function MetricCard({
  label,
  value,
  unit = '곳',
  basis,
  icon,
  href,
  alert = false,
}: {
  label: string
  value: number
  unit?: string
  basis: string
  icon: ReactNode
  href?: string
  alert?: boolean
}) {
  // 0건이면 위험 강조를 끈다 — 볼 게 없는데 빨간 카드가 시선을 끌면 안 된다
  const isAlert = alert && value > 0

  const body = (
    <>
      <div className={s.cardTop}>
        <span className={s.cardLabel}>{label}</span>
        <span className={`${s.cardIcon} ${isAlert ? s.cardIconAlert : ''}`}>{icon}</span>
      </div>
      <div
        className={`${s.cardValue} ${
          isAlert ? s.cardValueAlert : value === 0 ? s.cardValueZero : ''
        }`}
      >
        {value.toLocaleString('ko-KR')}
        <span className={s.cardUnit}>{unit}</span>
      </div>
      <div className={s.cardBasis}>{basis}</div>
    </>
  )

  if (!href) {
    return <div className={`${s.card} ${isAlert ? s.cardAlert : ''}`}>{body}</div>
  }

  return (
    <Link href={href} className={`${s.card} ${isAlert ? s.cardAlert : ''}`}>
      {body}
    </Link>
  )
}
