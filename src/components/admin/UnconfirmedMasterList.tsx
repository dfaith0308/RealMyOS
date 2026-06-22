'use client'

import { useTransition } from 'react'
import { confirmMasterIngredient } from '@/actions/admin/ingredient-master'
import { useRouter } from 'next/navigation'

export default function UnconfirmedMasterList({ items }: { items: unknown[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function handleConfirm(id: string) {
    start(async () => {
      await confirmMasterIngredient(id)
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((raw) => {
        const m = raw as {
          id: string
          name: string
          spec?: string | null
          ingredient_mappings?: Array<{ price?: number | null }>
        }
        return (
          <div
            key={m.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 8,
            }}
          >
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', margin: '0 0 2px' }}>
                {m.name}
                {m.spec ? ` ${m.spec}` : ''}
              </p>
              <p style={{ fontSize: 11, color: '#92400e', margin: 0 }}>
                바코드 없음 · 이름으로만 등록됨
                {m.ingredient_mappings?.[0]?.price
                  ? ` · ${m.ingredient_mappings[0].price.toLocaleString()}원`
                  : ''}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => handleConfirm(m.id)}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: 6,
                background: '#1f5d3a',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              확정
            </button>
          </div>
        )
      })}
    </div>
  )
}
