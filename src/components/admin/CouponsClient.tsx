'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCoupon, deleteCoupon, type CouponRow } from '@/actions/admin/coupons'
import { COUPON_PLAN_OPTIONS, couponPlanLabel, type CouponPlan } from '@/types/coupon'

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ko-KR')
}

export default function CouponsClient({
  coupons,
  loadError,
}: {
  coupons: CouponRow[]
  loadError?: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [plan, setPlan] = useState<CouponPlan>('any')
  const [freeMonths, setFreeMonths] = useState(2)
  const [maxUses, setMaxUses] = useState(1)
  const [expiresAt, setExpiresAt] = useState('')
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)

  function handleCreate() {
    setError(null)
    setCreatedCode(null)
    setCopyHint(null)
    start(async () => {
      const res = await createCoupon({
        plan,
        free_months: freeMonths,
        max_uses: maxUses,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      })
      if (!res.success || !res.data) {
        setError(res.error ?? '쿠폰 생성 실패')
        return
      }
      setCreatedCode(res.data.code)
      setShowForm(false)
      router.refresh()
    })
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopyHint('복사됐습니다')
    } catch {
      setCopyHint('복사에 실패했습니다')
    }
  }

  function handleDelete(id: string) {
    if (!confirm('이 쿠폰을 삭제할까요?')) return
    setError(null)
    start(async () => {
      const res = await deleteCoupon(id)
      if (!res.success) {
        setError(res.error ?? '삭제 실패')
        return
      }
      router.refresh()
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>쿠폰 관리</h1>
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v)
            setError(null)
            setCreatedCode(null)
          }}
          style={{
            padding: '10px 18px',
            background: '#1f5d3a',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {showForm ? '닫기' : '쿠폰 생성'}
        </button>
      </div>

      {loadError && (
        <p style={{ color: '#b91c1c', fontSize: 14, marginBottom: 16 }}>{loadError}</p>
      )}
      {error && (
        <p style={{ color: '#b91c1c', fontSize: 14, marginBottom: 16 }}>{error}</p>
      )}

      {createdCode && (
        <div
          style={{
            marginBottom: 20,
            padding: 20,
            background: '#f0f7f3',
            border: '1px solid #bbf7d0',
            borderRadius: 12,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1f5d3a', margin: '0 0 8px' }}>쿠폰이 생성됐습니다</p>
          <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: '.12em', margin: '0 0 12px', fontFamily: 'monospace' }}>
            {createdCode}
          </p>
          <button
            type="button"
            onClick={() => copyCode(createdCode)}
            style={{
              padding: '8px 14px',
              background: '#fff',
              border: '1px solid #1f5d3a',
              borderRadius: 8,
              color: '#1f5d3a',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            코드 복사
          </button>
          {copyHint && <p style={{ fontSize: 12, color: '#6b7280', margin: '8px 0 0' }}>{copyHint}</p>}
        </div>
      )}

      {showForm && (
        <div
          style={{
            marginBottom: 24,
            padding: 20,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>플랜</span>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as CouponPlan)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}
              >
                {COUPON_PLAN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>무료 기간 (개월)</span>
              <input
                type="number"
                min={1}
                max={6}
                value={freeMonths}
                onChange={(e) => setFreeMonths(Number(e.target.value))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>최대 사용 횟수</span>
              <input
                type="number"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(Number(e.target.value))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>만료일 (선택)</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={handleCreate}
            style={{
              marginTop: 16,
              padding: '10px 18px',
              background: pending ? '#9ca3af' : '#1f5d3a',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: pending ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {pending ? '생성 중...' : '생성하기'}
          </button>
        </div>
      )}

      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['코드', '플랜', '무료기간', '사용/최대', '만료일', ''].map((h) => (
                <th
                  key={h || 'actions'}
                  style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 700, color: '#374151' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coupons.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                  등록된 쿠폰이 없습니다
                </td>
              </tr>
            ) : (
              coupons.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700 }}>
                    {c.code}
                  </td>
                  <td style={{ padding: '12px 14px' }}>{couponPlanLabel(c.plan)}</td>
                  <td style={{ padding: '12px 14px' }}>{c.free_months}개월</td>
                  <td style={{ padding: '12px 14px' }}>
                    {c.used_count ?? 0} / {c.max_uses ?? '∞'}
                  </td>
                  <td style={{ padding: '12px 14px' }}>{formatDate(c.expires_at)}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleDelete(c.id)}
                      style={{
                        padding: '6px 12px',
                        background: '#fef2f2',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        borderRadius: 6,
                        fontSize: 13,
                        cursor: pending ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
