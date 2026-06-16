'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState, useTransition } from 'react'
import {
  createCategory,
  deleteCategory,
  toggleCategoryActive,
  updateCategory,
  type AdminCategoryNode,
} from '@/actions/admin/commerce'

function genSlug(): string {
  return `cat-${Date.now().toString(36)}`
}

export default function CategoriesClient({ tree }: { tree: AdminCategoryNode[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [addRootOpen, setAddRootOpen] = useState(false)
  const [rootName, setRootName] = useState('')
  const rootInputRef = useRef<HTMLInputElement>(null)

  const [addChildFor, setAddChildFor] = useState<string | null>(null)
  const [childName, setChildName] = useState('')
  const childInputRef = useRef<HTMLInputElement>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const refresh = useCallback(() => router.refresh(), [router])

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2800)
  }

  function openAddChild(parentId: string) {
    setAddChildFor(parentId)
    setChildName('')
    setError(null)
    window.setTimeout(() => childInputRef.current?.focus(), 50)
  }

  function openAddRoot() {
    setAddRootOpen(true)
    setRootName('')
    setError(null)
    window.setTimeout(() => rootInputRef.current?.focus(), 50)
  }

  function submitAddRoot() {
    const name = rootName.trim()
    if (!name) { setError('이름을 입력해주세요'); return }
    setError(null)
    startTransition(async () => {
      const r = await createCategory({ name, slug: genSlug(), parent_id: null, sort_order: 0 })
      if (!r.success) { setError(r.error ?? '추가 실패'); return }
      setAddRootOpen(false)
      setRootName('')
      showToast('대분류가 추가됐습니다')
      refresh()
    })
  }

  function submitAddChild(parentId: string) {
    const name = childName.trim()
    if (!name) { setError('이름을 입력해주세요'); return }
    setError(null)
    startTransition(async () => {
      const r = await createCategory({ name, slug: genSlug(), parent_id: parentId, sort_order: 0 })
      if (!r.success) { setError(r.error ?? '추가 실패'); return }
      setAddChildFor(null)
      setChildName('')
      showToast('소분류가 추가됐습니다')
      refresh()
    })
  }

  function submitEdit(id: string) {
    const name = editName.trim()
    if (!name) { setError('이름을 입력해주세요'); return }
    setError(null)
    startTransition(async () => {
      const r = await updateCategory(id, { name })
      if (!r.success) { setError(r.error ?? '수정 실패'); return }
      setEditingId(null)
      showToast('수정됐습니다')
      refresh()
    })
  }

  function onToggleActive(id: string) {
    setError(null)
    startTransition(async () => {
      const r = await toggleCategoryActive(id)
      if (!r.success) { setError(r.error ?? '처리 실패'); return }
      showToast(r.data?.is_active ? '활성화됐습니다' : '비활성화됐습니다')
      refresh()
    })
  }

  function onDelete(id: string, label: string) {
    if (!window.confirm(`「${label}」를 삭제할까요?`)) return
    setError(null)
    startTransition(async () => {
      const r = await deleteCategory(id)
      if (!r.success) { setError(r.error ?? '삭제 실패'); return }
      if (editingId === id) setEditingId(null)
      showToast('삭제됐습니다')
      refresh()
    })
  }

  const card: React.CSSProperties = {
    background: 'var(--ds-surface-panel)',
    border: '1px solid var(--ds-border-default)',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
  }

  const tagStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    background: 'var(--ds-neutral-50)',
    border: '1px solid var(--ds-border-default)',
    borderRadius: 8,
    fontSize: 13,
    color: 'var(--ds-text-primary)',
  }

  const xBtn: React.CSSProperties = {
    border: 'none',
    background: 'none',
    color: 'var(--ds-text-muted)',
    cursor: 'pointer',
    fontSize: 14,
    padding: 0,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
  }

  const addTagBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 10px',
    border: '1px dashed var(--ds-border-default)',
    borderRadius: 8,
    background: 'transparent',
    fontSize: 13,
    color: 'var(--ds-text-secondary)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  const actionBtn: React.CSSProperties = {
    padding: '5px 10px',
    border: '1px solid var(--ds-border-default)',
    borderRadius: 6,
    background: 'transparent',
    fontSize: 12,
    color: 'var(--ds-text-primary)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  const dangerBtn: React.CSSProperties = {
    padding: '5px 10px',
    border: '1px solid #fecaca',
    borderRadius: 6,
    background: '#fef2f2',
    fontSize: 12,
    color: '#dc2626',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  const inlineInput: React.CSSProperties = {
    padding: '5px 10px',
    border: '1px solid var(--ds-brand-primary)',
    borderRadius: 8,
    fontSize: 13,
    background: 'var(--ds-surface-panel)',
    color: 'var(--ds-text-primary)',
    outline: 'none',
    width: 140,
    fontFamily: 'inherit',
  }

  const saveBtn: React.CSSProperties = {
    padding: '5px 12px',
    border: 'none',
    borderRadius: 6,
    background: '#1f5d3a',
    color: '#fff',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  const cancelBtn: React.CSSProperties = {
    padding: '5px 10px',
    border: '1px solid var(--ds-border-default)',
    borderRadius: 6,
    background: 'transparent',
    fontSize: 12,
    color: 'var(--ds-text-secondary)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  return (
    <div style={{ maxWidth: 900 }}>
      {toast && (
        <div role="status" style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, padding: '12px 20px', borderRadius: 10,
          background: '#15803d', color: '#fff', fontSize: 14, fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        }}>{toast}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500, color: 'var(--ds-text-primary)', margin: '0 0 3px' }}>카테고리 관리</h1>
          <p style={{ fontSize: 12, color: 'var(--ds-text-secondary)', margin: 0 }}>쇼핑몰 상품 분류 체계를 관리합니다</p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={openAddRoot}
          style={{ padding: '8px 16px', background: '#1f5d3a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          + 대분류 추가
        </button>
      </div>

      {addRootOpen && (
        <div style={{ ...card, padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-text-primary)', margin: '0 0 10px' }}>새 대분류</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={rootInputRef}
              style={{ ...inlineInput, width: 220 }}
              value={rootName}
              onChange={e => setRootName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitAddRoot()}
              placeholder="예: 채소·과일"
              maxLength={24}
            />
            <button type="button" style={saveBtn} disabled={pending} onClick={submitAddRoot}>저장</button>
            <button type="button" style={cancelBtn} disabled={pending} onClick={() => { setAddRootOpen(false); setRootName(''); setError(null) }}>취소</button>
          </div>
          {error && <p style={{ fontSize: 12, color: '#dc2626', margin: '8px 0 0' }}>{error}</p>}
        </div>
      )}

      {error && !addRootOpen && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626', marginBottom: 12 }}>{error}</div>
      )}

      {tree.length === 0 && !addRootOpen ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ds-text-muted)', fontSize: 13 }}>
          등록된 카테고리가 없습니다. 대분류를 추가해주세요.
        </div>
      ) : (
        tree.map(parent => (
          <div key={parent.id} style={{ ...card, opacity: parent.is_active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--ds-border-default)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {editingId === parent.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      style={inlineInput}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && submitEdit(parent.id)}
                      maxLength={24}
                      autoFocus
                    />
                    <button type="button" style={saveBtn} disabled={pending} onClick={() => submitEdit(parent.id)}>저장</button>
                    <button type="button" style={cancelBtn} disabled={pending} onClick={() => { setEditingId(null); setError(null) }}>취소</button>
                  </div>
                ) : (
                  <>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ds-text-primary)' }}>{parent.name}</span>
                    {!parent.is_active && (
                      <span style={{ padding: '2px 8px', background: '#f3f4f6', color: '#6b7280', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>비활성</span>
                    )}
                    {parent.is_active && (
                      <span style={{ padding: '2px 8px', background: '#f0fdf4', color: '#15803d', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>활성</span>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--ds-text-secondary)' }}>소분류 {parent.children.length}개</span>
                  </>
                )}
              </div>
              {editingId !== parent.id && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" style={actionBtn} disabled={pending} onClick={() => { setEditingId(parent.id); setEditName(parent.name); setError(null) }}>수정</button>
                  <button type="button" style={actionBtn} disabled={pending} onClick={() => onToggleActive(parent.id)}>
                    {parent.is_active ? '비활성화' : '활성화'}
                  </button>
                  <button type="button" style={dangerBtn} disabled={pending} onClick={() => onDelete(parent.id, parent.name)}>삭제</button>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {parent.children.map(ch => (
                editingId === ch.id ? (
                  <div key={ch.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <input
                      style={inlineInput}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && submitEdit(ch.id)}
                      maxLength={24}
                      autoFocus
                    />
                    <button type="button" style={saveBtn} disabled={pending} onClick={() => submitEdit(ch.id)}>저장</button>
                    <button type="button" style={cancelBtn} disabled={pending} onClick={() => { setEditingId(null); setError(null) }}>취소</button>
                  </div>
                ) : (
                  <span
                    key={ch.id}
                    style={{ ...tagStyle, opacity: ch.is_active ? 1 : 0.5 }}
                    onDoubleClick={() => { setEditingId(ch.id); setEditName(ch.name); setError(null) }}
                    title="더블클릭으로 수정"
                  >
                    {ch.name}
                    <button
                      type="button"
                      style={xBtn}
                      disabled={pending}
                      onClick={() => onDelete(ch.id, ch.name)}
                      title="삭제"
                    >✕</button>
                  </span>
                )
              ))}

              {addChildFor === parent.id ? (
                <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input
                    ref={childInputRef}
                    style={inlineInput}
                    value={childName}
                    onChange={e => setChildName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') submitAddChild(parent.id)
                      if (e.key === 'Escape') { setAddChildFor(null); setChildName(''); setError(null) }
                    }}
                    placeholder="소분류 이름"
                    maxLength={24}
                  />
                  <button type="button" style={saveBtn} disabled={pending} onClick={() => submitAddChild(parent.id)}>저장</button>
                  <button type="button" style={cancelBtn} disabled={pending} onClick={() => { setAddChildFor(null); setChildName(''); setError(null) }}>취소</button>
                </div>
              ) : (
                <button type="button" style={addTagBtn} disabled={pending} onClick={() => openAddChild(parent.id)}>
                  + 소분류 추가
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
