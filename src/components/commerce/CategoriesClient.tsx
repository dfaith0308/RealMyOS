'use client'

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState, useTransition, type CSSProperties, type RefObject } from 'react'
import {
  createCategory,
  deleteCategory,
  reorderCategory,
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

  function onReorder(id: string, direction: 'up' | 'down', siblings: AdminCategoryNode[]) {
    setError(null)
    startTransition(async () => {
      const r = await reorderCategory(
        id,
        direction,
        siblings.map((s) => ({ id: s.id, sort_order: s.sort_order ?? 0 })),
      )
      if (!r.success) { setError(r.error ?? '순서 변경 실패'); return }
      refresh()
    })
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function handleDragEnd(event: DragEndEvent, items: AdminCategoryNode[]) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const direction = newIndex > oldIndex ? 'down' : 'up'
    const steps = Math.abs(newIndex - oldIndex)

    setError(null)
    startTransition(async () => {
      let current = [...items]
      const movingId = items[oldIndex].id
      for (let i = 0; i < steps; i++) {
        const curIdx = current.findIndex((c) => c.id === movingId)
        const r = await reorderCategory(
          movingId,
          direction,
          current.map((c) => ({ id: c.id, sort_order: c.sort_order ?? 0 })),
        )
        if (!r.success) { setError(r.error ?? '순서 변경 실패'); return }
        const swapIdx = direction === 'down' ? curIdx + 1 : curIdx - 1
        const tmp = current[curIdx]
        current[curIdx] = current[swapIdx]
        current[swapIdx] = tmp
      }
      refresh()
    })
  }

  const card: CSSProperties = {
    background: 'var(--ds-surface-panel)',
    border: '1px solid var(--ds-border-default)',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
  }

  const tagStyle: CSSProperties = {
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

  const xBtn: CSSProperties = {
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

  const addTagBtn: CSSProperties = {
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

  const actionBtn: CSSProperties = {
    padding: '5px 10px',
    border: '1px solid var(--ds-border-default)',
    borderRadius: 6,
    background: 'transparent',
    fontSize: 12,
    color: 'var(--ds-text-primary)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  const dangerBtn: CSSProperties = {
    padding: '5px 10px',
    border: '1px solid #fecaca',
    borderRadius: 6,
    background: '#fef2f2',
    fontSize: 12,
    color: '#dc2626',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  const inlineInput: CSSProperties = {
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

  const saveBtn: CSSProperties = {
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

  const cancelBtn: CSSProperties = {
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => handleDragEnd(e, tree)}
        >
          <SortableContext items={tree.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tree.map((parent) => (
              <SortableParentCard
                key={parent.id}
                parent={parent}
                tree={tree}
                pending={pending}
                editingId={editingId}
                editName={editName}
                addChildFor={addChildFor}
                childName={childName}
                childInputRef={childInputRef}
                card={card}
                tagStyle={tagStyle}
                xBtn={xBtn}
                addTagBtn={addTagBtn}
                actionBtn={actionBtn}
                dangerBtn={dangerBtn}
                inlineInput={inlineInput}
                saveBtn={saveBtn}
                cancelBtn={cancelBtn}
                sensors={sensors}
                onEdit={(id, name) => { setEditingId(id); setEditName(name); setError(null) }}
                onEditName={setEditName}
                onEditCancel={() => { setEditingId(null); setError(null) }}
                onSubmitEdit={submitEdit}
                onToggleActive={onToggleActive}
                onDelete={onDelete}
                onReorder={onReorder}
                onAddChild={openAddChild}
                onChildNameChange={setChildName}
                onSubmitChild={submitAddChild}
                onCancelChild={() => { setAddChildFor(null); setChildName(''); setError(null) }}
                onChildDragEnd={(e, children) => handleDragEnd(e, children)}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

type SortableParentCardProps = {
  parent: AdminCategoryNode
  tree: AdminCategoryNode[]
  pending: boolean
  editingId: string | null
  editName: string
  addChildFor: string | null
  childName: string
  childInputRef: RefObject<HTMLInputElement>
  card: CSSProperties
  tagStyle: CSSProperties
  xBtn: CSSProperties
  addTagBtn: CSSProperties
  actionBtn: CSSProperties
  dangerBtn: CSSProperties
  inlineInput: CSSProperties
  saveBtn: CSSProperties
  cancelBtn: CSSProperties
  sensors: ReturnType<typeof useSensors>
  onEdit: (id: string, name: string) => void
  onEditName: (name: string) => void
  onEditCancel: () => void
  onSubmitEdit: (id: string) => void
  onToggleActive: (id: string) => void
  onDelete: (id: string, label: string) => void
  onReorder: (id: string, direction: 'up' | 'down', siblings: AdminCategoryNode[]) => void
  onAddChild: (parentId: string) => void
  onChildNameChange: (name: string) => void
  onSubmitChild: (parentId: string) => void
  onCancelChild: () => void
  onChildDragEnd: (event: DragEndEvent, children: AdminCategoryNode[]) => void
}

function SortableParentCard({
  parent,
  tree,
  pending,
  editingId,
  editName,
  addChildFor,
  childName,
  childInputRef,
  card,
  tagStyle,
  xBtn,
  addTagBtn,
  actionBtn,
  dangerBtn,
  inlineInput,
  saveBtn,
  cancelBtn,
  sensors,
  onEdit,
  onEditName,
  onEditCancel,
  onSubmitEdit,
  onToggleActive,
  onDelete,
  onReorder,
  onAddChild,
  onChildNameChange,
  onSubmitChild,
  onCancelChild,
  onChildDragEnd,
}: SortableParentCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: parent.id })

  const style: CSSProperties = {
    ...card,
    opacity: isDragging ? 0.5 : parent.is_active ? 1 : 0.6,
    transform: CSS.Transform.toString(transform),
    transition,
    marginBottom: 10,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--ds-border-default)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            {...attributes}
            {...listeners}
            style={{ cursor: isDragging ? 'grabbing' : 'grab', color: 'var(--ds-text-muted)', fontSize: 16, userSelect: 'none', padding: '0 4px' }}
            title="드래그로 순서 변경"
          >
            ⠿
          </span>
          {editingId === parent.id ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input style={inlineInput} value={editName} onChange={(e) => onEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSubmitEdit(parent.id)} maxLength={24} autoFocus />
              <button type="button" style={saveBtn} disabled={pending} onClick={() => onSubmitEdit(parent.id)}>저장</button>
              <button type="button" style={cancelBtn} disabled={pending} onClick={onEditCancel}>취소</button>
            </div>
          ) : (
            <>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ds-text-primary)' }}>{parent.name}</span>
              {!parent.is_active && <span style={{ padding: '2px 8px', background: '#f3f4f6', color: '#6b7280', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>비활성</span>}
              {parent.is_active && <span style={{ padding: '2px 8px', background: '#f0fdf4', color: '#15803d', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>활성</span>}
              <span style={{ fontSize: 12, color: 'var(--ds-text-secondary)' }}>소분류 {parent.children.length}개</span>
            </>
          )}
        </div>
        {editingId !== parent.id && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" style={actionBtn} disabled={pending || tree.indexOf(parent) === 0} onClick={() => onReorder(parent.id, 'up', tree)}>▲</button>
            <button type="button" style={actionBtn} disabled={pending || tree.indexOf(parent) === tree.length - 1} onClick={() => onReorder(parent.id, 'down', tree)}>▼</button>
            <button type="button" style={actionBtn} disabled={pending} onClick={() => onEdit(parent.id, parent.name)}>수정</button>
            <button type="button" style={actionBtn} disabled={pending} onClick={() => onToggleActive(parent.id)}>{parent.is_active ? '비활성화' : '활성화'}</button>
            <button type="button" style={dangerBtn} disabled={pending} onClick={() => onDelete(parent.id, parent.name)}>삭제</button>
          </div>
        )}
      </div>

      <div style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onChildDragEnd(e, parent.children)}>
          <SortableContext items={parent.children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {parent.children.map((ch) => (
              editingId === ch.id ? (
                <div key={ch.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input style={inlineInput} value={editName} onChange={(e) => onEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSubmitEdit(ch.id)} maxLength={24} autoFocus />
                  <button type="button" style={saveBtn} disabled={pending} onClick={() => onSubmitEdit(ch.id)}>저장</button>
                  <button type="button" style={cancelBtn} disabled={pending} onClick={onEditCancel}>취소</button>
                </div>
              ) : (
                <SortableChildTag
                  key={ch.id}
                  ch={ch}
                  parent={parent}
                  pending={pending}
                  tagStyle={tagStyle}
                  xBtn={xBtn}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onReorder={onReorder}
                />
              )
            ))}
          </SortableContext>
        </DndContext>

        {addChildFor === parent.id ? (
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input
              ref={childInputRef}
              style={inlineInput}
              value={childName}
              onChange={(e) => onChildNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmitChild(parent.id)
                if (e.key === 'Escape') onCancelChild()
              }}
              placeholder="소분류 이름"
              maxLength={24}
            />
            <button type="button" style={saveBtn} disabled={pending} onClick={() => onSubmitChild(parent.id)}>저장</button>
            <button type="button" style={cancelBtn} disabled={pending} onClick={onCancelChild}>취소</button>
          </div>
        ) : (
          <button type="button" style={addTagBtn} disabled={pending} onClick={() => onAddChild(parent.id)}>+ 소분류 추가</button>
        )}
      </div>
    </div>
  )
}

type SortableChildTagProps = {
  ch: AdminCategoryNode
  parent: AdminCategoryNode
  pending: boolean
  tagStyle: CSSProperties
  xBtn: CSSProperties
  onEdit: (id: string, name: string) => void
  onDelete: (id: string, label: string) => void
  onReorder: (id: string, direction: 'up' | 'down', siblings: AdminCategoryNode[]) => void
}

function SortableChildTag({ ch, parent, pending, tagStyle, xBtn, onEdit, onDelete, onReorder }: SortableChildTagProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ch.id })
  return (
    <span
      ref={setNodeRef}
      style={{
        ...tagStyle,
        opacity: isDragging ? 0.4 : ch.is_active ? 1 : 0.5,
        transform: CSS.Transform.toString(transform),
        transition,
        cursor: 'default',
      }}
      onDoubleClick={() => onEdit(ch.id, ch.name)}
      title="더블클릭으로 수정"
    >
      <span {...attributes} {...listeners} style={{ cursor: isDragging ? 'grabbing' : 'grab', fontSize: 12, color: 'var(--ds-text-muted)', marginRight: 2 }} title="드래그">⠿</span>
      <button type="button" style={{ ...xBtn, fontSize: 10 }} disabled={pending || parent.children.indexOf(ch) === 0} onClick={() => onReorder(ch.id, 'up', parent.children)} title="위로">▲</button>
      {ch.name}
      <button type="button" style={{ ...xBtn, fontSize: 10 }} disabled={pending || parent.children.indexOf(ch) === parent.children.length - 1} onClick={() => onReorder(ch.id, 'down', parent.children)} title="아래로">▼</button>
      <button type="button" style={xBtn} disabled={pending} onClick={() => onDelete(ch.id, ch.name)} title="삭제">✕</button>
    </span>
  )
}
