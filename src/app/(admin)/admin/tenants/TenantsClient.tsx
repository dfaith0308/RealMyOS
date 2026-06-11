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
import s from './tenants.module.css'

type RoleTab = 'all' | 'supplier' | 'restaurant'
type CreateRole = 'supplier' | 'restaurant'

type ModalKind = 'create' | 'edit' | 'delete' | null

function fmtDate(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ko-KR')
}

function roleBadgeClass(role: string | null) {
  if (role === 'restaurant') return `${s.badge} ${s.badgeRestaurant}`
  return `${s.badge} ${s.badgeSupplier}`
}

function roleLabel(role: string | null) {
  if (role === 'restaurant') return '식당'
  if (role === 'supplier') return '공급자'
  return role ?? '-'
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
  const [tab, setTab] = useState<RoleTab>('all')
  const [modal, setModal] = useState<ModalKind>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

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

  const counts = useMemo(() => {
    const supplier = rows.filter((r) => r.role === 'supplier').length
    const restaurant = rows.filter((r) => r.role === 'restaurant').length
    return { all: rows.length, supplier, restaurant }
  }, [rows])

  const filtered = useMemo(() => {
    if (tab === 'all') return rows
    return rows.filter((r) => r.role === tab)
  }, [rows, tab])

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

      <nav className={s.tabs}>
        <button type="button" className={tab === 'all' ? `${s.tab} ${s.tabOn}` : s.tab} onClick={() => setTab('all')}>
          전체 ({counts.all})
        </button>
        <button
          type="button"
          className={tab === 'supplier' ? `${s.tab} ${s.tabOn}` : s.tab}
          onClick={() => setTab('supplier')}
        >
          공급자 ({counts.supplier})
        </button>
        <button
          type="button"
          className={tab === 'restaurant' ? `${s.tab} ${s.tabOn}` : s.tab}
          onClick={() => setTab('restaurant')}
        >
          식당 ({counts.restaurant})
        </button>
      </nav>

      <section className={s.tableWrap}>
        <div style={{ overflowX: 'auto' }}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>상호명</th>
                <th className={s.th}>역할</th>
                <th className={s.th}>이메일</th>
                <th className={s.th}>승인상태</th>
                <th className={s.th}>가입일</th>
                <th className={s.th}>액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const approved = row.is_approved === true
                return (
                  <tr key={row.id} className={s.tr}>
                    <td className={s.td}>{row.name ?? '-'}</td>
                    <td className={s.td}>
                      <span className={roleBadgeClass(row.role)}>{roleLabel(row.role)}</span>
                    </td>
                    <td className={s.td}>{row.email ?? '-'}</td>
                    <td className={s.td}>
                      <span className={approved ? s.approved : s.pending}>
                        {approved ? '승인됨' : '대기/정지'}
                      </span>
                    </td>
                    <td className={s.td}>{fmtDate(row.created_at)}</td>
                    <td className={s.td}>
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
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td className={s.empty} colSpan={6}>
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
