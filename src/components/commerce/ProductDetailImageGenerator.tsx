'use client'

import { useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { AlertTriangle, Check, ImagePlus, MapPin, Snowflake, Tag, Utensils } from 'lucide-react'
import { extractPureProductName } from '@/lib/commerce-utils'

/** 브랜드 그린 계열 — 상세이미지 전반에서 이 팔레트만 사용한다 */
const BRAND = '#1f5d3a'
const BRAND_SOFT = '#f0f7f3'
const SURFACE = '#f7f6f2'
const INK = '#2b2b2b'
const MUTED = '#6b7280'
const LINE = '#e5e7eb'

const ICON_SIZE = 18
const ICON_STROKE = 2

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
  /** 고객 노출 설명 — 값이 있을 때만 별도 섹션으로 표시 */
  description?: string
  /** public/product-detail-photos/ 안의 사진 URL 목록. 비어 있으면 사진 영역을 넣지 않는다 */
  detailPhotoUrls?: string[]
  onGenerated: (file: File) => void
}

/** 아이콘 + 라벨 + 값 한 줄 */
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ display: 'inline-flex', width: ICON_SIZE, height: ICON_SIZE }}>{icon}</span>
      <span style={{ fontSize: 15, color: INK }}>
        <span style={{ color: MUTED }}>{label}</span> <strong>{value}</strong>
      </span>
    </div>
  )
}

/** 규격 · 최소주문 · 포장 칩 */
function SpecChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: INK,
        borderRadius: 6,
        padding: '6px 14px',
      }}
    >
      <span style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 14, color: '#fff' }}>{value}</span>
    </div>
  )
}

