'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Surface } from '@/components/ui/Surface'
import { DataCell, DataTableRow } from '@/components/ui/DataTableRow'
import {
  deactivateCustomerTag,
  getCustomerTags,
  upsertCustomerTag,
} from '@/actions/customer-tags'
import { getTagOptions, seedDefaultOptions } from '@/actions/customer-tag-options'
import Link from 'next/link'
import styles from './CustomerTagsSectionClient.module.css'

export function CustomerTagsSectionClient({ customerId }: { customerId: string }) {
  const [items, setItems] = useState<Array<{ id: string; category: string; value: string }>>(
    [],
  )
  const [options, setOptions] = useState<Array<{ id: string; category: string; value: string; sort_order: number }>>([])
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let alive = true
    ;(async () => {
      await seedDefaultOptions().catch(() => {})
      const opt = await getTagOptions()
      if (alive) {
        if (opt.success && opt.data) {
          setOptions(opt.data.map((o) => ({ id: o.id, category: o.category, value: o.value, sort_order: o.sort_order })))
        }
      }
      const r = await getCustomerTags(customerId)
      if (!alive) return
      if (r.success && r.data) setItems(r.data)
      else setErr(r.error ?? '조회 실패')
    })()
    return () => {
      alive = false
    }
  }, [customerId])

  const selectedByCategory = useMemo(() => {
    const m = new Map<string, { id: string; value: string }>()
    for (const it of items) m.set(it.category, { id: it.id, value: it.value })
    return m
  }, [items])

  const optionGroups = useMemo(() => {
    const m = new Map<string, Array<{ id: string; value: string; sort_order: number }>>()
    for (const o of options) {
      const list = m.get(o.category) ?? []
      list.push({ id: o.id, value: o.value, sort_order: o.sort_order })
      m.set(o.category, list)
    }
    const out = [...m.entries()].map(([category, opts]) => ({
      category,
      options: opts.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }))
    out.sort((a, b) => a.category.localeCompare(b.category))
    return out
  }, [options])

  function toggle(category: string, value: string) {
    setErr(null)
    const cur = selectedByCategory.get(category)
    startTransition(async () => {
      if (cur && cur.value === value) {
        const tag = items.find((x) => x.category === category && x.value === value)
        if (!tag) return
        const r = await deactivateCustomerTag(tag.id)
        if (!r.success) { setErr(r.error ?? '선택 해제 실패'); return }
      } else {
        const r = await upsertCustomerTag({ customer_id: customerId, category, value })
        if (!r.success) { setErr(r.error ?? '선택 실패'); return }
      }
      const rr = await getCustomerTags(customerId)
      if (rr.success && rr.data) setItems(rr.data)
    })
  }

  return (
    <Surface variant="panel" density="comfortable">
      <div className={styles.root}>
        <div className={styles.head}>
          <div className={styles.title}>분류</div>
          <div className={styles.meta}>
            Category/Value · 변경 이력 기록 ·{' '}
            <Link href="/settings/tags" style={{ color: 'var(--ds-brand-primary)', textDecoration: 'none' }}>
              ⚙️ 분류 관리
            </Link>
          </div>
        </div>

        {err ? <div className={styles.err}>{err}</div> : null}

        <div className={styles.rows}>
          {optionGroups.length === 0 ? (
            <div className={styles.empty}>분류 옵션이 없습니다. (⚙️ 분류 관리에서 추가)</div>
          ) : (
            optionGroups.map((g) => (
              <div key={`g-${g.category}`}>
                <div className={styles.groupHead}>
                  <div className={styles.groupTitle}>{g.category}</div>
                  <div className={styles.pill}>
                    {selectedByCategory.get(g.category)?.value ?? '-'}
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
                  {g.options.map((o) => {
                    const active = selectedByCategory.get(g.category)?.value === o.value
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className={[styles.btn, active ? styles.btnPrimary : ''].filter(Boolean).join(' ')}
                        onClick={() => toggle(g.category, o.value)}
                        disabled={isPending}
                      >
                        {o.value}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Surface>
  )
}

