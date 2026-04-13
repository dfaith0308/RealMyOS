'use client'

// ============================================================
// RealMyOS - 상품 목록 + 인라인 수정
// src/components/product/ProductList.tsx
// ============================================================

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateProduct } from '@/actions/product'

interface Product {
  id: string
  product_code: string
  name: string
  tax_type: 'taxable' | 'exempt'
  cost_price: number
  selling_price: number
}

export default function ProductList({ products }: { products: Product[] }) {
  if (products.length === 0)
    return <p style={{ color: '#9ca3af', fontSize: 14 }}>등록된 상품이 없습니다.</p>

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
          <th style={th}>코드</th>
          <th style={th}>상품명</th>
          <th style={{ ...th, textAlign: 'right' }}>매입가</th>
          <th style={{ ...th, textAlign: 'right' }}>판매가</th>
          <th style={th}>과세</th>
          <th style={th}></th>
        </tr>
      </thead>
      <tbody>
        {products.map((p) => <ProductRow key={p.id} product={p} />)}
      </tbody>
    </table>
  )
}

function ProductRow({ product }: { product: Product }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(product.name)
  const [taxType, setTaxType] = useState<'taxable' | 'exempt'>(product.tax_type)
  const [costPrice, setCostPrice] = useState(String(product.cost_price))
  const [sellingPrice, setSellingPrice] = useState(String(product.selling_price))
  const [error, setError] = useState<string | null>(null)

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const result = await updateProduct({
        id: product.id,
        name,
        tax_type: taxType,
        cost_price: Number(costPrice) || undefined,
        selling_price: Number(sellingPrice) || undefined,
      })
      if (result.success) {
        setEditing(false)
      } else {
        setError(result.error ?? '저장 실패')
      }
    })
  }

  function handleCancel() {
    setName(product.name)
    setTaxType(product.tax_type)
    setCostPrice(String(product.cost_price))
    setSellingPrice(String(product.selling_price))
    setError(null)
    setEditing(false)
  }

  if (editing) {
    return (
      <>
        <tr style={{ borderBottom: '1px solid #e0e7ff', background: '#f8f9ff' }}>
          <td style={{ ...td, color: '#9ca3af', fontFamily: 'monospace', fontSize: 12 }}>
            {product.product_code}
          </td>
          <td style={td}>
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </td>
          <td style={{ ...td, textAlign: 'right' }}>
            <input
              style={{ ...inputStyle, width: 90, textAlign: 'right' }}
              type="number"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
            />
          </td>
          <td style={{ ...td, textAlign: 'right' }}>
            <input
              style={{ ...inputStyle, width: 90, textAlign: 'right' }}
              type="number"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
            />
          </td>
          <td style={td}>
            {/* 세그먼트 버튼 */}
            <div style={seg.wrap}>
              <button
                type="button"
                style={taxType === 'taxable' ? seg.active : seg.btn}
                onClick={() => setTaxType('taxable')}
              >
                과세
              </button>
              <button
                type="button"
                style={taxType === 'exempt' ? seg.active : seg.btn}
                onClick={() => setTaxType('exempt')}
              >
                면세
              </button>
            </div>
          </td>
          <td style={td}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={saveBtn} onClick={handleSave} disabled={isPending}>
                {isPending ? '저장 중' : '저장'}
              </button>
              <button style={cancelBtn} onClick={handleCancel}>취소</button>
            </div>
          </td>
        </tr>
        {error && (
          <tr>
            <td colSpan={6} style={{ padding: '4px 12px', color: '#DC2626', fontSize: 12 }}>
              {error}
            </td>
          </tr>
        )}
      </>
    )
  }

  return (
    <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
      <td style={{ ...td, color: '#9ca3af', fontFamily: 'monospace', fontSize: 12 }}>
        {product.product_code}
      </td>
      <td style={td}>{product.name}</td>
      <td style={{ ...td, textAlign: 'right' }}>
        {product.cost_price ? product.cost_price.toLocaleString() + '원' : '-'}
      </td>
      <td style={{ ...td, textAlign: 'right' }}>
        {product.selling_price ? product.selling_price.toLocaleString() + '원' : '-'}
      </td>
      <td style={{ ...td, color: '#6b7280' }}>
        {product.tax_type === 'taxable' ? '과세' : '면세'}
      </td>
      <td style={td}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={editBtn} onClick={() => setEditing(true)}>수정</button>
          <button style={copyBtn} onClick={() => router.push(`/products/new?copyId=${product.id}`)}>복사</button>
        </div>
      </td>
    </tr>
  )
}

// ── 스타일 ───────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left',
  fontSize: 11, fontWeight: 500, color: '#6b7280', background: '#f9fafb',
}
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const inputStyle: React.CSSProperties = {
  padding: '5px 8px', border: '1px solid #d1d5db',
  borderRadius: 6, fontSize: 13, width: '100%',
  outline: 'none', boxSizing: 'border-box',
}
const seg = {
  wrap: { display: 'flex', border: '1px solid #d1d5db', borderRadius: 6, overflow: 'hidden' } as React.CSSProperties,
  btn:  { flex: 1, padding: '4px 8px', border: 'none', borderRight: '1px solid #d1d5db', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#374151' } as React.CSSProperties,
  active: { flex: 1, padding: '4px 8px', border: 'none', borderRight: '1px solid #d1d5db', background: '#111827', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 500 } as React.CSSProperties,
}
const editBtn: React.CSSProperties = {
  padding: '4px 10px', background: '#f3f4f6',
  border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, color: '#374151', cursor: 'pointer',
}
const saveBtn: React.CSSProperties = {
  padding: '4px 10px', background: '#111827',
  border: 'none', borderRadius: 6, fontSize: 12, color: '#fff', cursor: 'pointer',
}
const copyBtn: React.CSSProperties = {
  padding: '4px 10px', background: '#EFF6FF',
  border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 12, color: '#2563EB', cursor: 'pointer',
}
const cancelBtn: React.CSSProperties = {
  padding: '4px 10px', background: '#fff',
  border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, color: '#374151', cursor: 'pointer',
}