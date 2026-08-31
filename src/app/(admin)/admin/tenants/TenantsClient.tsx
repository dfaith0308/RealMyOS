'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  approveTenant,
  createTenant,
  deleteTenant,
  getTenantAdminList,
  getTenantDetail,
  suspendTenant,
  updateTenant,
  type TenantAdminRow,
} from '@/actions/admin'
import { updateTenantSubscription, type SubscriptionPlan } from '@/actions/admin/subscription'
import s from './tenants.module.css'

type CreateRole = 'supplier' | 'restaurant'
type ModalKind = 'create' | 'edit' | 'delete' | null

function fmtDate(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('ko-KR')
}

function isAdminTenant(row: TenantAdminRow) {
  return row.role === 'admin' || row.id === '00000000-0000-0000-0000-000000000000'
}

function PlanBadge({ plan }: { plan: string | null }) {
  const map: Record<string, { cls: string; label: string }> = {
    free:       { cls: s.planFree,      label: '무료' },
    monthly:    { cls: s.planPro,       label: '월간' },
    earlybird:  { cls: s.planEarlybird, label: '얼리버드' },
    pro:        { cls: s.planPro,       label: '정식' },
    annual:     { cls: s.planAnnual,    label: '연간' },
  }
  const info = map[plan ?? 'free'] ?? map['free']
  return <span className={`${s.plan} ${info.cls}`}>{info.label}</span>
}

