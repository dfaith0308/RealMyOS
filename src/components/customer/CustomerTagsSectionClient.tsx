'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Surface } from '@/components/ui/Surface'
import { DataCell, DataTableRow } from '@/components/ui/DataTableRow'
import {
  deactivateCustomerTag,
  getCustomerTags,
  upsertCustomerTag,
} from '@/actions/customer-tags'
import styles from './CustomerTagsSectionClient.module.css'

type CategoryKey = typeof DEFAULT_CATEGORIES[number]['category']

const DEFAULT_CATEGORIES = [
  {
    category: '고객유형',
    values: ['사업자', '개인', '예비'],
  },
  {
    category: '관리등급',
    values: ['방치', '정기관리', '주력관리'],
  },
  {
    category: '유입경로',
    values: ['쿠팡', '스마트스토어', '소개', '오프라인', '기타'],
  },
  {
    category: '업종',
    values: ['고깃집', '분식', '카페', '식당', '기타'],
  },
  {
    category: '역할',
    values: ['매출처', '매입처', '둘다'],
  },
] as const

export function CustomerTagsSectionClient({ customerId }: { customerId: string }) {
  const [items, setItems] = useState<Array<{ id: string; category: string; value: string }>>(
    [],
  )
  const [category, setCategory] = useState<CategoryKey>(DEFAULT_CATEGORIES[0].category)
  const [value, setValue] = useState('')
  const [customValue, setCustomValue] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const options = useMemo(() => {
    return DEFAULT_CATEGORIES.find((c) => c.category === category)?.values ?? []
  }, [category])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const r = await getCustomerTags(customerId)
      if (!alive) return
      if (r.success && r.data) setItems(r.data)
      else setErr(r.error ?? '조회 실패')
    })()
    return () => {
      alive = false
    }
  }, [customerId])

  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ id: string; category: string; value: string }>>()
    for (const it of items) {
      const list = map.get(it.category) ?? []
      list.push(it)
      map.set(it.category, list)
    }
    const out = [...map.entries()].map(([cat, xs]) => ({
      category: cat,
      items: xs,
    }))
    out.sort((a, b) => a.category.localeCompare(b.category))
    return out
  }, [items])

  function submitValue() {
    const v = (value === '__custom__' ? customValue : value).trim()
    if (!v) {
      setErr('값을 선택하거나 입력해주세요')
      return
    }
    setErr(null)
    startTransition(async () => {
      const r = await upsertCustomerTag({ customer_id: customerId, category, value: v })
      if (!r.success) {
        setErr(r.error ?? '저장 실패')
        return
      }
      const rr = await getCustomerTags(customerId)
      if (rr.success && rr.data) setItems(rr.data)
      setValue('')
      setCustomValue('')
    })
  }

  function deactivate(id: string) {
    setErr(null)
    startTransition(async () => {
      const r = await deactivateCustomerTag(id)
      if (!r.success) {
        setErr(r.error ?? '비활성화 실패')
        return
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
          <div className={styles.meta}>Category/Value · 변경 이력 기록</div>
        </div>

        <div className={styles.controls}>
          <select
            className={styles.select}
            value={category}
            onChange={(e) => {
              const next = e.target.value as CategoryKey
              setCategory(next)
              setValue('')
              setCustomValue('')
            }}
            aria-label="카테고리"
          >
            {DEFAULT_CATEGORIES.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category}
              </option>
            ))}
          </select>

          <select
            className={styles.select}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="값"
          >
            <option value="">값 선택…</option>
            {options.map((v) => (
              <option key={`${category}-${v}`} value={v}>
                {v}
              </option>
            ))}
            <option value="__custom__">직접 입력…</option>
          </select>

          {value === '__custom__' ? (
            <input
              className={styles.input}
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              placeholder="값 직접 입력"
              aria-label="직접 입력"
            />
          ) : null}

          <button
            type="button"
            className={[styles.btn, styles.btnPrimary].join(' ')}
            onClick={submitValue}
            disabled={isPending}
          >
            추가/변경
          </button>
        </div>

        {err ? <div className={styles.err}>{err}</div> : null}

        <div className={styles.rows}>
          {items.length === 0 ? (
            <div className={styles.empty}>등록된 분류가 없습니다</div>
          ) : (
            grouped.map((g) => (
              <div key={`g-${g.category}`}>
                <div className={styles.groupHead}>
                  <div className={styles.groupTitle}>{g.category}</div>
                  <div className={styles.pill}>{g.items.length}</div>
                </div>

                {g.items.map((it) => (
                  <DataTableRow key={it.id} density="compact">
                    <DataCell>
                      <span className={styles.tagValue}>{it.value}</span>
                    </DataCell>
                    <DataCell align="end">
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        onClick={() => deactivate(it.id)}
                        disabled={isPending}
                      >
                        비활성화
                      </button>
                    </DataCell>
                  </DataTableRow>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </Surface>
  )
}

