'use client'

import { useState, useTransition } from 'react'
import {
  createIngredientForTenant,
  getIngredientsOfTenant,
  type ProxyTenantOption,
  type ProxyIngredientRow,
} from '@/actions/admin/ingredient-proxy'
import s from '@/app/(admin)/admin-shared.module.css'

const UNITS = ['kg', 'g', 'L', 'ml', '개', '박스', '봉지', '팩'] as const

function fmtWon(n: number | null) {
  if (n == null) return '-'
  return `${n.toLocaleString('ko-KR')}원`
}

function fmtDate(iso: string | null) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}.`
}

export default function IngredientProxyClient({ tenants }: { tenants: ProxyTenantOption[] }) {
  const [tenantId, setTenantId] = useState('')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<string>('kg')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('')
  const [memo, setMemo] = useState('')

  const [items, setItems] = useState<ProxyIngredientRow[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const selected = tenants.find(t => t.id === tenantId) ?? null

  async function loadItems(id: string) {
    if (!id) { setItems([]); return }
    setLoadingList(true)
    const res = await getIngredientsOfTenant(id)
    setLoadingList(false)
    if (!res.success) { setError(res.error ?? '목록 조회 실패'); setItems([]); return }
    setItems(res.data?.items ?? [])
  }

  function onPickTenant(id: string) {
    setTenantId(id)
    setError(null)
    setNotice(null)
    void loadItems(id)
  }

  function onSubmit() {
    setError(null); setNotice(null)
    if (!tenantId) { setError('거래처를 선택해주세요.'); return }
    if (!name.trim()) { setError('품명을 입력해주세요.'); return }

    startTransition(async () => {
      const res = await createIngredientForTenant({
        target_tenant_id: tenantId,
        name: name.trim(),
        unit,
        current_price: price.trim() === '' ? null : Number(price.replace(/[^0-9]/g, '')),
        category: category.trim() || null,
        memo: memo.trim() || null,
      })
      if (!res.success) { setError(res.error ?? '등록 실패'); return }
      setNotice(`${selected?.name ?? '거래처'} 에 「${name.trim()}」 등록 완료`)
      setName(''); setPrice(''); setCategory(''); setMemo('')
      void loadItems(tenantId)
    })
  }

  return (
    <>
      <div className={s.headerBetween}>
        <div>
          <h1 className={s.title}>거래처 식자재 대신 등록</h1>
          <p className={s.subtitle}>
            식당 사장님을 대신해 식자재를 등록합니다. 관리자 본인 계정으로 진행되며,
            등록된 항목은 사장님 화면에 「관리자 대신 등록」으로 표시됩니다.
          </p>
        </div>
      </div>

      {error && <div className={s.alert} style={{ color: 'var(--ds-text-danger, #b91c1c)' }}>{error}</div>}
      {notice && <div className={s.alert} style={{ color: 'var(--ds-brand-primary, #128b5b)' }}>{notice}</div>}

      <section className={s.panel}>
        <div className={s.panelHeader}><span className={s.panelTitle}>1. 거래처 선택</span></div>
        <div className={s.panelBody}>
          {tenants.length === 0 ? (
            <p className={s.empty}>등록 가능한 식당 계정이 없습니다.</p>
          ) : (
            <>
              <select
                className={s.input}
                value={tenantId}
                onChange={e => onPickTenant(e.target.value)}
                disabled={pending}
                aria-label="거래처 선택"
                style={{ maxWidth: 520 }}
              >
                <option value="">거래처를 선택하세요</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name ?? '(이름없음)'}
                    {t.representative_name ? ` · ${t.representative_name}` : ''}
                    {` — 식자재 ${t.ingredient_count}개`}
                  </option>
                ))}
              </select>
              {selected && (
                <p className={s.inlineMuted} style={{ marginTop: 8 }}>
                  {selected.contact_phone ?? '연락처 없음'} · 현재 식자재 {selected.ingredient_count}개
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <section className={s.panel}>
        <div className={s.panelHeader}><span className={s.panelTitle}>2. 식자재 입력</span></div>
        <div className={s.panelBody}>
          <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
            <label>
              <span className={s.policyLabel}>품명 (브랜드 포함해서 적으세요)</span>
              <input
                className={s.input}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="예: 청정원 카놀라유 18L"
                disabled={pending || !tenantId}
              />
            </label>

            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ flex: 1 }}>
                <span className={s.policyLabel}>받는 가격 (원)</span>
                <input
                  className={s.input}
                  value={price}
                  inputMode="numeric"
                  onChange={e => setPrice(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="예: 38000"
                  disabled={pending || !tenantId}
                />
              </label>
              <label style={{ width: 130 }}>
                <span className={s.policyLabel}>단위</span>
                <select
                  className={s.input}
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                  disabled={pending || !tenantId}
                  aria-label="단위"
                >
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
            </div>

            <label>
              <span className={s.policyLabel}>카테고리 (선택)</span>
              <input
                className={s.input}
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="예: 채소, 육류"
                disabled={pending || !tenantId}
              />
            </label>

            <label>
              <span className={s.policyLabel}>메모 (선택)</span>
              <input
                className={s.input}
                value={memo}
                onChange={e => setMemo(e.target.value)}
                placeholder="예: 전화로 받은 단가"
                disabled={pending || !tenantId}
              />
            </label>

            <div className={s.actionsRow}>
              <button
                type="button"
                className={s.primaryBtnMd}
                onClick={onSubmit}
                disabled={pending || !tenantId || !name.trim()}
              >
                {pending ? '등록 중…' : '대신 등록'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <span className={s.panelTitle}>
            3. 이 거래처의 식자재 {tenantId ? `(${items.length}개)` : ''}
          </span>
        </div>
        <div className={s.panelBody}>
          {!tenantId ? (
            <p className={s.empty}>거래처를 먼저 선택하세요.</p>
          ) : loadingList ? (
            <p className={s.loadingHint}>불러오는 중…</p>
          ) : items.length === 0 ? (
            <p className={s.empty}>아직 등록된 식자재가 없습니다.</p>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr className={s.theadRow}>
                    <th className={s.th}>품명</th>
                    <th className={s.thSm}>가격</th>
                    <th className={s.thSm}>단위</th>
                    <th className={s.thSm}>등록</th>
                    <th className={s.thSm}>등록일</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.id}>
                      <td className={s.td}>{it.name}</td>
                      <td className={s.tdSm}>{fmtWon(it.current_price)}</td>
                      <td className={s.tdSm}>{it.unit ?? '-'}</td>
                      <td className={s.tdSm}>
                        {it.created_by_admin_id
                          ? <span className={s.badgeToday}>관리자 대신</span>
                          : <span className={s.cellMutedXs}>사장님 직접</span>}
                      </td>
                      <td className={s.tdSm}>{fmtDate(it.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
