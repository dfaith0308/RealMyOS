'use client'

import { useRouter } from 'next/navigation'
import { Fragment, useState, useTransition } from 'react'
import {
  createPromoCode,
  deletePromoCode,
  type PromoCodeRow,
  type PromoUsageRow,
} from '@/actions/admin/sales-promo'
import { COUPON_PLAN_OPTIONS, couponPlanLabel, type CouponPlan } from '@/types/coupon'
import s from '../../../admin-shared.module.css'
import c from '../sales.module.css'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ko-KR')
}

export default function PromoCodesClient({
  codes,
  usage,
  leads,
}: {
  codes: PromoCodeRow[]
  usage: PromoUsageRow[]
  leads: Array<{ id: string; company_name: string; lead_type: string }>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [freeMonths, setFreeMonths] = useState(1)
  const [unlimited, setUnlimited] = useState(false)
  const [maxUses, setMaxUses] = useState(1)
  const [expiresAt, setExpiresAt] = useState('')
  const [plan, setPlan] = useState<CouponPlan>('any')
  const [leadId, setLeadId] = useState('')
  const [memo, setMemo] = useState('')

  function resetForm() {
    setCode('')
    setFreeMonths(1)
    setUnlimited(false)
    setMaxUses(1)
    setExpiresAt('')
    setPlan('any')
    setLeadId('')
    setMemo('')
  }

  function handleCreate() {
    setError(null)
    setOkMsg(null)
    start(async () => {
      const res = await createPromoCode({
        code,
        free_months: freeMonths,
        max_uses: unlimited ? null : maxUses,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        plan,
        lead_id: leadId || null,
        memo,
      })
      if (!res.success) {
        setError(res.error ?? '코드 생성 실패')
        return
      }
      setOkMsg(`코드 ${res.data?.code} 를 발급했습니다`)
      setShowForm(false)
      resetForm()
      router.refresh()
    })
  }

  function handleDelete(id: string, codeText: string) {
    if (!confirm(`코드 ${codeText} 를 삭제할까요?`)) return
    setError(null)
    setOkMsg(null)
    start(async () => {
      const res = await deletePromoCode(id)
      if (!res.success) {
        setError(res.error ?? '삭제 실패')
        return
      }
      router.refresh()
    })
  }

  /** coupon_id → 사용이력. 행마다 usage 전체를 훑지 않도록 한 번만 묶는다 */
  const usageByCode = new Map<string, PromoUsageRow[]>()
  for (const u of usage) {
    const list = usageByCode.get(u.coupon_id)
    if (list) list.push(u)
    else usageByCode.set(u.coupon_id, [u])
  }

  async function copyCode(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setOkMsg(`${text} 복사됨`)
    } catch {
      setError('복사에 실패했습니다')
    }
  }

  return (
    <>
      <div className={c.filterRow}>
        <button type="button" className={s.primaryBtnSm} onClick={() => setShowForm(true)}>
          + 코드 발급
        </button>
        <span className={c.hint}>총 {codes.length}개</span>
      </div>

      {error && <p className={c.errText}>{error}</p>}
      {okMsg && <p className={c.okText}>{okMsg}</p>}

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr className={s.theadRow}>
              <th className={s.th}>코드</th>
              <th className={s.th}>무료 개월</th>
              <th className={s.th}>적용 플랜</th>
              <th className={s.th}>사용</th>
              <th className={s.th}>만료일</th>
              <th className={s.th}>연결 리드</th>
              <th className={s.th}>상태</th>
              <th className={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 ? (
              <tr>
                <td className={s.td} colSpan={8}>
                  <div className={s.empty}>발급된 코드가 없습니다.</div>
                </td>
              </tr>
            ) : (
              codes.map((row) => {
                const rowUsage = usageByCode.get(row.id) ?? []
                const dead = row.is_expired || row.is_exhausted
                return (
                  <Fragment key={row.id}>
                    <tr className={dead ? c.exhausted : undefined}>
                      <td className={s.td}>
                        <button
                          type="button"
                          className={c.codeCell}
                          onClick={() => copyCode(row.code)}
                          title="클릭하면 복사됩니다"
                          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          {row.code}
                        </button>
                        {row.memo && <div className={s.cellMutedXs}>{row.memo}</div>}
                      </td>
                      <td className={s.tdNowrap}>{row.free_months}개월</td>
                      <td className={s.tdNowrap}>{couponPlanLabel(row.plan)}</td>
                      <td className={s.tdNowrap}>
                        {row.used_count} / {row.max_uses === null ? '무제한' : row.max_uses}
                      </td>
                      <td className={s.tdNowrap}>{formatDate(row.expires_at)}</td>
                      <td className={s.tdSm}>
                        {row.lead_name ? (
                          <a href={`/admin/sales/leads/${row.lead_id}`} className={c.rowLink}>
                            {row.lead_name}
                          </a>
                        ) : (
                          <span className={s.mutedDash}>—</span>
                        )}
                      </td>
                      <td className={s.tdNowrap}>
                        {row.is_expired ? (
                          <span className={c.statusBadge} style={{ background: '#6b7280' }}>
                            만료
                          </span>
                        ) : row.is_exhausted ? (
                          <span className={c.statusBadge} style={{ background: '#d97706' }}>
                            소진
                          </span>
                        ) : (
                          <span className={c.statusBadge} style={{ background: '#16a34a' }}>
                            사용가능
                          </span>
                        )}
                      </td>
                      <td className={s.tdNowrap}>
                        {rowUsage.length > 0 && (
                          <button
                            type="button"
                            className={c.linkBtn}
                            onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                          >
                            {expanded === row.id ? '접기' : `사용 ${rowUsage.length}건`}
                          </button>
                        )}{' '}
                        {rowUsage.length === 0 && (
                          <button
                            type="button"
                            className={c.linkBtn}
                            onClick={() => handleDelete(row.id, row.code)}
                            disabled={pending}
                          >
                            삭제
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded === row.id &&
                      rowUsage.map((u) => (
                        <tr key={`${row.id}-${u.tenant_id}-${u.used_at}`}>
                          <td className={s.tdSm} colSpan={8}>
                            <span className={s.cellMutedSm}>
                              ↳ {u.tenant_name ?? u.tenant_id} · 사용{' '}
                              {new Date(u.used_at).toLocaleString('ko-KR')} · 구독 만료{' '}
                              {formatDate(u.plan_expires_at)}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className={c.overlay} onClick={() => !pending && setShowForm(false)}>
          <div className={c.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={c.modalTitle}>프로모션 코드 발급</h2>

            <label className={c.formLabel}>코드 * (직접 입력)</label>
            <input
              className={c.formInput}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="예: SIKSIKI-OPEN"
            />
            <p className={c.hint}>영문/숫자/.-_ 4~32자. 대소문자 구분 없이 중복이 차단됩니다.</p>

            <label className={c.formLabel}>무료 개월수 *</label>
            <input
              className={c.formInput}
              type="number"
              min={1}
              max={24}
              value={freeMonths}
              onChange={(e) => setFreeMonths(Number(e.target.value))}
            />

            <label className={c.formLabel}>사용 가능 횟수</label>
            <label className={c.checkItem} style={{ marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={unlimited}
                onChange={(e) => setUnlimited(e.target.checked)}
              />
              무제한
            </label>
            {!unlimited && (
              <input
                className={c.formInput}
                type="number"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(Number(e.target.value))}
              />
            )}

            <label className={c.formLabel}>만료일 (선택)</label>
            <input
              className={c.formInput}
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />

            <label className={c.formLabel}>적용 플랜</label>
            <select
              className={c.formInput}
              value={plan}
              onChange={(e) => setPlan(e.target.value as CouponPlan)}
            >
              {COUPON_PLAN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <label className={c.formLabel}>연결 리드 (선택)</label>
            <select className={c.formInput} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
              <option value="">연결 안 함</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  [{l.lead_type === 'supplier' ? '공급자' : '식당'}] {l.company_name}
                </option>
              ))}
            </select>

            <label className={c.formLabel}>메모 (선택)</label>
            <input
              className={c.formInput}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 9월 오픈 프로모션"
            />

            {error && <p className={c.errText}>{error}</p>}

            <div className={c.modalActions}>
              <button
                type="button"
                className={c.actionBtn}
                onClick={() => setShowForm(false)}
                disabled={pending}
              >
                취소
              </button>
              <button
                type="button"
                className={`${c.actionBtn} ${c.actionBtnPrimary}`}
                onClick={handleCreate}
                disabled={pending}
              >
                {pending ? '발급 중…' : '발급'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