export default function ProductDetailImageGenerator(props: Props) {
  const templateRef = useRef<HTMLDivElement>(null)
  const [generating, setGenerating] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  /**
   * 폴더에 사진이 있으면 1장을 무작위로 고른다.
   * SSR/CSR 결과가 어긋나지 않도록 마운트 이후에 고르고, 목록이 바뀌면 다시 고른다.
   */
  const photoKey = (props.detailPhotoUrls ?? []).join('|')
  const [randomPhotoUrl, setRandomPhotoUrl] = useState<string | null>(null)
  useEffect(() => {
    const list = photoKey ? photoKey.split('|') : []
    setRandomPhotoUrl(list.length > 0 ? list[Math.floor(Math.random() * list.length)] : null)
  }, [photoKey])

  const pricePerHundredG =
    props.weightGrams && props.weightGrams > 0
      ? Math.round((props.salePrice / props.weightGrams) * 100)
      : null

  const pureProductName = extractPureProductName(
    props.productName,
    props.brandName || null,
    props.spec || null,
  )

  const ingredients = (props.ingredients ?? '').trim()
  const description = (props.description ?? '').trim()
  const hasAiBlock = Boolean(props.aiSummary || props.aiStrengths || props.aiUsage)

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
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          background: BRAND,
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
        <ImagePlus size={16} strokeWidth={ICON_STROKE} color="#ffffff" aria-hidden />
        {generating ? '생성 중...' : '상세이미지 자동생성'}
      </button>

      {preview && (
        <div style={{ marginBottom: 16 }}>
          <p
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: BRAND,
              fontWeight: 600,
              margin: '0 0 8px',
            }}
          >
            <Check size={14} strokeWidth={ICON_STROKE} color={BRAND} aria-hidden />
            생성 완료 — 저장 시 자동 업로드됩니다
          </p>
          <img
            src={preview}
            alt="생성된 상세이미지"
            style={{ width: '100%', borderRadius: 8, border: '1px solid ' + LINE }}
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
        {/* 상단 — 상품 이미지 영역 (무작위 사진 + 대표 썸네일) */}
        <div
          style={{
            background: SURFACE,
            padding: '32px 40px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <p style={{ fontSize: 13, color: MUTED, margin: '0 0 8px', fontWeight: 500 }}>상품 정보</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: INK, margin: 0, lineHeight: 1.25 }}>
              {pureProductName}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {randomPhotoUrl && (
              <img
                src={randomPhotoUrl}
                alt=""
                style={{ width: 180, height: 180, objectFit: 'cover', borderRadius: 8 }}
              />
            )}
            {props.thumbnailUrl && (
              <img
                src={props.thumbnailUrl}
                alt=""
                crossOrigin="anonymous"
                style={{ width: 180, height: 180, objectFit: 'contain' }}
              />
            )}
          </div>
        </div>

        <div style={{ background: BRAND, padding: '12px 40px' }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', margin: 0 }}>
            {props.brandName ? props.brandName + ' ' : ''}
            {pureProductName}
          </p>
        </div>

        <div style={{ background: SURFACE, padding: '20px 40px', display: 'flex', gap: 16 }}>
          {props.spec && <SpecChip label="규격" value={props.spec} />}
          {props.minOrderQty > 1 && <SpecChip label="최소주문" value={props.minOrderQty + '개'} />}
          {props.packageUnit && <SpecChip label="포장" value={props.packageUnit} />}
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
            <span style={{ display: 'inline-flex', width: ICON_SIZE, height: ICON_SIZE }}>
              <Tag size={ICON_SIZE} strokeWidth={ICON_STROKE} color={BRAND} aria-hidden />
            </span>
            <span style={{ fontSize: 18, fontWeight: 800, color: INK }}>
              {props.salePrice.toLocaleString()}원
            </span>
            {pricePerHundredG && (
              <span style={{ fontSize: 14, color: MUTED }}>
                / 100g당 {pricePerHundredG.toLocaleString()}원
              </span>
            )}
          </div>
          {props.origin && (
            <InfoRow
              icon={<MapPin size={ICON_SIZE} strokeWidth={ICON_STROKE} color={BRAND} aria-hidden />}
              label="원산지"
              value={props.origin}
            />
          )}
          {props.storageMethod && (
            <InfoRow
              icon={<Snowflake size={ICON_SIZE} strokeWidth={ICON_STROKE} color={BRAND} aria-hidden />}
              label="보관"
              value={props.storageMethod}
            />
          )}
          {props.allergen && (
            <InfoRow
              icon={
                <AlertTriangle size={ICON_SIZE} strokeWidth={ICON_STROKE} color={BRAND} aria-hidden />
              }
              label="알레르기"
              value={props.allergen}
            />
          )}
        </div>

        {/* 원재료명 및 함량 — 표기 항목이라 값이 있으면 그대로 노출 */}
        {ingredients && (
          <div style={{ padding: '20px 40px', borderTop: '1px solid ' + LINE }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: BRAND, margin: '0 0 8px' }}>
              원재료명 및 함량
            </p>
            <p
              style={{
                fontSize: 14,
                color: '#374151',
                margin: 0,
                lineHeight: 1.7,
                wordBreak: 'keep-all',
              }}
            >
              {ingredients}
            </p>
          </div>
        )}

        {/* 부가설명 — 고객 노출 설명(description) */}
        {description && (
          <div style={{ padding: '20px 40px', borderTop: '1px solid ' + LINE }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: BRAND, margin: '0 0 8px' }}>부가설명</p>
            <p
              style={{
                fontSize: 14,
                color: '#374151',
                margin: 0,
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
              }}
            >
              {description}
            </p>
          </div>
        )}

        {hasAiBlock && (
          <div style={{ padding: '20px 40px', borderTop: '1px solid ' + LINE }}>
            {props.aiSummary && (
              <div
                style={{ padding: '14px 18px', background: BRAND, borderRadius: 8, marginBottom: 10 }}
              >
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px' }}>
                  식식이 한줄평
                </p>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>
                  {props.aiSummary}
                </p>
              </div>
            )}
            {props.aiStrengths && (
              <div
                style={{
                  padding: '14px 18px',
                  background: BRAND_SOFT,
                  borderRadius: 8,
                  marginBottom: 10,
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 800, color: BRAND, margin: '0 0 6px' }}>
                  특징 및 강점
                </p>
                <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.6 }}>
                  {props.aiStrengths}
                </p>
              </div>
            )}
            {props.aiUsage && (
              <div style={{ padding: '14px 18px', background: SURFACE, borderRadius: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: MUTED, margin: '0 0 6px' }}>
                  활용 메뉴
                </p>
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
            <span style={{ display: 'inline-flex', width: ICON_SIZE, height: ICON_SIZE }}>
              <Utensils size={ICON_SIZE} strokeWidth={ICON_STROKE} color={INK} aria-hidden />
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                background: INK,
                color: '#fff',
                padding: '3px 10px',
                borderRadius: 4,
              }}
            >
              용도
            </span>
            <span style={{ fontSize: 15, color: INK }}>{props.usageDesc}</span>
          </div>
        )}

        {/* 향후 사용 패턴 데이터 자리 — 현재는 플레이스홀더 */}
        <div
          style={{
            padding: '16px 40px',
            borderTop: '1px solid ' + LINE,
            background: SURFACE,
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 12, color: MUTED, margin: 0, letterSpacing: '-0.01em' }}>
            실사용 데이터 수집 중 · 곧 공개됩니다
          </p>
        </div>
      </div>
    </div>
  )
}
