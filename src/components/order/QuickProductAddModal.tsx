'use client'

import { useState, useTransition } from 'react'
import { createProductQuick } from '@/actions/product'
import type { ProductForOrder } from '@/types/order'

interface Props {
  onClose: () => void
  onCreated: (product: ProductForOrder) => void
  initialName?: string
}

export default function QuickProductAddModal({ onClose, onCreated, initialName = '' }: Props) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(initialName)
  const [costPrice, setCostPrice] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [unit, setUnit] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    setError(null)
    const trimmedName = name.trim()
    const cost = parseInt(costPrice.replace(/[^0-9]/g, ''), 10)
    if (!trimmedName) {
      setError('상품명을 입력해주세요.')
      return
    }
    if (!cost || cost <= 0) {
      setError('매입가를 입력해주세요.')
      return
    }

    const saleRaw = salePrice.replace(/[^0-9]/g, '')
    const sale = saleRaw ? parseInt(saleRaw, 10) : null

    startTransition(async () => {
      const res = await createProductQuick({
        name: trimmedName,
        cost_price: cost,
        sale_price: sale,
        unit: unit.trim() || null,
      })

      if (!res.success || !res.product) {
        setError(res.error ?? '상품 등록에 실패했습니다.')
        return
      }

      onCreated(res.product)
    })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 400,
        padding: 16,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          padding: '24px 22px',
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>빠른 상품 등록</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              color: '#9ca3af',
              cursor: 'pointer',
              lineHeight: 1,
            }}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
          등록 즉시 주문에 추가됩니다. 상세 정보는 나중에 상품 관리에서 수정할 수 있어요.
        </p>

        {error && (
          <div
            style={{
              background: '#FEF2F2',
              color: '#DC2626',
              border: '1px solid #FECACA',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="상품명 *">
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 국내산 고춧가루 1kg"
              autoFocus
            />
          </Field>

          <Field label="매입가 *">
            <input
              style={inputStyle}
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="원"
              inputMode="numeric"
            />
          </Field>

          <Field label="판매가">
            <input
              style={inputStyle}
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="선택 입력"
              inputMode="numeric"
            />
          </Field>

          <Field label="단위">
            <input
              style={inputStyle}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="예: kg, L, 개"
            />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            style={{
              padding: '10px 16px',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              background: '#fff',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            style={{
              padding: '10px 18px',
              border: 'none',
              borderRadius: 8,
              background: isPending ? '#9ca3af' : '#111827',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {isPending ? '등록 중...' : '등록 후 추가'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}
