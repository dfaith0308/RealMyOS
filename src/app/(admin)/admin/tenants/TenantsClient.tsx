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
type RoleFilter = 'all' | 'supplier' | 'restaurant'
type ApprovalFilter = 'all' | 'approved' | 'pending'
type PlanFilter = 'all' | SubscriptionPlan

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  free: '무료',
  earlybird: '얼리버드 (9,900원/월)',
  pro: '정식 (29,000원/월)',
  annual: '연간 (19,900원/월)',
}

const PLAN_OPTIONS: SubscriptionPlan[] = ['free', 'earlybird', 'pro', 'annual']

function normalizePlan(plan: string | null | undefined): SubscriptionPlan {
  if (plan === 'earlybird' || plan === 'pro' || plan === 'annual') return plan
  return 'free'
}

function planBadgeStyle(plan: SubscriptionPlan): React.CSSProperties {
  const map: Record<SubscriptionPlan, React.CSSProperties> = {
    free: { background: '#F3F4F6', color: '#6b7280' },
    earlybird: { background: '#FFF7ED', color: '#c2410c' },
    pro: { background: '#F0FDF4', color: '#15803d' },
    annual: { background: '#EFF6FF', color: '#1d4ed8' },
  }
  return {
    display: 'inline-flex',
    alignItems: 'center',
    height: 22,
    padding: '0 9px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    ...map[plan],
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ko-KR')
}

function fmtDateShort(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('ko-KR')
}

function roleBadgeClass(role: string | null) {
  if (role === 'restaurant') return `${s.badge} ${s.badgeRestaurant}`
  if (role === 'admin') return `${s.badge} ${s.badgeSupplier}`
  return `${s.badge} ${s.badgeSupplier}`
}

function roleLabel(role: string | null) {
  if (role === 'restaurant') return '식당'
  if (role === 'supplier') return '공급자'
  if (role === 'admin') return '관리자'
  return role ?? '-'
}

const isAdminTenant = (tenant: TenantAdminRow) =>
  tenant.role === 'admin' || tenant.id === '00000000-0000-0000-0000-000000000000'

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
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('all')
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all')

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
  const [planDraft, setPlanDraft] = useState<Record<string, SubscriptionPlan>>({})

  const kpi = useMemo(() => {
    const supplier = rows.filter((r) => r.role === 'supplier').length
    const restaurant = rows.filter((r) => r.role === 'restaurant').length
    const approved = rows.filter((r) => r.is_approved === true).length
    const pendingCount = rows.filter((r) => r.is_approved !== true).length
    return { all: rows.length, supplier, restaurant, approved, pending: pendingCount }
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (roleFilter !== 'all' && row.role !== roleFilter) return false
      if (approvalFilter === 'approved' && row.is_approved !== true) return false
      if (approvalFilter === 'pending' && row.is_approved === true) return false
      if (planFilter !== 'all' && normalizePlan(row.subscription_plan) !== planFilter) return false
      if (q) {
        const hay = [row.name, row.representative_name, row.contact_phone, row.email]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, search, roleFilter, approvalFilter, planFilter])

  function refreshList() {
    setPageError(null)
    startTransition(async () => {
      const res = await getTenantAdminList()
      if (!res.success) {
        setPageError(res.error ?? '목록 조회 실패')
        return
      }
      setRows(res.data.tenants)
      router.refresh()
    })
  }

  function closeModal() {
    setModal(null)
    setModalError(null)
    setDeleteTarget(null)
    setEditTenantId(null)
    setCreateName('')
    setCreateEmail('')
    setCreatePassword('')
    setCreatePasswordConfirm('')
    setEditName('')
    setEditEmail('')
    setEditPassword('')
    setEditPasswordConfirm('')
  }

  function openCreate(role: CreateRole) {
    setCreateRole(role)
    setModal('create')
    setModalError(null)
  }

  function openEdit(row: TenantAdminRow) {
    setModalError(null)
    setEditTenantId(row.id)
    setEditName(row.name ?? '')
    setEditEmail(row.email ?? '')
    setEditPassword('')
    setEditPasswordConfirm('')
    setModal('edit')
    startTransition(async () => {
      const res = await getTenantDetail({ tenant_id: row.id })
      if (!res.success || !res.data) {
        setModalError(res.error ?? '상세 조회 실패')
        return
      }
      setEditName(res.data.name)
      setEditEmail(res.data.email ?? '')
    })
  }

  function openDelete(row: TenantAdminRow) {
    setDeleteTarget(row)
    setModalError(null)
    setModal('delete')
  }

  function handleToggleApproval(row: TenantAdminRow) {
    setPageError(null)
    startTransition(async () => {
      const approved = row.is_approved === true
      const res = approved
        ? await suspendTenant(row.id)
        : await approveTenant(row.id)
      if (!res.success) {
        setPageError(res.error ?? '상태 변경 실패')
        return
      }
      refreshList()
    })
  }

  function handleCreate() {
    setModalError(null)
    if (!createName.trim()) {
      setModalError('상호명을 입력해주세요.')
      return
    }
    if (!createEmail.trim()) {
      setModalError('이메일을 입력해주세요.')
      return
    }
    if (createPassword.length < 8) {
      setModalError('비밀번호는 8자 이상이어야 합니다.')
      return
    }
    if (createPassword !== createPasswordConfirm) {
      setModalError('비밀번호가 일치하지 않습니다.')
      return
    }

    startTransition(async () => {
      const res = await createTenant({
        email: createEmail.trim(),
        password: createPassword,
        name: createName.trim(),
        role: createRole,
      })
      if (!res.success) {
        setModalError(res.error ?? '계정 생성 실패')
        return
      }
      closeModal()
      refreshList()
    })
  }

  function handleUpdate() {
    if (!editTenantId) return
    setModalError(null)

    if (!editName.trim()) {
      setModalError('상호명을 입력해주세요.')
      return
    }
    if (editPassword || editPasswordConfirm) {
      if (editPassword.length < 8) {
        setModalError('비밀번호는 8자 이상이어야 합니다.')
        return
      }
      if (editPassword !== editPasswordConfirm) {
        setModalError('비밀번호가 일치하지 않습니다.')
        return
      }
    }

    startTransition(async () => {
      const res = await updateTenant({
        tenant_id: editTenantId,
        name: editName.trim(),
        email: editEmail.trim() || undefined,
        password: editPassword || undefined,
      })
      if (!res.success) {
        setModalError(res.error ?? '수정 실패')
        return
      }
      closeModal()
      refreshList()
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    setModalError(null)
    startTransition(async () => {
      const res = await deleteTenant({ tenant_id: deleteTarget.id })
      if (!res.success) {
        setModalError(res.error ?? '삭제 실패')
        return
      }
      closeModal()
      refreshList()
    })
  }

  function handleApplyPlan(row: TenantAdminRow) {
    const plan = planDraft[row.id] ?? normalizePlan(row.subscription_plan)
    setPageError(null)
    startTransition(async () => {
      const res = await updateTenantSubscription({ tenant_id: row.id, plan })
      if (!res.success) {
        setPageError(res.error ?? '구독 플랜 변경 실패')
        return
      }
      setPlanDraft((prev) => {
        const next = { ...prev }
        delete next[row.id]
        return next
      })
      refreshList()
    })
  }

  function handleTwoMonthFree(row: TenantAdminRow) {
    const expires = new Date()
    expires.setMonth(expires.getMonth() + 2)
    setPageError(null)
    startTransition(async () => {
      const res = await updateTenantSubscription({
        tenant_id: row.id,
        plan: 'earlybird',
        custom_expires_at: expires.toISOString(),
      })
      if (!res.success) {
        setPageError(res.error ?? '2개월 무료 적용 실패')
        return
      }
      refreshList()
    })
  }

  return (
    <main className={s.page}>
      <header className={s.pageHead}>
        <h1 className={s.pageTitle}>계정 관리</h1>
        <div className={s.headActions}>
          <button type="button" className={s.btnGhost} disabled={pending} onClick={() => openCreate('supplier')}>
            + 공급자 추가
          </button>
          <button type="button" className={s.btnPrimary} disabled={pending} onClick={() => openCreate('restaurant')}>
            + 식당 추가
          </button>
        </div>
      </header>

      {pageError && <div className={s.pageErr}>{pageError}</div>}

      <div className={s.kpiRow}>
        {[
          { label: '전체', value: kpi.all },
          { label: '공급자', value: kpi.supplier },
          { label: '식당', value: kpi.restaurant },
          { label: '승인됨', value: kpi.approved },
          { label: '대기', value: kpi.pending },
        ].map((item) => (
          <div key={item.label} className={s.kpiCard}>
            <div className={s.kpiNum}>{item.value}</div>
            <div className={s.kpiLabel}>{item.label}</div>
          </div>
        ))}
      </div>

      <div className={s.filterBar}>
        <input
          type="search"
          className={s.searchInput}
          placeholder="상호명·대표자·연락처 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={s.filterSelect}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
        >
          <option value="all">역할: 전체</option>
          <option value="supplier">공급자</option>
          <option value="restaurant">식당</option>
        </select>
        <select
          className={s.filterSelect}
          value={approvalFilter}
          onChange={(e) => setApprovalFilter(e.target.value as ApprovalFilter)}
        >
          <option value="all">승인상태: 전체</option>
          <option value="approved">승인됨</option>
          <option value="pending">대기/정지</option>
        </select>
        <select
          className={s.filterSelect}
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
        >
          <option value="all">구독플랜: 전체</option>
          <option value="free">무료</option>
          <option value="earlybird">얼리버드</option>
          <option value="pro">정식</option>
          <option value="annual">연간</option>
        </select>
      </div>

      <section className={s.tableWrap}>
        <div style={{ overflowX: 'auto' }}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>상호명 / 이메일</th>
                <th className={s.th}>역할</th>
                <th className={s.th}>대표자 / 연락처</th>
                <th className={s.th}>구독</th>
                <th className={s.th}>승인상태</th>
                <th className={s.th}>가입일</th>
                <th className={s.th}>액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const approved = row.is_approved === true
                const currentPlan = normalizePlan(row.subscription_plan)
                const selectedPlan = planDraft[row.id] ?? currentPlan
                return (
                  <tr key={row.id} className={s.tr}>
                    <td className={s.td}>
                      <div style={{ fontWeight: 600, lineHeight: 1.4 }}>{row.name ?? '-'}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{row.email ?? '-'}</div>
                    </td>
                    <td className={s.td}>
                      <span className={roleBadgeClass(row.role)}>{roleLabel(row.role)}</span>
                    </td>
                    <td className={s.td}>
                      <div style={{ lineHeight: 1.4 }}>{row.representative_name ?? '-'}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{row.contact_phone ?? '-'}</div>
                    </td>
                    <td className={s.td}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
                        <span style={planBadgeStyle(currentPlan)}>{PLAN_LABELS[currentPlan]}</span>
                        {row.plan_expires_at && (
                          <span style={{ fontSize: 11, color: '#6b7280' }}>
                            만료: {fmtDate(row.plan_expires_at)}
                          </span>
                        )}
                        <div className={s.actions}>
                          <select
                            value={selectedPlan}
                            disabled={pending}
                            onChange={(e) =>
                              setPlanDraft((prev) => ({
                                ...prev,
                                [row.id]: e.target.value as SubscriptionPlan,
                              }))
                            }
                            style={{
                              flex: 1,
                              minWidth: 100,
                              height: 28,
                              padding: '0 8px',
                              borderRadius: 6,
                              border: '1px solid var(--ds-border-default)',
                              fontSize: 11.5,
                              fontFamily: 'inherit',
                              background: '#fff',
                            }}
                          >
                            {PLAN_OPTIONS.map((p) => (
                              <option key={p} value={p}>
                                {PLAN_LABELS[p]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className={s.btnSm}
                            disabled={pending}
                            onClick={() => handleApplyPlan(row)}
                          >
                            적용
                          </button>
                          <button
                            type="button"
                            className={s.btnSm}
                            disabled={pending}
                            onClick={() => handleTwoMonthFree(row)}
                          >
                            2개월 무료
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className={s.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: approved ? '#15803d' : '#ea580c',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 600, color: approved ? '#15803d' : '#c2410c' }}>
                          {approved ? '승인됨' : '대기/정지'}
                        </span>
                      </div>
                    </td>
                    <td className={s.td} style={{ whiteSpace: 'nowrap' }}>
                      {fmtDateShort(row.created_at)}
                    </td>
                    <td className={s.td}>
                      {isAdminTenant(row) ? (
                        <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>시스템 계정</span>
                      ) : (
                        <div className={s.actions}>
                          <button
                            type="button"
                            className={s.btnSm}
                            disabled={pending}
                            onClick={() => handleToggleApproval(row)}
                          >
                            {approved ? '정지' : '승인'}
                          </button>
                          <button type="button" className={s.btnSm} disabled={pending} onClick={() => openEdit(row)}>
                            수정
                          </button>
                          <button type="button" className={s.btnDangerSm} disabled={pending} onClick={() => openDelete(row)}>
                            삭제
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td className={s.empty} colSpan={7}>
                    데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modal === 'create' && (
        <div className={s.overlay} role="presentation" onClick={closeModal}>
          <div className={s.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className={s.modalTitle}>{createRole === 'supplier' ? '공급자 계정 추가' : '식당 계정 추가'}</h2>
            <div className={s.modalField}>
              <label className={s.modalLabel}>상호명 *</label>
              <input
                className={s.modalInput}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="상호명 입력"
              />
            </div>
            <div className={s.modalField}>
              <label className={s.modalLabel}>이메일 *</label>
              <input
                className={s.modalInput}
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="owner@example.com"
              />
            </div>
            <div className={s.modalField}>
              <label className={s.modalLabel}>비밀번호 * (8자 이상)</label>
              <input
                className={s.modalInput}
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="비밀번호"
              />
            </div>
            <div className={s.modalField}>
              <label className={s.modalLabel}>비밀번호 확인 *</label>
              <input
                className={s.modalInput}
                type="password"
                value={createPasswordConfirm}
                onChange={(e) => setCreatePasswordConfirm(e.target.value)}
                placeholder="비밀번호 확인"
              />
            </div>
            {modalError && <p className={s.errMsg}>{modalError}</p>}
            <div className={s.modalFoot}>
              <button type="button" className={s.btnGhost} disabled={pending} onClick={closeModal}>
                취소
              </button>
              <button type="button" className={s.btnPrimary} disabled={pending} onClick={handleCreate}>
                {pending ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'edit' && (
        <div className={s.overlay} role="presentation" onClick={closeModal}>
          <div className={s.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className={s.modalTitle}>계정 수정</h2>
            <div className={s.modalField}>
              <label className={s.modalLabel}>상호명</label>
              <input
                className={s.modalInput}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="상호명"
              />
            </div>
            <div className={s.modalField}>
              <label className={s.modalLabel}>이메일</label>
              <input
                className={s.modalInput}
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="owner@example.com"
              />
            </div>
            <div className={s.modalField}>
              <label className={s.modalLabel}>새 비밀번호 (선택)</label>
              <input
                className={s.modalInput}
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="변경 시에만 입력"
              />
            </div>
            <div className={s.modalField}>
              <label className={s.modalLabel}>새 비밀번호 확인</label>
              <input
                className={s.modalInput}
                type="password"
                value={editPasswordConfirm}
                onChange={(e) => setEditPasswordConfirm(e.target.value)}
                placeholder="비밀번호 확인"
              />
            </div>
            {modalError && <p className={s.errMsg}>{modalError}</p>}
            <div className={s.modalFoot}>
              <button type="button" className={s.btnGhost} disabled={pending} onClick={closeModal}>
                취소
              </button>
              <button type="button" className={s.btnPrimary} disabled={pending} onClick={handleUpdate}>
                {pending ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'delete' && deleteTarget && (
        <div className={s.overlay} role="presentation" onClick={closeModal}>
          <div className={s.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className={s.modalTitle}>계정 삭제</h2>
            <p style={{ fontSize: 13, color: 'var(--ds-text-secondary)', lineHeight: 1.6, margin: 0 }}>
              삭제하면 해당 계정이 비활성화됩니다. 계속하시겠습니까?
            </p>
            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
              {deleteTarget.name ?? '-'} ({roleLabel(deleteTarget.role)})
            </p>
            {modalError && <p className={s.errMsg}>{modalError}</p>}
            <div className={s.modalFoot}>
              <button type="button" className={s.btnGhost} disabled={pending} onClick={closeModal}>
                취소
              </button>
              <button type="button" className={s.btnDangerSm} disabled={pending} onClick={handleDelete}>
                {pending ? '처리 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
