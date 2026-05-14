'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import {
  createPricingPolicyAdmin,
  listPricingPoliciesAdmin,
  setPricingPolicyStatusAdmin,
  type AdminPricingPolicyListRow,
  type PricingFormListingRow,
  type PricingFormOptionRow,
} from '@/actions/admin/pricing-policies'
import s from '@/app/(admin)/admin-shared.module.css'

type Props = {
  initialRows: AdminPricingPolicyListRow[]
  restaurants: PricingFormOptionRow[]
  listings: PricingFormListingRow[]
}

function formatTs(v: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function CommercePricingPoliciesClient(props: Props) {
  const [rows, setRows] = useState<AdminPricingPolicyListRow[]>(props.initialRows)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const refresh = useCallback(() => {
    start(async () => {
      const res = await listPricingPoliciesAdmin()
      if (!res.success || !res.data) {
        setErr(res.error ?? '목록 갱신 실패')
        return
      }
      setRows(res.data.rows)
    })
  }, [])

  const listingOptions = useMemo(
    () =>
      [{ id: '', label: '(선택 없음)' } as PricingFormListingRow].concat(
        props.listings.length ? props.listings : [],
      ),
    [props.listings],
  )

  const restaurantOptions = useMemo(
    () =>
      [{ id: '', name: '(선택 없음)' } as PricingFormOptionRow].concat(
        props.restaurants.length ? props.restaurants : [],
      ),
    [props.restaurants],
  )

  async function onCreate(formData: FormData) {
    setErr(null)
    setMsg(null)
    const name = String(formData.get('name') ?? '').trim()
    const policy_type = String(formData.get('policy_type') ?? 'percent_discount') as
      | 'fixed_price'
      | 'amount_discount'
      | 'percent_discount'
    const discount_value = Number(formData.get('discount_value'))
    const priority = Number(formData.get('priority'))
    const starts_at_raw = String(formData.get('starts_at') ?? '').trim()
    const ends_at_raw = String(formData.get('ends_at') ?? '').trim()
    const listing_id = String(formData.get('listing_id') ?? '').trim() || null
    const restaurant_tenant_id = String(formData.get('restaurant_tenant_id') ?? '').trim() || null
    const applies_to_all = formData.get('applies_to_all') === 'on'

    const starts_at =
      starts_at_raw && !Number.isNaN(Date.parse(starts_at_raw)) ? new Date(starts_at_raw).toISOString() : null
    const ends_at = ends_at_raw && !Number.isNaN(Date.parse(ends_at_raw)) ? new Date(ends_at_raw).toISOString() : null

    if (!name) {
      setErr('이름을 입력해 주세요')
      return
    }
    if (!Number.isFinite(discount_value)) {
      setErr('할인/가격 값이 올바르지 않습니다')
      return
    }
    if (!Number.isFinite(priority)) {
      setErr('우선순위가 올바르지 않습니다')
      return
    }

    const res = await createPricingPolicyAdmin({
      name,
      policy_type,
      discount_value,
      priority: Math.round(priority),
      starts_at,
      ends_at,
      listing_id,
      restaurant_tenant_id,
      applies_to_all,
    })
    if (!res.success) {
      setErr(res.error ?? '등록 실패')
      return
    }
    setMsg('정책을 등록했습니다.')
    refresh()
  }

  async function onStatus(id: string, status: 'active' | 'inactive') {
    setErr(null)
    setMsg(null)
    const res = await setPricingPolicyStatusAdmin(id, status)
    if (!res.success) {
      setErr(res.error ?? '상태 변경 실패')
      return
    }
    setMsg(status === 'active' ? '활성화했습니다.' : '비활성화했습니다.')
    refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {err ? (
        <p className={s.subtitle} style={{ color: 'var(--ds-text-danger, #b91c1c)' }}>
          {err}
        </p>
      ) : null}
      {msg && !err ? <p className={s.subtitle}>{msg}</p> : null}

      <section className={s.kpiCard}>
        <h2 className={s.title} style={{ fontSize: 16 }}>
          정책 등록
        </h2>
        <p className={s.subtitle}>P0: 단일 타깃 행만 생성합니다. 전역은 「전체 적용」을 사용합니다.</p>
        <form action={onCreate} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className={s.subtitle} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            이름
            <input name="name" className={s.input} required maxLength={200} disabled={pending} />
          </label>
          <div className={s.grid2}>
            <label className={s.subtitle} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              유형
              <select name="policy_type" className={s.input} disabled={pending}>
                <option value="percent_discount">퍼센트 할인</option>
                <option value="amount_discount">금액 할인</option>
                <option value="fixed_price">고정 판매가</option>
              </select>
            </label>
            <label className={s.subtitle} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              우선순위 (클수록 우선)
              <input name="priority" type="number" className={s.input} defaultValue={0} disabled={pending} />
            </label>
          </div>
          <label className={s.subtitle} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            값 (퍼센트 / 원 단위 할인 / 고정가)
            <input name="discount_value" type="number" step="0.01" className={s.input} defaultValue={0} required disabled={pending} />
          </label>
          <div className={s.grid2}>
            <label className={s.subtitle} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              시작 (선택)
              <input name="starts_at" type="datetime-local" className={s.input} disabled={pending} />
            </label>
            <label className={s.subtitle} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              종료 (선택)
              <input name="ends_at" type="datetime-local" className={s.input} disabled={pending} />
            </label>
          </div>
          <label className={s.subtitle} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            리스팅
            <select name="listing_id" className={s.input} defaultValue="" disabled={pending}>
              {listingOptions.map((o) => (
                <option key={o.id || 'none'} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className={s.subtitle} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            식당 테넌트
            <select name="restaurant_tenant_id" className={s.input} defaultValue="" disabled={pending}>
              {restaurantOptions.map((o) => (
                <option key={o.id || 'none'} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className={s.subtitle} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input name="applies_to_all" type="checkbox" disabled={pending} /> 전체 적용 (전역)
          </label>
          <button type="submit" className={s.primaryBtnMd} disabled={pending}>
            등록
          </button>
        </form>
      </section>

      <section className={s.kpiCard}>
        <h2 className={s.title} style={{ fontSize: 16 }}>
          정책 목록
        </h2>
        <div className={s.tableWrap} style={{ marginTop: 12 }}>
          <table className={s.table}>
            <thead>
              <tr className={s.theadRow}>
                <th className={s.th}>이름</th>
                <th className={s.th}>유형</th>
                <th className={s.th}>값</th>
                <th className={s.th}>우선순위</th>
                <th className={s.th}>상태</th>
                <th className={s.th}>기간</th>
                <th className={s.th}>적용 범위</th>
                <th className={s.th} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className={s.tdWide} colSpan={8}>
                    등록된 정책이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className={s.td}>{r.name}</td>
                    <td className={s.tdNowrap}>{r.policy_type}</td>
                    <td className={s.tdNowrap}>{r.discount_value}</td>
                    <td className={s.tdNowrap}>{r.priority}</td>
                    <td className={s.tdNowrap}>{r.status}</td>
                    <td className={s.td}>
                      {formatTs(r.starts_at)} ~ {formatTs(r.ends_at)}
                    </td>
                    <td className={s.tdWide}>{r.targets_summary}</td>
                    <td className={s.tdNowrap}>
                      <div className={s.actionsRow}>
                        {r.status !== 'active' ? (
                          <button type="button" className={s.primaryBtnSm} disabled={pending} onClick={() => onStatus(r.id, 'active')}>
                            활성화
                          </button>
                        ) : null}
                        {r.status === 'active' ? (
                          <button type="button" className={s.ghostBtn} disabled={pending} onClick={() => onStatus(r.id, 'inactive')}>
                            비활성화
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