export default function TenantsClient({
  initial,
  initialError,
}: {
  initial: TenantAdminRow[]
  initialError: string | null
}) {
  const router = useRouter()
  const [rows, setRows] = useState<TenantAdminRow[]>(initial)
  const [pageError, setPageError] = useState<string | null>(initialError)
  const [modal, setModal] = useState<ModalKind>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPlan, setFilterPlan] = useState('all')

  const [subPlan, setSubPlan] = useState<Record<string, SubscriptionPlan>>({})
  const [subPending, setSubPending] = useState<Record<string, boolean>>({})

  const [createRole, setCreateRole] = useState<CreateRole>('supplier')
  const [createName, setCreateName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createPasswordConfirm, setCreatePasswordConfirm] = useState('')

  const [editTenantId, setEditTenantId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editPasswordConfirm, setEditPasswordConfirm] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<TenantAdminRow | null>(null)

  const counts = useMemo(() => ({
    all: rows.length,
    supplier: rows.filter(r => r.role === 'supplier').length,
    restaurant: rows.filter(r => r.role === 'restaurant').length,
    approved: rows.filter(r => r.is_approved === true).length,
    pending: rows.filter(r => !r.is_approved).length,
  }), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filterRole !== 'all' && r.role !== filterRole) return false
      if (filterStatus === 'approved' && !r.is_approved) return false
      if (filterStatus === 'pending' && r.is_approved) return false
      if (filterPlan !== 'all' && (r.subscription_plan ?? 'free') !== filterPlan) return false
      if (q) {
        const nameMatch = (r.name ?? '').toLowerCase().includes(q)
        const repMatch = (r.representative_name ?? '').toLowerCase().includes(q)
        const phoneMatch = (r.contact_phone ?? '').toLowerCase().includes(q)
        const emailMatch = (r.email ?? '').toLowerCase().includes(q)
        if (!nameMatch && !repMatch && !phoneMatch && !emailMatch) return false
      }
      return true
    })
  }, [rows, search, filterRole, filterStatus, filterPlan])

  function refreshList() {
    setPageError(null)
    startTransition(async () => {
      const res = await getTenantAdminList()
      if (!res.success) { setPageError(res.error ?? '목록 조회 실패'); return }
      setRows(res.data.tenants)
      router.refresh()
    })
  }

  function closeModal() {
    setModal(null); setModalError(null); setDeleteTarget(null); setEditTenantId(null)
    setCreateName(''); setCreateEmail(''); setCreatePassword(''); setCreatePasswordConfirm('')
    setEditName(''); setEditEmail(''); setEditPassword(''); setEditPasswordConfirm('')
  }

  function openCreate(role: CreateRole) { setCreateRole(role); setModal('create'); setModalError(null) }

  function openEdit(row: TenantAdminRow) {
    setModalError(null); setEditTenantId(row.id); setEditName(row.name ?? ''); setEditEmail(row.email ?? '')
    setEditPassword(''); setEditPasswordConfirm(''); setModal('edit')
    startTransition(async () => {
      const res = await getTenantDetail({ tenant_id: row.id })
      if (!res.success || !res.data) { setModalError(res.error ?? '상세 조회 실패'); return }
      setEditName(res.data.name); setEditEmail(res.data.email ?? '')
    })
  }

  function openDelete(row: TenantAdminRow) { setDeleteTarget(row); setModalError(null); setModal('delete') }

  function handleToggleApproval(row: TenantAdminRow) {
    setPageError(null)
    startTransition(async () => {
      const res = row.is_approved ? await suspendTenant(row.id) : await approveTenant(row.id)
      if (!res.success) { setPageError(res.error ?? '상태 변경 실패'); return }
      refreshList()
    })
  }

  function handleCreate() {
    setModalError(null)
    if (!createName.trim()) { setModalError('상호명을 입력해주세요.'); return }
    if (!createEmail.trim()) { setModalError('이메일을 입력해주세요.'); return }
    if (createPassword.length < 8) { setModalError('비밀번호는 8자 이상이어야 합니다.'); return }
    if (createPassword !== createPasswordConfirm) { setModalError('비밀번호가 일치하지 않습니다.'); return }
    startTransition(async () => {
      const res = await createTenant({ email: createEmail.trim(), password: createPassword, name: createName.trim(), role: createRole })
      if (!res.success) { setModalError(res.error ?? '계정 생성 실패'); return }
      closeModal(); refreshList()
    })
  }

  function handleUpdate() {
    if (!editTenantId) return
    setModalError(null)
    if (!editName.trim()) { setModalError('상호명을 입력해주세요.'); return }
    if (editPassword || editPasswordConfirm) {
      if (editPassword.length < 8) { setModalError('비밀번호는 8자 이상이어야 합니다.'); return }
      if (editPassword !== editPasswordConfirm) { setModalError('비밀번호가 일치하지 않습니다.'); return }
    }
    startTransition(async () => {
      const res = await updateTenant({ tenant_id: editTenantId, name: editName.trim(), email: editEmail.trim() || undefined, password: editPassword || undefined })
      if (!res.success) { setModalError(res.error ?? '수정 실패'); return }
      closeModal(); refreshList()
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    setModalError(null)
    startTransition(async () => {
      const res = await deleteTenant({ tenant_id: deleteTarget.id })
      if (!res.success) { setModalError(res.error ?? '삭제 실패'); return }
      closeModal(); refreshList()
    })
  }

  async function handleSubApply(tenantId: string) {
    const plan = subPlan[tenantId] ?? 'free'
    setSubPending(p => ({ ...p, [tenantId]: true }))
    const res = await updateTenantSubscription({ tenant_id: tenantId, plan })
    setSubPending(p => ({ ...p, [tenantId]: false }))
    if (!res.success) { setPageError(res.error ?? '구독 변경 실패'); return }
    refreshList()
  }

  async function handleQuickCoupon(tenantId: string) {
    setSubPending(p => ({ ...p, [tenantId]: true }))
    const expires = new Date(); expires.setMonth(expires.getMonth() + 2)
    const res = await updateTenantSubscription({ tenant_id: tenantId, plan: 'earlybird', custom_expires_at: expires.toISOString() })
    setSubPending(p => ({ ...p, [tenantId]: false }))
    if (!res.success) { setPageError(res.error ?? '쿠폰 적용 실패'); return }
    refreshList()
  }

  return (
    <main className={s.page}>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>회원관리</h1>
          <p className={s.pageSub}>식당 · 공급자 · 구독 플랜을 한 곳에서 관리합니다</p>
        </div>
        <div className={s.headActions}>
          <button type="button" className={s.btnGhost} disabled={pending} onClick={() => openCreate('supplier')}>+ 공급자 추가</button>
          <button type="button" className={s.btnPrimary} disabled={pending} onClick={() => openCreate('restaurant')}>+ 식당 추가</button>
        </div>
      </header>

      <div className={s.kpiRow}>
        <div className={s.kpiCard}><div className={s.kpiNum}>{counts.all}</div><div className={s.kpiLabel}>전체</div></div>
        <div className={s.kpiCard}><div className={s.kpiNum}>{counts.supplier}</div><div className={s.kpiLabel}>공급자</div></div>
        <div className={s.kpiCard}><div className={s.kpiNum}>{counts.restaurant}</div><div className={s.kpiLabel}>식당</div></div>
        <div className={s.kpiCard}><div className={s.kpiNumGreen}>{counts.approved}</div><div className={s.kpiLabel}>승인됨</div></div>
        <div className={s.kpiCard}><div className={s.kpiNumOrange}>{counts.pending}</div><div className={s.kpiLabel}>대기</div></div>
      </div>

      <div className={s.filterBar}>
        <input className={s.searchInput} placeholder="상호명 · 대표자명 · 연락처 검색" value={search} onChange={e => setSearch(e.target.value)} />
        <select className={s.filterSelect} value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="all">역할: 전체</option>
          <option value="restaurant">식당</option>
          <option value="supplier">공급자</option>
        </select>
        <select className={s.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">승인상태: 전체</option>
          <option value="approved">승인됨</option>
          <option value="pending">대기/정지</option>
        </select>
        <select className={s.filterSelect} value={filterPlan} onChange={e => setFilterPlan(e.target.value)}>
          <option value="all">구독플랜: 전체</option>
          <option value="free">무료</option>
          <option value="monthly">월간</option>
          <option value="earlybird">얼리버드</option>
          <option value="pro">정식</option>
          <option value="annual">연간</option>
        </select>
      </div>

      {pageError && <div className={s.pageErr}>{pageError}</div>}

      <div className={s.tableWrap}>
        <div className={s.colHead}>
          <div className={s.colH}>상호명 / 이메일</div>
          <div className={s.colH}>역할</div>
          <div className={s.colH}>대표자 / 연락처</div>
          <div className={s.colH}>구독 플랜</div>
          <div className={s.colH}>승인 상태</div>
          <div className={s.colH}>가입일</div>
          <div className={s.colH} style={{ textAlign: 'right' }}>액션</div>
        </div>

        {filtered.map(row => {
          const approved = row.is_approved === true
          const admin = isAdminTenant(row)
          const currentPlan = (row.subscription_plan ?? 'free') as SubscriptionPlan
          const selectedPlan = subPlan[row.id] ?? currentPlan
          const isPending = subPending[row.id] ?? false

          return (
            <div key={row.id} className={s.row}>
              <div>
                <div className={s.cellName}>{row.name ?? '-'}</div>
                <div className={s.cellEmail}>{row.email ?? '-'}</div>
              </div>

              <div>
                {admin
                  ? <span className={`${s.badge} ${s.badgeAdmin}`}>관리자</span>
                  : row.role === 'restaurant'
                    ? <span className={`${s.badge} ${s.badgeRestaurant}`}>식당</span>
                    : <span className={`${s.badge} ${s.badgeSupplier}`}>공급자</span>
                }
              </div>

              <div>
                <div className={s.cellName} style={{ fontWeight: 400, fontSize: 12 }}>{row.representative_name ?? '-'}</div>
                <div className={s.cellSub}>{row.contact_phone ?? '-'}</div>
              </div>

              <div>
                {admin ? (
                  <span style={{ fontSize: 11, color: 'var(--ds-text-muted)' }}>-</span>
                ) : (
                  <>
                    <PlanBadge plan={currentPlan} />
                    {row.plan_expires_at && (
                      <div className={s.expires}>~{new Date(row.plan_expires_at).toLocaleDateString('ko-KR')}</div>
                    )}
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
                      <select
                        style={{ height: 26, fontSize: 11, borderRadius: 6, border: '1px solid var(--ds-border-default)', padding: '0 6px', fontFamily: 'inherit', background: 'var(--color-bg-card)', color: 'var(--ds-text-primary)' }}
                        value={selectedPlan}
                        onChange={e => setSubPlan(p => ({ ...p, [row.id]: e.target.value as SubscriptionPlan }))}
                        disabled={isPending}
                      >
                        <option value="free">무료</option>
                        <option value="monthly">월간</option>
                        <option value="earlybird">얼리버드</option>
                        <option value="pro">정식</option>
                        <option value="annual">연간</option>
                      </select>
                      <button
                        type="button"
                        style={{ height: 26, padding: '0 8px', fontSize: 11, borderRadius: 6, border: '1px solid var(--ds-border-default)', background: 'var(--color-bg-card)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                        disabled={isPending}
                        onClick={() => handleSubApply(row.id)}
                      >적용</button>
                      <button
                        type="button"
                        style={{ height: 26, padding: '0 8px', fontSize: 11, borderRadius: 6, border: '1px solid #FED7AA', background: '#FFF7ED', color: '#C2410C', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                        disabled={isPending}
                        onClick={() => handleQuickCoupon(row.id)}
                      >2개월 무료</button>
                    </div>
                  </>
                )}
              </div>

              <div>
                {approved
                  ? <span className={s.statusOk}><span className={s.dot} />승인됨</span>
                  : <span className={s.statusWait}><span className={s.dot} />대기/정지</span>
                }
              </div>

              <div className={s.dateCell}>{fmtDate(row.created_at)}</div>

              <div className={s.actions}>
                {admin ? (
                  <span className={s.sysLabel}>시스템 계정</span>
                ) : (
                  <>
                    <button type="button" className={approved ? s.btnSuspend : s.btnApprove} disabled={pending} onClick={() => handleToggleApproval(row)}>
                      {approved ? '정지' : '승인'}
                    </button>
                    <button type="button" className={s.btnSm} disabled={pending} onClick={() => openEdit(row)}>수정</button>
                    <button type="button" className={s.btnDangerSm} disabled={pending} onClick={() => openDelete(row)}>삭제</button>
                  </>
                )}
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && <div className={s.empty}>검색 결과가 없습니다.</div>}
      </div>

      {modal === 'create' && (
        <div className={s.overlay} role="presentation" onClick={closeModal}>
          <div className={s.modal} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h2 className={s.modalTitle}>{createRole === 'supplier' ? '공급자 계정 추가' : '식당 계정 추가'}</h2>
            <div className={s.modalField}><label className={s.modalLabel}>상호명 *</label><input className={s.modalInput} value={createName} onChange={e => setCreateName(e.target.value)} placeholder="상호명 입력" /></div>
            <div className={s.modalField}><label className={s.modalLabel}>이메일 *</label><input className={s.modalInput} type="email" value={createEmail} onChange={e => setCreateEmail(e.target.value)} placeholder="owner@example.com" /></div>
            <div className={s.modalField}><label className={s.modalLabel}>비밀번호 * (8자 이상)</label><input className={s.modalInput} type="password" value={createPassword} onChange={e => setCreatePassword(e.target.value)} placeholder="비밀번호" /></div>
            <div className={s.modalField}><label className={s.modalLabel}>비밀번호 확인 *</label><input className={s.modalInput} type="password" value={createPasswordConfirm} onChange={e => setCreatePasswordConfirm(e.target.value)} placeholder="비밀번호 확인" /></div>
            {modalError && <p className={s.errMsg}>{modalError}</p>}
            <div className={s.modalFoot}>
              <button type="button" className={s.btnGhost} disabled={pending} onClick={closeModal}>취소</button>
              <button type="button" className={s.btnPrimary} disabled={pending} onClick={handleCreate}>{pending ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'edit' && (
        <div className={s.overlay} role="presentation" onClick={closeModal}>
          <div className={s.modal} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h2 className={s.modalTitle}>계정 수정</h2>
            <div className={s.modalField}><label className={s.modalLabel}>상호명</label><input className={s.modalInput} value={editName} onChange={e => setEditName(e.target.value)} placeholder="상호명" /></div>
            <div className={s.modalField}><label className={s.modalLabel}>이메일</label><input className={s.modalInput} type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="owner@example.com" /></div>
            <div className={s.modalField}><label className={s.modalLabel}>새 비밀번호 (선택)</label><input className={s.modalInput} type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="변경 시에만 입력" /></div>
            <div className={s.modalField}><label className={s.modalLabel}>새 비밀번호 확인</label><input className={s.modalInput} type="password" value={editPasswordConfirm} onChange={e => setEditPasswordConfirm(e.target.value)} placeholder="비밀번호 확인" /></div>
            {modalError && <p className={s.errMsg}>{modalError}</p>}
            <div className={s.modalFoot}>
              <button type="button" className={s.btnGhost} disabled={pending} onClick={closeModal}>취소</button>
              <button type="button" className={s.btnPrimary} disabled={pending} onClick={handleUpdate}>{pending ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'delete' && deleteTarget && (
        <div className={s.overlay} role="presentation" onClick={closeModal}>
          <div className={s.modal} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h2 className={s.modalTitle}>계정 삭제</h2>
            <p style={{ fontSize: 13, color: 'var(--ds-text-secondary)', lineHeight: 1.6, margin: 0 }}>삭제하면 해당 계정이 비활성화됩니다. 계속하시겠습니까?</p>
            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{deleteTarget.name ?? '-'} ({deleteTarget.role === 'restaurant' ? '식당' : '공급자'})</p>
            {modalError && <p className={s.errMsg}>{modalError}</p>}
            <div className={s.modalFoot}>
              <button type="button" className={s.btnGhost} disabled={pending} onClick={closeModal}>취소</button>
              <button type="button" className={s.btnDangerSm} disabled={pending} onClick={handleDelete}>{pending ? '처리 중...' : '삭제'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
