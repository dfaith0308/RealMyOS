'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { lookupBarcode, recognizeProductFromImage } from '@/actions/barcode'
import BarcodeScanner from '@/components/product/BarcodeScanner'
import type { Category } from '@/actions/category'

export type ProductBarcodeApplyHints = {
  name?: string
  barcode?: string
  item_report_number?: string
  ingredients?: string
  categoryId?: string
  costPrice?: string
  storage_method?: string
  allergen?: string
  origin?: string
}

function matchCategoryId(categories: Category[], hint: string | null | undefined): string | undefined {
  if (!hint?.trim()) return undefined
  const t = hint.trim().toLowerCase()
  const exact = categories.find((c) => c.name.trim().toLowerCase() === t)
  if (exact) return exact.id
  return categories.find((c) => t.includes(c.name.trim().toLowerCase()) || c.name.trim().toLowerCase().includes(t))?.id
}

const box: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 16,
  marginBottom: 20,
  background: '#fafafa',
}

const title: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#374151', margin: '0 0 10px' }

export default function BarcodeLookupSection({
  categories,
  onApply,
}: {
  categories: Category[]
  onApply: (h: ProductBarcodeApplyHints) => void
}) {
  const [scanOpen, setScanOpen] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const lastDetectRef = useRef(0)

  const runLookup = useCallback(
    (code: string) => {
      const c = code.replace(/\D/g, '')
      if (c.length < 8) {
        setMsg('바코드 숫자를 8자리 이상 입력해 주세요.')
        return
      }
      setMsg(null)
      startTransition(async () => {
        const r = await lookupBarcode(c)
        if (r.ok) {
          const ingParts = [r.manufacturer ? `제조사: ${r.manufacturer}` : null, r.ingredients_text].filter(Boolean)
          onApply({
            name: r.name ?? undefined,
            barcode: r.barcode,
            item_report_number: r.item_report_number ?? undefined,
            ingredients: ingParts.length ? ingParts.join('\n\n') : r.ingredients_text ?? undefined,
            categoryId: matchCategoryId(categories, r.category),
          })
          setMsg('조회되었습니다. 내용을 확인한 뒤 저장하세요.')
          setScanOpen(false)
        } else {
          setMsg(r.error ?? '등록된 정보가 없습니다. 직접 입력해 주세요.')
          onApply({ barcode: c })
        }
      })
    },
    [categories, onApply],
  )

  const onQuaggaDetect = useCallback(
    (digits: string) => {
      const now = Date.now()
      if (now - lastDetectRef.current < 2000) return
      lastDetectRef.current = now
      runLookup(digits)
    },
    [runLookup],
  )

  function onVisionFile(file: File | undefined) {
    if (!file) return
    setMsg(null)
    const fd = new FormData()
    fd.set('image', file)
    startTransition(async () => {
      const r = await recognizeProductFromImage(fd)
      if (!r.ok || !r.data) {
        setMsg(r.error ?? '사진 인식에 실패했습니다. 직접 입력해 주세요.')
        return
      }
      const d = r.data
      const name = d.name && d.unit ? `${d.name} (${d.unit})` : d.name ?? undefined
      onApply({
        name,
        barcode: d.barcode ?? undefined,
        item_report_number: d.item_report_number ?? undefined,
        ingredients: d.ingredients_text ?? undefined,
        costPrice: d.price_won != null ? String(d.price_won) : undefined,
        storage_method: d.storage_method ?? undefined,
        allergen: d.allergen ?? undefined,
        origin: d.origin ?? undefined,
      })
      setMsg('사진에서 추출했습니다. 확인 후 저장하세요.')
      setScanOpen(false)
    })
  }

  return (
    <div style={box}>
      <p style={title}>바코드 스캔 · 사진 인식 (자동 입력)</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => {
            setScanOpen((v) => !v)
            setMsg(null)
          }}
          style={{
            padding: '8px 14px',
            background: scanOpen ? '#374151' : '#111827',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {scanOpen ? '카메라 닫기' : '카메라로 스캔'}
        </button>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          <span style={{ marginRight: 6 }}>사진으로 인식</span>
          <input
            type="file"
            accept="image/*"
            disabled={pending}
            style={{ fontSize: 12 }}
            onChange={(e) => {
              onVisionFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {scanOpen && (
        <BarcodeScanner
          active={scanOpen}
          onDetected={onQuaggaDetect}
          onInitError={(m) => setMsg(m)}
        />
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{
            flex: 1,
            minWidth: 160,
            padding: '9px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
          }}
          inputMode="numeric"
          placeholder="바코드 번호 직접 입력"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ''))}
          disabled={pending}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => runLookup(manualCode)}
          style={{
            padding: '9px 16px',
            background: pending ? '#9ca3af' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: pending ? 'not-allowed' : 'pointer',
          }}
        >
          조회
        </button>
      </div>

      {msg && (
        <p style={{ fontSize: 12, color: msg.includes('없습니다') || msg.includes('실패') ? '#b45309' : '#15803d', margin: '10px 0 0' }}>
          {msg}
        </p>
      )}
      <p style={{ fontSize: 11, color: '#9ca3af', margin: '8px 0 0' }}>
        식품안전나라 API 키는 테넌트 설정 <code>foodsafety_api_key</code> 또는 환경변수 <code>FOOD_SAFETY_API_KEY</code>입니다. 사진 인식은{' '}
        <code>ANTHROPIC_API_KEY</code>가 필요합니다.
      </p>
    </div>
  )
}
