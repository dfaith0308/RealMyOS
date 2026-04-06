'use client'

import { useState, useTransition } from 'react'
import { saveSettings } from '@/actions/settings'
import type { TenantSettings } from '@/constants/settings'

export default function SettingsForm({ initial }: { initial: TenantSettings }) {
  const [isPending, startTransition] = useTransition()
  const [values, setValues] = useState<TenantSettings>(initial)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function set(key: keyof TenantSettings, raw: string) {
    const n = parseFloat(raw)
    if (!isNaN(n)) setValues((prev) => ({ ...prev, [key]: n }))
    else if (raw === '') setValues((prev) => ({ ...prev, [key]: 0 }))
    setSuccess(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await saveSettings(values)
      if (result.success) setSuccess(true)
      else setError(result.error ?? '저장 실패')
    })
  }

  return (
    <form onSubmit={handleSubmit} style={s.form}>
      {error   && <div style={s.err}>{error}</div>}
      {success && <div style={s.ok}>✓ 저장되었습니다.</div>}

      <Section title="세금">
        <Field
          label="부가세율 (%)"
          hint="기본 10. 면세 상품은 개별 설정."
          value={values.vat_rate}
          onChange={(v) => set('vat_rate', v)}
          suffix="%"
        />
      </Section>

      <Section title="주문">
        <Field
          label="주문 수정 잠금 기간"
          hint="이 기간 이후 주문은 관리자 승인 없이 수정 불가."
          value={values.order_edit_lock_days}
          onChange={(v) => set('order_edit_lock_days', v)}
          suffix="일"
        />
      </Section>

      <Section title="마진">
        <Field
          label="마진 경고 기준"
          hint="평균 마진율이 이 값 미만이면 상품 목록에서 빨간색 표시."
          value={values.margin_warning_threshold}
          onChange={(v) => set('margin_warning_threshold', v)}
          suffix="%"
        />
      </Section>

      <Section title="거래처 상태 판단">
        <Field
          label="신규 거래처 기간"
          hint="첫 거래 후 이 기간 이내인 거래처를 '신규'로 표시."
          value={values.new_customer_days}
          onChange={(v) => set('new_customer_days', v)}
          suffix="일"
        />
        <Field
          label="주의 기준 (마지막 주문 경과일)"
          hint="마지막 주문일로부터 이 일수가 지나면 '주의' 상태."
          value={values.warning_days}
          onChange={(v) => set('warning_days', v)}
          suffix="일"
        />
        <Field
          label="위험 기준 (마지막 주문 경과일)"
          hint="마지막 주문일로부터 이 일수가 지나면 '위험' 상태. 주의 기준보다 커야 합니다."
          value={values.danger_days}
          onChange={(v) => set('danger_days', v)}
          suffix="일"
        />
        <Field
          label="연체 경고 금액"
          hint="미수금이 이 금액 이상이면 상태 판단에 반영."
          value={values.overdue_warning_amount}
          onChange={(v) => set('overdue_warning_amount', v)}
          suffix="원"
          isKRW
        />
      </Section>

      <div style={s.footer}>
        <button
          type="submit"
          style={isPending ? s.btnOff : s.btn}
          disabled={isPending}
        >
          {isPending ? '저장 중...' : '설정 저장'}
        </button>
      </div>
    </form>
  )
}

// ── 섹션 ─────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sec.wrap}>
      <div style={sec.title}>{title}</div>
      <div style={sec.body}>{children}</div>
    </div>
  )
}

// ── 필드 ─────────────────────────────────────────────────────

function Field({
  label, hint, value, onChange, suffix, isKRW,
}: {
  label: string
  hint: string
  value: number
  onChange: (v: string) => void
  suffix: string
  isKRW?: boolean
}) {
  return (
    <div style={f.row}>
      <div style={f.labelCol}>
        <span style={f.label}>{label}</span>
        <span style={f.hint}>{hint}</span>
      </div>
      <div style={f.inputWrap}>
        <input
          type="number"
          style={f.input}
          value={value}
          min={0}
          onChange={(e) => onChange(e.target.value)}
        />
        <span style={f.suffix}>{suffix}</span>
      </div>
    </div>
  )
}

// ── 스타일 ───────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  form: { display: 'flex', flexDirection: 'column', gap: 24 },
  err: {
    background: '#FEF2F2', color: '#DC2626',
    border: '1px solid #FECACA', borderRadius: 8,
    padding: '10px 14px', fontSize: 13,
  },
  ok: {
    background: '#F0FDF4', color: '#15803D',
    border: '1px solid #BBF7D0', borderRadius: 8,
    padding: '10px 14px', fontSize: 13,
  },
  footer: { display: 'flex', justifyContent: 'flex-end', paddingTop: 8 },
  btn: {
    padding: '10px 28px', background: '#111827',
    color: '#fff', border: 'none', borderRadius: 8,
    fontSize: 14, fontWeight: 500, cursor: 'pointer',
  },
  btnOff: {
    padding: '10px 28px', background: '#9ca3af',
    color: '#fff', border: 'none', borderRadius: 8,
    fontSize: 14, fontWeight: 500, cursor: 'not-allowed',
  },
}

const sec: Record<string, React.CSSProperties> = {
  wrap: {
    border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden',
  },
  title: {
    padding: '10px 16px', background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    fontSize: 12, fontWeight: 600, color: '#374151',
    letterSpacing: '0.04em',
  },
  body: { display: 'flex', flexDirection: 'column' },
}

const f: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', borderBottom: '1px solid #f3f4f6', gap: 16,
  },
  labelCol: { display: 'flex', flexDirection: 'column', gap: 3, flex: 1 },
  label: { fontSize: 13, fontWeight: 500, color: '#111827' },
  hint: { fontSize: 11, color: '#9ca3af' },
  inputWrap: { position: 'relative', flexShrink: 0 },
  input: {
    width: 110, padding: '8px 36px 8px 12px',
    border: '1px solid #d1d5db', borderRadius: 8,
    fontSize: 14, textAlign: 'right', outline: 'none',
    fontVariantNumeric: 'tabular-nums',
  },
  suffix: {
    position: 'absolute', right: 10, top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 12, color: '#9ca3af', pointerEvents: 'none',
  },
}
