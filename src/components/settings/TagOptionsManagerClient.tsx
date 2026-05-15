'use client'

import { useMemo, useState, useTransition } from 'react'
import { Surface } from '@/components/ui/Surface'
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
    const v = prompt(`${category} — 새 옵션값`)?.trim()
    if (!v) return
    setErr(null)
    startTransition(async () => {
      const r = await addTagOption(category, v)
      if (!r.success) setErr(r.error ?? '추가 실패')
      refresh()
    })
  }

  function editOption(id: string, before: string) {
    const v = prompt(`옵션 수정`, before)?.trim()
    if (!v || v === before) return
    setErr(null)
    startTransition(async () => {
      const r = await updateTagOption(id, v)
      if (!r.success) setErr(r.error ?? '수정 실패')
      refresh()
    })
  }

  function removeOption(id: string) {
    if (!confirm('이 옵션을 비활성화하시겠습니까?')) return
    setErr(null)
    startTransition(async () => {
      const r = await deactivateTagOption(id)
      if (!r.success) setErr(r.error ?? '삭제 실패')
      refresh()
    })
  }

  function removeCategory(category: string) {
    if (
      !confirm(
        `이 카테고리를 삭제(비활성화)하면 해당 분류가 적용된 거래처에서도 모두 제거됩니다. 계속하시겠습니까?\n\n- ${category}`,
      )
    )
      return
    setErr(null)
    startTransition(async () => {
      const r = await deactivateTagCategory(category)
      if (!r.success) setErr(r.error ?? '삭제 실패')
      refresh()
    })
  }

  return (
    <Surface variant="panel" density="comfortable">
      <div className={styles.root}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.title}>옵션 관리</div>
            <div className={styles.meta}>is_active=false로만 비활성화합니다.</div>
          </div>
          <div className={styles.topBar}>
            <button
              type="button"
              className={styles.btn}
              onClick={ensureSeed}
              disabled={isPending}
            >
              기본 시드 적용
            </button>
            <button
              type="button"
              className={[styles.btn, styles.btnPrimary].join(' ')}
              onClick={refresh}
              disabled={isPending}
            >
              새로고침
            </button>
          </div>
        </div>

        <div className={styles.topBar} style={{ marginTop: 8 }}>
          <input
            className={styles.input}
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="새 카테고리명"
          />
          <button
            type="button"
            className={[styles.btn, styles.btnPrimary].join(' ')}
            onClick={addCategory}
            disabled={isPending}
          >
            + 새 카테고리 추가
          </button>
        </div>

        {err ? <div className={styles.err}>{err}</div> : null}

        <div className={styles.categoryBlock}>
          {grouped.length === 0 ? (
            <div className={styles.muted} style={{ padding: 12 }}>
              활성 옵션이 없습니다.
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.category}>
                <div className={styles.categoryHead}>
                  <div className={styles.catName}>{g.category}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className={styles.btn}
                      onClick={() => addOption(g.category)}
                      disabled={isPending}
                    >
                      + 옵션 추가
                    </button>
                    <button
                      type="button"
                      className={[styles.btn, styles.btnDanger].join(' ')}
                      onClick={() => removeCategory(g.category)}
                      disabled={isPending}
                    >
                      삭제
                    </button>
                  </div>
                </div>

                {g.items.length === 0 ? (
                  <div className={styles.row}>
                    <div className={styles.muted}>옵션이 없습니다.</div>
                    <button
                      type="button"
                      className={styles.btn}
                      onClick={() => addOption(g.category)}
                      disabled={isPending}
                    >
                      + 옵션 추가
                    </button>
                  </div>
                ) : (
                  g.items.map((o) => (
                    <div key={o.id} className={styles.row}>
                      <div className={styles.rowLeft}>
                        <div className={styles.opt}>{o.value}</div>
                        <div className={styles.muted}>
                          sort {o.sort_order} · {String(o.updated_at).slice(0, 16).replace('T', ' ')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className={styles.btn}
                          onClick={() => editOption(o.id, o.value)}
                          disabled={isPending}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className={[styles.btn, styles.btnDanger].join(' ')}
                          onClick={() => removeOption(o.id)}
                          disabled={isPending}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </Surface>
  )
}

