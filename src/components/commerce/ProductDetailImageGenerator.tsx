'use client'

import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { extractPureProductName } from '@/lib/commerce-utils'

interface Props {
  productName: string
  brandName: string
  spec: string
  salePrice: number
  weightGrams?: number
  origin: string
  storageMethod: string
  minOrderQty: number
  packageUnit: string
  usageDesc: string
  allergen: string
  ingredients?: string
  aiStrengths?: string
  aiUsage?: string
  aiSummary?: string
  thumbnailUrl?: string
  onGenerated: (file: File) => void
}

export default function ProductDetailImageGenerator(props: Props) {
  const templateRef = useRef<HTMLDivElement>(null)
  const [generating, setGenerating] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  const pricePerHundredG =
    props.weightGrams && props.weightGrams > 0
      ? Math.round((props.salePrice / props.weightGrams) * 100)
      : null

  const pureProductName = extractPureProductName(
    props.productName,
    props.brandName || null,
    props.spec || null,
  )

  async function handleGenerate() {
    if (!templateRef.current) return
    setGenerating(true)
    try {
      const canvas = await html2canvas(templateRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: 800,
      })
      const dataUrl = canvas.toDataURL('image/png')
      setPreview(dataUrl)

      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], `detail-${Date.now()}.png`, { type: 'image/png' })
      props.onGenerated(file)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating}
        style={{
          padding: '10px 20px',
          background: '#1f5d3a',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          cursor: generating ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          marginBottom: 16,
        }}
      >
        {generating ? '생성 중...' : '✨ 상세이미지 자동생성'}
      </button>

      {preview && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: '#1f5d3a', fontWeight: 600, margin: '0 0 8px' }}>
            ✓ 생성 완료 — 저장 시 자동 업로드됩니다
          </p>
          <img
            src={preview}
            alt="생성된 상세이미지"
            style={{ width: '100%', borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
        </div>
      )}

      <div
        ref={templateRef}
        style={{
          width: 800,
          background: '#ffffff',
          fontFamily: 'Apple SD Gothic Neo, Noto Sans KR, sans-serif',
          position: 'absolute',
          left: '-9999px',
          top: '-9999px',
        }}
      >
        <div
          style={{
            background: '#f7f6f2',
            padding: '32px 40px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 8px', fontWeight: 500 }}>
              바쁜 사장님을 위한
            </p>
            <p style={{ fontSize: 36, fontWeight: 900, color: '#2b2b2b', margin: '0 0 4px', lineHeight: 1.2 }}>
              핵심 <span style={{ color: '#e63329' }}>포인트!</span>
            </p>
          </div>
          {props.thumbnailUrl && (
            <img
              src={props.thumbnailUrl}
              alt=""
              crossOrigin="anonymous"
              style={{ width: 180, height: 180, objectFit: 'contain' }}
            />
          )}
        </div>

        <div style={{ background: '#1f5d3a', padding: '12px 40px' }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', margin: 0 }}>
            {props.brandName ? `${props.brandName} ` : ''}
            {pureProductName}
          </p>
        </div>

        <div style={{ background: '#f7f6f2', padding: '20px 40px', display: 'flex', gap: 16 }}>
          {props.spec && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#2b2b2b',
                borderRadius: 6,
                padding: '6px 14px',
              }}
            >
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>규격</span>
              <span style={{ fontSize: 14, color: '#fff' }}>{props.spec}</span>
            </div>
          )}
          {props.minOrderQty > 1 && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#2b2b2b',
                borderRadius: 6,
                padding: '6px 14px',
              }}
            >
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>최소주문</span>
              <span style={{ fontSize: 14, color: '#fff' }}>{props.minOrderQty}개</span>
            </div>
          )}
          {props.packageUnit && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#2b2b2b',
                borderRadius: 6,
                padding: '6px 14px',
              }}
            >
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>포장</span>
              <span style={{ fontSize: 14, color: '#fff' }}>{props.packageUnit}</span>
            </div>
          )}
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '24px 40px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>💰</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#2b2b2b' }}>
              {props.salePrice.toLocaleString()}원
            </span>
            {pricePerHundredG && (
              <span style={{ fontSize: 14, color: '#6b7280' }}>
                / 100g당 {pricePerHundredG.toLocaleString()}원
              </span>
            )}
          </div>
          {props.origin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>📦</span>
              <span style={{ fontSize: 15, color: '#2b2b2b' }}>
                원산지: <strong>{props.origin}</strong>
              </span>
            </div>
          )}
          {props.storageMethod && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>🧊</span>
              <span style={{ fontSize: 15, color: '#2b2b2b' }}>
                보관: <strong>{props.storageMethod}</strong>
              </span>
            </div>
          )}
          {props.allergen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <span style={{ fontSize: 15, color: '#2b2b2b' }}>
                알레르기: <strong>{props.allergen}</strong>
              </span>
            </div>
          )}
        </div>

        {(props.aiSummary || props.aiStrengths || props.aiUsage) && (
          <div style={{ padding: '20px 40px', borderTop: '1px solid #e5e7eb' }}>
            {props.aiSummary && (
              <div style={{ padding: '14px 18px', background: '#1f5d3a', borderRadius: 8, marginBottom: 10 }}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px' }}>식식이 한줄평</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>{props.aiSummary}</p>
              </div>
            )}
            {props.aiStrengths && (
              <div style={{ padding: '14px 18px', background: '#f0f7f3', borderRadius: 8, marginBottom: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#1f5d3a', margin: '0 0 6px' }}>특징 및 강점</p>
                <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.6 }}>{props.aiStrengths}</p>
              </div>
            )}
            {props.aiUsage && (
              <div style={{ padding: '14px 18px', background: '#f7f6f2', borderRadius: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', margin: '0 0 6px' }}>활용 메뉴</p>
                <p style={{ fontSize: 14, color: '#374151', margin: 0 }}>{props.aiUsage}</p>
              </div>
            )}
          </div>
        )}

        {props.usageDesc && (
          <div
            style={{
              background: '#e8e8e8',
              padding: '14px 40px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                background: '#2b2b2b',
                color: '#fff',
                padding: '3px 10px',
                borderRadius: 4,
              }}
            >
              용도
            </span>
            <span style={{ fontSize: 15, color: '#2b2b2b' }}>{props.usageDesc}</span>
          </div>
        )}
      </div>
    </div>
  )
}
