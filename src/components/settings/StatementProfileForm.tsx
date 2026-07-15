'use client'

import { useRef, useState, useTransition } from 'react'
import {
  updateStatementProfile,
  uploadTenantStamp,
  type StatementProfile,
} from '@/actions/settings'

export default function StatementProfileForm({ initial }: { initial: StatementProfile }) {
  const [isPending, startTransition] = useTransition()
  const [values, setValues] = useState<StatementProfile>(initial)
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function showToast(text: string, kind: 'success' | 'error') {
    setToast({ text, kind })
    window.setTimeout(() => setToast(null), 2800)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await updateStatementProfile(values)
      if (result.success) showToast('거래명세서 설정이 저장되었습니다', 'success')
      else showToast(result.error ?? '저장 실패', 'error')
    })
  }

  function handleUpload(file: File | null) {
    if (!file) return
    const fd = new FormData()
    fd.set('file', file)
    startTransition(async () => {
      const result = await uploadTenantStamp(fd)
      if (result.success && result.data?.url) {
        setValues((prev) => ({ ...prev, stamp_image_url: result.data!.url }))
        showToast('도장 이미지가 업로드되었습니다', 'success')
      } else {
        showToast(result.error ?? '업로드 실패', 'error')
      }
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  return (
    <>
      {toast ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            padding: '12px 20px',
            borderRadius: 10,
            background: toast.kind === 'success' ? '#15803d' : '#dc2626',
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          }}
        >
          {toast.text}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} style={sec.wrap}>
        <div style={sec.title}>거래명세서 설정</div>
        <div style={sec.body}>
          <div style={f.row}>
            <div style={f.labelCol}>
              <span style={f.label}>도장 이미지</span>
              <span style={{ fontSize: 11, color: '#6b7280' }}>JPG/PNG/WEBP, 2MB 이하</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, width: 220 }}>
              {values.stamp_image_url ? (
                <img
                  src={values.stamp_image_url}
                  alt="도장 미리보기"
                  style={{ width: 72, height: 72, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}
                />
              ) : (
                <div style={{ width: 72, height: 72, border: '1px dashed #d1d5db', borderRadius: 8, fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  없음
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={isPending}
                onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
                style={{ fontSize: 12, maxWidth: 220 }}
              />
            </div>
          </div>

          <Field
            label="은행명"
            value={values.bank_name}
            onChange={(v) => setValues((prev) => ({ ...prev, bank_name: v }))}
            placeholder="예: 국민은행"
          />
          <Field
            label="계좌번호"
            value={values.bank_account}
            onChange={(v) => setValues((prev) => ({ ...prev, bank_account: v }))}
            placeholder="예: 123456-78-901234"
          />
          <Field
            label="예금주"
            value={values.bank_holder}
            onChange={(v) => setValues((prev) => ({ ...prev, bank_holder: v }))}
            placeholder="예: (주)식식이푸드"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 16px' }}>
            <button type="submit" disabled={isPending} style={isPending ? s.btnOff : s.btn}>
              저장
            </button>
          </div>
        </div>
      </form>
    </>
  )
}

function Field(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div style={f.row}>
      <div style={f.labelCol}>
        <span style={f.label}>{props.label}</span>
      </div>
      <div style={{ flexShrink: 0, width: 220 }}>
        <input
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          style={f.input}
        />
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  btn: {
    padding: '10px 18px',
    background: '#111827',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
  },
  btnOff: {
    padding: '10px 18px',
    background: '#9ca3af',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 800,
    cursor: 'not-allowed',
  },
}

const sec: Record<string, React.CSSProperties> = {
  wrap: { border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' },
  title: {
    padding: '10px 16px',
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
    letterSpacing: '0.04em',
  },
  body: { display: 'flex', flexDirection: 'column' },
}

const f: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid #f3f4f6',
    gap: 16,
  },
  labelCol: { display: 'flex', flexDirection: 'column', gap: 3, flex: 1 },
  label: { fontSize: 13, fontWeight: 600, color: '#111827' },
  input: {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 10,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
}
