'use client'

import { useMemo, useState, useTransition } from 'react'
import styles from './TagOptionsManagerClient.module.css'
import type { TagOptionRow } from '@/actions/customer-tag-options'
import {
  addTagCategory,
  addTagOption,
  deactivateTagCategory,
  deactivateTagOption,
  getTagOptions,
  seedDefaultOptions,
  updateTagOption,
} from '@/actions/customer-tag-options'

export default function TagOptionsManagerClient({
  initialOptions,
}: {
  initialOptions: TagOptionRow[]
}) {
  const [isPending, startTransition] = useTransition()
  const [options, setOptions] = useState<TagOptionRow[]>(initialOptions)
  const [err, setErr] = useState<string | null>(null)
  const [newCat, setNewCat] = useState('')
  const [newOptionInputs, setNewOptionInputs] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'option' | 'category'
    id?: string
    category?: string
    label: string
  } | null>(null)

  const grouped = useMemo(() => {
    const m = new Map<string, TagOptionRow[]>()
    for (const o of options) {
      const list = m.get(o.category) ?? []
      list.push(o)
      m.set(o.category, list)
    }
    const out = [...m.entries()].map(([category, items]) => ({
      category,
      items: items
        .filter((x) => x.value !== '__category__')
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }))
    out.sort((a, b) => a.category.localeCompare(b.category))
    return out
  }, [options])

  function refresh() {
    startTransition(async () => {
      const r = await getTagOptions()
      if (!r.success) {
        setErr(r.error ?? '조회 실패')
        return
      }
      setOptions(r.data ?? [])
    })
  }

  function ensureSeed() {
    setErr(null)
    startTransition(async () => {
      const r = await seedDefaultOptions()
      if (!r.success) setErr(r.error ?? 'seed 실패')
      refresh()
    })
  }

  function addCategory() {
    const c = newCat.trim()
    if (!c) return
    setErr(null)
    startTransition(async () => {
      const r = await addTagCategory(c)
      if (!r.success) {
        setErr(r.error ?? '추가 실패')
        return
      }
      setNewCat('')
      refresh()
    })
  }

  function addOption(category: string) {
    const v = (newOptionInputs[category] ?? '').trim()
    if (!v) return
    setErr(null)
    startTransition(async () => {
      const r = await addTagOption(category, v)
      if (!r.success) {
        setErr(r.error ?? '추가 실패')
        return
      }
      setNewOptionInputs((p) => ({ ...p, [category]: '' }))
      refresh()
    })
  }

  function commitEdit() {
    if (!editingId || !editingValue.trim()) return
    setErr(null)
    startTransition(async () => {
      const r = await updateTagOption(editingId, editingValue.trim())
      if (!r.success) {
        setErr(r.error ?? '수정 실패')
        return
      }
      setEditingId(null)
      setEditingValue('')
      refresh()
    })
  }

  function handleRemoveOption(id: string, label: string) {
    setConfirmDelete({ type: 'option', id, label })
  }

  function handleRemoveCategory(category: string) {
    setConfirmDelete({ type: 'category', category, label: category })
  }

  function executeDelete() {
    if (!confirmDelete) return
    setErr(null)
    startTransition(async () => {
      const r =
        confirmDelete.type === 'option'
          ? await deactivateTagOption(confirmDelete.id!)
          : await deactivateTagCategory(confirmDelete.category!)
      if (!r.success) setErr(r.error ?? '삭제 실패')
      setConfirmDelete(null)
      refresh()
    })
  }

  return (
    <div className={styles.page}>
      {confirmDelete && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalTitle}>삭제 확인</div>
            <div className={styles.modalDesc}>
              {confirmDelete.type === 'category'
                ? `"${confirmDelete.label}" 카테고리를 삭제하면 해당 분류가 적용된 거래처에서도 제거됩니다.`
                : `"${confirmDelete.label}" 옵션을 비활성화합니다.`}
            </div>
            <div className={styles.modalFoot}>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setConfirmDelete(null)}
              >
                취소
              </button>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={executeDelete}
                disabled={isPending}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.pageHead}>
        <div className={styles.pageTitle}>운영분류 관리</div>
        <div className={styles.pageSub}>
          공급자가 직접 분류 기준을 만들고 관리합니다.
          삭제 시 비활성화 처리됩니다.
        </div>
      </div>

      {err && <div className={styles.errBanner}>{err}</div>}

      <div className={styles.addCatCard}>
        <div className={styles.addCatLabel}>새 분류 카테고리 추가</div>
        <div className={styles.addCatRow}>
          <input
            className={styles.input}
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="예: 지역, 영업담당, 결제방식"
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
          />
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={addCategory}
            disabled={isPending}
          >
            + 카테고리 추가
          </button>
        </div>
      </div>

      <div className={styles.catList}>
        {grouped.length === 0 ? (
          <div className={styles.empty}>
            분류가 없습니다. 위에서 카테고리를 추가하세요.
          </div>
        ) : (
          grouped.map((g) => (
            <div key={g.category} className={styles.catCard}>
              <div className={styles.catHead}>
                <div className={styles.catName}>{g.category}</div>
                <button
                  type="button"
                  className={styles.btnDangerSm}
                  onClick={() => handleRemoveCategory(g.category)}
                  disabled={isPending}
                >
                  카테고리 삭제
                </button>
              </div>

              <div className={styles.optList}>
                {g.items.length === 0 ? (
                  <div className={styles.optEmpty}>옵션이 없습니다.</div>
                ) : (
                  g.items.map((o) => (
                    <div key={o.id} className={styles.optRow}>
                      {editingId === o.id ? (
                        <input
                          className={styles.inputSm}
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                          autoFocus
                        />
                      ) : (
                        <div className={styles.optValue}>{o.value}</div>
                      )}
                      <div className={styles.optActions}>
                        {editingId === o.id ? (
                          <>
                            <button
                              type="button"
                              className={styles.btnSm}
                              onClick={commitEdit}
                              disabled={isPending}
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              className={styles.btnGhost}
                              onClick={() => setEditingId(null)}
                            >
                              취소
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={styles.btnSm}
                              onClick={() => {
                                setEditingId(o.id)
                                setEditingValue(o.value)
                              }}
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              className={styles.btnDangerSm}
                              onClick={() => handleRemoveOption(o.id, o.value)}
                              disabled={isPending}
                            >
                              삭제
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}

                <div className={styles.addOptRow}>
                  <input
                    className={styles.inputSm}
                    value={newOptionInputs[g.category] ?? ''}
                    onChange={(e) =>
                      setNewOptionInputs((p) => ({ ...p, [g.category]: e.target.value }))
                    }
                    placeholder="새 옵션 입력"
                    onKeyDown={(e) => e.key === 'Enter' && addOption(g.category)}
                  />
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => addOption(g.category)}
                    disabled={isPending}
                  >
                    + 추가
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
