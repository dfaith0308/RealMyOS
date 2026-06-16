'use client'

import { useState, useTransition } from 'react'
import { updateCompanyProfile, type CompanyProfile } from '@/actions/settings'

export default function CompanyProfileForm({ initial }: { initial: CompanyProfile }) {
  const [isPending, startTransition] = useTransition()
  const [values, setValues] = useState<CompanyProfile>(initial)
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null)

  function showToast(text: string, kind: 'success' | 'error') {
    setToast({ text, kind })
    window.setTimeout(() => setToast(null), 2800)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.name.trim()) {
      showToast('회사명을 입력해 주세요', 'error')
      return
    }

    startTransition(async () => {
      const result = await updateCompanyProfile({
        name: values.name,
        representative_name: values.representative_name,
        contact_phone: values.contact_phone,
      })
      if (result.success) {
        showToast('회사 프로필이 저장되었습니다', 'success')
      } else {
        showToast(result.error ?? '저장 실패', 'error')
      }
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
        <div style={sec.title}>회사 프로필</div>
        <div style={sec.body}>
          <Field
            label="회사명"
            required
            value={values.name}
            onChange={(v) => setValues((prev) => ({ ...prev, name: v }))}
            placeholder="예: (주)식식이푸드"
          />
          <Field
            label="대표자명"
            value={values.representative_name}
            onChange={(v) => setValues((prev) => ({ ...prev, representative_name: v }))}
            placeholder="예: 홍길동"
          />
          <Field
            label="연락처"
            value={values.contact_phone}
            onChange={(v) => setValues((prev) => ({ ...prev, contact_phone: v }))}
            placeholder="예: 010-1234-5678"
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
  required?: boolean
}) {
  return (
    <div style={f.row}>
      <div style={f.labelCol}>
        <span style={f.label}>
          {props.label}
          {props.required ? <span style={{ color: '#dc2626' }}> *</span> : null}
        </span>
      </div>
      <div style={{ flexShrink: 0, width: 220 }}>
        <input
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          required={props.required}
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
