'use client'

import { useState } from 'react'
import { uploadListingImage } from '@/actions/admin/commerce'
import type { DetailFieldDef, DetailFieldValue, FaqItem, MenuExample } from '@/lib/detail-template/fields'

const LINE = '#e5e7eb'
const MUTED = '#6b7280'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const smallBtn: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: `1px solid ${LINE}`,
  background: '#fff',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

/** 화면 편집용 값 — 저장 시 서버가 normalizeFieldValue 로 한 번 더 정리한다 */
export type DraftValue = string | string[] | MenuExample[] | FaqItem[] | null

export function toDraft(def: DetailFieldDef, v: DetailFieldValue | undefined): DraftValue {
  if (v == null) {
    if (def.kind === 'text' || def.kind === 'textarea' || def.kind === 'lines') return ''
    return []
  }
  if (def.kind === 'lines' && Array.isArray(v)) return (v as string[]).join('\n')
  return v as DraftValue
}

async function uploadOne(file: File): Promise<{ url?: string; error?: string }> {
  const fd = new FormData()
  fd.set('file', file)
  const res = await uploadListingImage(fd)
  if (!res.success || !res.data) return { error: res.error ?? '업로드 실패' }
  return { url: res.data.url }
}

/**
 * 칸 하나 입력. 사진은 기존 상품 이미지와 같은 commerce-images 버킷에 올린다(전용 저장소를 만들지 않음).
 */
export default function DetailFieldInput({
  def,
  value,
  onChange,
  disabled,
}: {
  def: DetailFieldDef
  value: DraftValue
  onChange: (next: DraftValue) => void
  disabled?: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleFiles(files: FileList | null, apply: (urls: string[]) => void) {
    if (!files || files.length === 0) return
    setErr(null)
    setUploading(true)
    const urls: string[] = []
    for (const f of Array.from(files)) {
      const r = await uploadOne(f)
      if (r.error) {
        setErr(r.error)
        break
      }
      if (r.url) urls.push(r.url)
    }
    setUploading(false)
    if (urls.length) apply(urls)
  }

  if (def.kind === 'text') {
    return (
      <input
        style={inputStyle}
        value={typeof value === 'string' ? value : ''}
        maxLength={def.maxLen}
        placeholder={def.hint}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  if (def.kind === 'textarea' || def.kind === 'lines') {
    return (
      <textarea
        style={{ ...inputStyle, minHeight: def.kind === 'lines' ? 90 : 120, resize: 'vertical' }}
        value={typeof value === 'string' ? value : ''}
        placeholder={def.hint}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  if (def.kind === 'images') {
    const urls = Array.isArray(value) ? (value as string[]) : []
    return (
      <div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {urls.map((u, i) => (
            <div key={`${u}-${i}`} style={{ position: 'relative', width: 88 }}>
              <img src={u} alt="" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 8, border: `1px solid ${LINE}` }} />
              <button
                type="button"
                disabled={disabled}
                style={{ ...smallBtn, position: 'absolute', top: 2, right: 2, padding: '1px 6px' }}
                onClick={() => onChange(urls.filter((_, j) => j !== i))}
                aria-label="사진 빼기"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <label style={{ ...smallBtn, display: 'inline-block', marginTop: 8, opacity: disabled || uploading ? 0.6 : 1 }}>
          {uploading ? '올리는 중…' : '+ 사진 올리기'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            disabled={disabled || uploading}
            onChange={(e) => {
              void handleFiles(e.target.files, (added) => onChange([...urls, ...added].slice(0, def.maxLen)))
              e.target.value = ''
            }}
          />
        </label>
        <span style={{ fontSize: 11, color: MUTED, marginLeft: 8 }}>최대 {def.maxLen}장</span>
        {err ? <p style={{ fontSize: 12, color: '#b91c1c', margin: '6px 0 0' }}>{err}</p> : null}
      </div>
    )
  }

  if (def.kind === 'menu_examples') {
    const items = Array.isArray(value) ? (value as MenuExample[]) : []
    const set = (i: number, patch: Partial<MenuExample>) =>
      onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {it.image_url ? (
              <img src={it.image_url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} />
            ) : (
              <label style={{ ...smallBtn, width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
                사진
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  disabled={disabled || uploading}
                  onChange={(e) => {
                    void handleFiles(e.target.files, (added) => set(i, { image_url: added[0] }))
                    e.target.value = ''
                  }}
                />
              </label>
            )}
            <input
              style={inputStyle}
              value={it.caption ?? ''}
              maxLength={200}
              placeholder="예: 제육볶음 1인분에 20g"
              disabled={disabled}
              onChange={(e) => set(i, { caption: e.target.value })}
            />
            <button type="button" style={smallBtn} disabled={disabled} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              빼기
            </button>
          </div>
        ))}
        {items.length < def.maxLen ? (
          <button
            type="button"
            style={{ ...smallBtn, alignSelf: 'flex-start' }}
            disabled={disabled}
            onClick={() => onChange([...items, { image_url: null, caption: '' }])}
          >
            + 예시 추가
          </button>
        ) : null}
        {err ? <p style={{ fontSize: 12, color: '#b91c1c', margin: 0 }}>{err}</p> : null}
      </div>
    )
  }

  // faqs
  const faqs = Array.isArray(value) ? (value as FaqItem[]) : []
  const setFaq = (i: number, patch: Partial<FaqItem>) => onChange(faqs.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {faqs.map((f, i) => (
        <div key={i} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input style={inputStyle} value={f.q} maxLength={200} placeholder="질문" disabled={disabled} onChange={(e) => setFaq(i, { q: e.target.value })} />
          <textarea
            style={{ ...inputStyle, minHeight: 60 }}
            value={f.a}
            maxLength={1000}
            placeholder="답"
            disabled={disabled}
            onChange={(e) => setFaq(i, { a: e.target.value })}
          />
          <button type="button" style={{ ...smallBtn, alignSelf: 'flex-end' }} disabled={disabled} onClick={() => onChange(faqs.filter((_, j) => j !== i))}>
            빼기
          </button>
        </div>
      ))}
      {faqs.length < def.maxLen ? (
        <button type="button" style={{ ...smallBtn, alignSelf: 'flex-start' }} disabled={disabled} onClick={() => onChange([...faqs, { q: '', a: '' }])}>
          + 질문 추가
        </button>
      ) : null}
    </div>
  )
}
