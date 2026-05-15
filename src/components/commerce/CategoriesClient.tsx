'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import {
  createCategory,
  deleteCategory,
  toggleCategoryActive,
  updateCategory,
  type AdminCategoryNode,
} from '@/actions/admin/commerce'
import s from '@/app/(admin)/admin-shared.module.css'

function suggestSlugFromAsciiName(name: string): string {
  const t = name.trim()
  if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(t)) return ''
  const collapsed = t
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  const trimmed = collapsed.replace(/^-+|-+$/g, '')
  if (!trimmed || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) return ''
  return trimmed
}

export default function CategoriesClient({ tree }: { tree: AdminCategoryNode[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [successToast, setSuccessToast] = useState<string | null>(null)

  const [addRootOpen, setAddRootOpen] = useState(false)
  const [rootName, setRootName] = useState('')
  const [rootSlug, setRootSlug] = useState('')
  const [rootSort, setRootSort] = useState('0')
  const [rootSlugTouched, setRootSlugTouched] = useState(false)

  const [addChildFor, setAddChildFor] = useState<string | null>(null)
  const [childName, setChildName] = useState('')
  const [childSlug, setChildSlug] = useState('')
  const [childSort, setChildSort] = useState('0')
  const [childSlugTouched, setChildSlugTouched] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editSort, setEditSort] = useState('0')

  const refresh = useCallback(() => {
    router.refresh()
  }, [router])

  const showSuccess = (msg: string) => {
    setSuccessToast(msg)
    window.setTimeout(() => setSuccessToast(null), 3200)
  }

  function startEdit(node: AdminCategoryNode) {
    setEditingId(node.id)
    setEditName(node.name)
    setEditSlug(node.slug ?? '')
    setEditSort(String(node.sort_order ?? 0))
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  function onRootNameChange(v: string) {
    setRootName(v)
    if (!rootSlugTouched) {
      const sgt = suggestSlugFromAsciiName(v)
      setRootSlug(sgt)
    }
  }

  function onChildNameChange(v: string) {
    setChildName(v)
    if (!childSlugTouched) {
      const sgt = suggestSlugFromAsciiName(v)
      setChildSlug(sgt)
    }
  }

  function parseSort(raw: string): number {
    const so = Number.parseInt(String(raw).trim(), 10)
    return Number.isFinite(so) ? so : 0
  }

  function submitAddRoot() {
    setError(null)
    startTransition(async () => {
      const so = parseSort(rootSort)
      const r = await createCategory({
        name: rootName,
        slug: rootSlug,
        parent_id: null,
        sort_order: so,
      })
      if (!r.success) {
        setError(r.error ?? '추가 실패')
        return
      }
      setAddRootOpen(false)
      setRootName('')
      setRootSlug('')
      setRootSort('0')
      setRootSlugTouched(false)
      showSuccess('대분류가 추가되었습니다.')
      refresh()
    })
  }

  function submitAddChild(parentId: string) {
    setError(null)
    startTransition(async () => {
      const so = parseSort(childSort)
      const r = await createCategory({
        name: childName,
        slug: childSlug,
        parent_id: parentId,
        sort_order: so,
      })
      if (!r.success) {
        setError(r.error ?? '추가 실패')
        return
      }
      setAddChildFor(null)
      setChildName('')
      setChildSlug('')
      setChildSort('0')
      setChildSlugTouched(false)
      showSuccess('소분류가 추가되었습니다.')
      refresh()
    })
  }

  function submitEdit(id: string) {
    setError(null)
    startTransition(async () => {
      const so = parseSort(editSort)
      const r = await updateCategory(id, {
        name: editName,
        slug: editSlug,
        sort_order: so,
      })
      if (!r.success) {
        setError(r.error ?? '수정 실패')
        return
      }
      cancelEdit()
      showSuccess('카테고리가 수정되었습니다.')
      refresh()
    })
  }

  function onToggleActive(id: string) {
    setError(null)
    startTransition(async () => {
      const r = await toggleCategoryActive(id)
      if (!r.success) {
        setError(r.error ?? '처리 실패')
        return
      }
      showSuccess(r.data?.is_active ? '카테고리가 활성화되었습니다.' : '카테고리가 비활성화되었습니다.')
      refresh()
    })
  }

  function onDelete(id: string, label: string) {
    if (!window.confirm(`「${label}」카테고리를 삭제할까요?`)) return
    setError(null)
    startTransition(async () => {
      const r = await deleteCategory(id)
      if (!r.success) {
        setError(r.error ?? '삭제 실패')
        return
      }
      if (editingId === id) cancelEdit()
      showSuccess('카테고리가 삭제되었습니다.')
      refresh()
    })
  }

  return (
    <>
      {successToast ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            padding: '12px 20px',
            borderRadius: 10,
            background: '#15803d',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          }}
        >
          {successToast}
        </div>
      ) : null}

      <div className={s.actionsRow} style={{ justifyContent: 'flex-end', width: '100%' }}>
        <button
          type="button"
          className={s.primaryBtn}
          disabled={pending}
          onClick={() => {
            setError(null)
            setAddRootOpen((v) => !v)
            if (addRootOpen) {
              setRootName('')
              setRootSlug('')
              setRootSort('0')
              setRootSlugTouched(false)
            }
          }}
        >
          + 대분류 추가
        </button>
      </div>

      {addRootOpen ? (
        <div className={s.panel} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className={s.cellStrong}>새 대분류</div>
          <div className={s.grid2}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              이름 (최대 24자)
              <input
                className={s.input}
                value={rootName}
                onChange={(e) => onRootNameChange(e.target.value)}
                maxLength={24}
                placeholder="예: 조미료"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              slug
              <input
                className={s.input}
                value={rootSlug}
                onChange={(e) => {
                  setRootSlugTouched(true)
                  setRootSlug(e.target.value)
                }}
                placeholder="예: sauce-seasoning"
              />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, maxWidth: 200 }}>
            정렬 순서
            <input
              className={s.input}
              value={rootSort}
              onChange={(e) => setRootSort(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <div className={s.actionsRow}>
            <button type="button" className={s.primaryBtnSm} disabled={pending} onClick={submitAddRoot}>
              저장
            </button>
            <button
              type="button"
              className={s.ghostBtn}
              disabled={pending}
              onClick={() => {
                setAddRootOpen(false)
                setRootName('')
                setRootSlug('')
                setRootSort('0')
                setRootSlugTouched(false)
              }}
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          className={s.panel}
          style={{ borderColor: 'var(--ds-border-danger, #fecaca)', color: 'var(--ds-text-danger, #b91c1c)' }}
        >
          {error}
        </div>
      ) : null}

      {tree.length === 0 && !addRootOpen ? (
        <div className={s.empty}>등록된 카테고리가 없습니다</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tree.map((parent) => (
            <div
              key={parent.id}
              className={s.panel}
              style={{
                opacity: parent.is_active ? 1 : 0.72,
                borderStyle: 'solid',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ flex: '1 1 200px' }}>
                  {editingId === parent.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        className={s.input}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={24}
                      />
                      <input
                        className={s.input}
                        value={editSlug}
                        onChange={(e) => setEditSlug(e.target.value)}
                        placeholder="예: sauce-seasoning"
                      />
                      <input
                        className={s.input}
                        style={{ maxWidth: 120 }}
                        value={editSort}
                        onChange={(e) => setEditSort(e.target.value)}
                        inputMode="numeric"
                      />
                      <div className={s.actionsRow}>
                        <button
                          type="button"
                          className={s.primaryBtnSm}
                          disabled={pending}
                          onClick={() => submitEdit(parent.id)}
                        >
                          저장
                        </button>
                        <button type="button" className={s.ghostBtn} disabled={pending} onClick={cancelEdit}>
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className={s.cellStrong} style={{ fontSize: 16 }}>
                          {parent.name}
                        </span>
                        {!parent.is_active ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: '#e5e7eb',
                              color: '#4b5563',
                            }}
                          >
                            비활성
                          </span>
                        ) : null}
                        <span className={s.cellMutedSm}>
                          slug: {parent.slug?.trim() ? parent.slug : '—'} · sort: {parent.sort_order ?? 0}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                {editingId !== parent.id ? (
                  <div className={s.actionsRow} style={{ flexShrink: 0 }}>
                    <button
                      type="button"
                      className={s.ghostBtn}
                      disabled={pending}
                      onClick={() => startEdit(parent)}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className={s.ghostBtn}
                      disabled={pending}
                      onClick={() => onToggleActive(parent.id)}
                    >
                      {parent.is_active ? '비활성화' : '활성화'}
                    </button>
                    <button
                      type="button"
                      className={s.ghostBtn}
                      disabled={pending}
                      onClick={() => onDelete(parent.id, parent.name)}
                    >
                      삭제
                    </button>
                  </div>
                ) : null}
              </div>

              <div style={{ marginTop: 12, borderTop: '1px solid var(--ds-border-default, #e5e7eb)', paddingTop: 12 }}>
                <div className={s.cellMutedSm} style={{ marginBottom: 8 }}>
                  소분류
                </div>
                {parent.children.length === 0 ? (
                  <div className={s.cellMutedSm} style={{ marginBottom: 8 }}>
                    등록된 소분류가 없습니다
                  </div>
                ) : (
                  <table className={s.table} style={{ fontSize: 13 }}>
                    <thead>
                      <tr className={s.theadRow}>
                        {['이름', 'slug', '정렬', '상태', '액션'].map((h) => (
                          <th key={h} className={s.th}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parent.children.map((ch) => (
                        <tr key={ch.id} style={{ opacity: ch.is_active ? 1 : 0.75 }}>
                          <td className={s.tdWide}>
                            {editingId === ch.id ? (
                              <input
                                className={s.input}
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                maxLength={24}
                              />
                            ) : (
                              ch.name
                            )}
                          </td>
                          <td className={s.tdNowrap}>
                            {editingId === ch.id ? (
                              <input
                                className={s.input}
                                value={editSlug}
                                onChange={(e) => setEditSlug(e.target.value)}
                                placeholder="예: sauce-seasoning"
                              />
                            ) : ch.slug?.trim() ? (
                              ch.slug
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className={s.tdNowrap}>
                            {editingId === ch.id ? (
                              <input
                                className={s.input}
                                style={{ width: 72 }}
                                value={editSort}
                                onChange={(e) => setEditSort(e.target.value)}
                                inputMode="numeric"
                              />
                            ) : (
                              ch.sort_order ?? 0
                            )}
                          </td>
                          <td className={s.tdNowrap}>
                            {ch.is_active ? (
                              <span className={s.cellMutedSm}>활성</span>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>비활성</span>
                            )}
                          </td>
                          <td className={s.tdNowrap}>
                            {editingId === ch.id ? (
                              <div className={s.actionsRow}>
                                <button
                                  type="button"
                                  className={s.primaryBtnSm}
                                  disabled={pending}
                                  onClick={() => submitEdit(ch.id)}
                                >
                                  저장
                                </button>
                                <button type="button" className={s.ghostBtn} disabled={pending} onClick={cancelEdit}>
                                  취소
                                </button>
                              </div>
                            ) : (
                              <div className={s.actionsRow}>
                                <button
                                  type="button"
                                  className={s.ghostBtn}
                                  disabled={pending}
                                  onClick={() => startEdit(ch)}
                                >
                                  수정
                                </button>
                                <button
                                  type="button"
                                  className={s.ghostBtn}
                                  disabled={pending}
                                  onClick={() => onToggleActive(ch.id)}
                                >
                                  {ch.is_active ? '비활성화' : '활성화'}
                                </button>
                                <button
                                  type="button"
                                  className={s.ghostBtn}
                                  disabled={pending}
                                  onClick={() => onDelete(ch.id, ch.name)}
                                >
                                  삭제
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {addChildFor === parent.id ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 12,
                      background: 'var(--ds-surface-muted, #f9fafb)',
                      borderRadius: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div className={s.cellStrong} style={{ fontSize: 13 }}>
                      새 소분류
                    </div>
                    <div className={s.grid2}>
                      <input
                        className={s.input}
                        value={childName}
                        onChange={(e) => onChildNameChange(e.target.value)}
                        maxLength={24}
                        placeholder="이름"
                      />
                      <input
                        className={s.input}
                        value={childSlug}
                        onChange={(e) => {
                          setChildSlugTouched(true)
                          setChildSlug(e.target.value)
                        }}
                        placeholder="예: sauce-seasoning"
                      />
                    </div>
                    <input
                      className={s.input}
                      style={{ maxWidth: 120 }}
                      value={childSort}
                      onChange={(e) => setChildSort(e.target.value)}
                      inputMode="numeric"
                      placeholder="정렬 순서"
                    />
                    <div className={s.actionsRow}>
                      <button
                        type="button"
                        className={s.primaryBtnSm}
                        disabled={pending}
                        onClick={() => submitAddChild(parent.id)}
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        className={s.ghostBtn}
                        disabled={pending}
                        onClick={() => {
                          setAddChildFor(null)
                          setChildName('')
                          setChildSlug('')
                          setChildSort('0')
                          setChildSlugTouched(false)
                        }}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={s.ghostBtn}
                    style={{ marginTop: 8 }}
                    disabled={pending}
                    onClick={() => {
                      setError(null)
                      setAddChildFor(parent.id)
                      setChildName('')
                      setChildSlug('')
                      setChildSort('0')
                      setChildSlugTouched(false)
                    }}
                  >
                    + 소분류 추가
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
