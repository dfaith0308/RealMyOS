'use client'

// ============================================================
// RealMyOS - 메시지 템플릿 관리
// src/components/settings/MessageTemplateManager.tsx
// ============================================================

import { useState, useTransition } from 'react'
import {
  createMessageTemplate,
  updateMessageTemplate,
  deactivateMessageTemplate,
} from '@/actions/message-template'
import type { MessageTemplate, MessageType } from '@/actions/message-template'

const TYPE_OPTIONS: { value: MessageType; label: string }[] = [
  { value: 'call_script', label: '전화 스크립트' },
  { value: 'sms',         label: '문자' },
  { value: 'kakao',       label: '카카오' },
]

interface Props {
  templates: MessageTemplate[]
  typeLabel: Record<string, string>
}

export default function MessageTemplateManager({ templates: initial, typeLabel }: Props) {
  const [templates, setTemplates] = useState<MessageTemplate[]>(initial)
  const [showForm, setShowForm] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 등록 버튼 */}
      {!showForm && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button style={s.newBtn} onClick={() => setShowForm(true)}>
            + 템플릿 등록
          </button>
        </div>
      )}

      {/* 등록 폼 */}
      {showForm && (
        <AddForm
          typeLabel={typeLabel}
          onSaved={(t) => { setTemplates((prev) => [t, ...prev]); setShowForm(false) }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* 목록 */}
      {templates.length === 0 && !showForm && (
        <p style={{ color: '#9ca3af', fontSize: 14 }}>등록된 템플릿이 없습니다.</p>
      )}

      {templates.map((t) => (
        <TemplateRow
          key={t.id}
          template={t}
          typeLabel={typeLabel}
          onDeactivated={(id) => setTemplates((prev) => prev.filter((x) => x.id !== id))}
          onUpdated={(updated) => setTemplates((prev) => prev.map((x) => x.id === updated.id ? updated : x))}
        />
      ))}
    </div>
  )
}

// ── 등록 폼 ──────────────────────────────────────────────────

function AddForm({ typeLabel, onSaved, onCancel }: {
  typeLabel: Record<string, string>
  onSaved: (t: MessageTemplate) => void
  onCancel: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState<MessageType>('call_script')
  const [error, setError] = useState<string | null>(null)

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const result = await createMessageTemplate({ name, content, message_type: type })
      if (result.success && result.data) {
        onSaved({
          id: result.data.id, name, content,
          message_type: type, is_active: true,
          created_at: new Date().toISOString(),
        })
      } else {
        setError(result.error ?? '저장 실패')
      }
    })
  }

  return (
    <div style={s.formBox}>
      {error && <div style={s.err}>{error}</div>}
      <div style={s.formRow}>
        <input
          style={{ ...s.input, flex: 2 }}
          placeholder="템플릿 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <div style={s.seg}>
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              style={type === opt.value ? s.segActive : s.segBtn}
              onClick={() => setType(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <textarea
        style={s.textarea}
        placeholder="내용을 입력하세요"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={s.cancelBtn} onClick={onCancel}>취소</button>
        <button style={isPending ? s.saveBtnOff : s.saveBtn} onClick={handleSave} disabled={isPending}>
          {isPending ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}

// ── 템플릿 행 ────────────────────────────────────────────────

function TemplateRow({ template, typeLabel, onDeactivated, onUpdated }: {
  template: MessageTemplate
  typeLabel: Record<string, string>
  onDeactivated: (id: string) => void
  onUpdated: (t: MessageTemplate) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(template.name)
  const [content, setContent] = useState(template.content)
  const [error, setError] = useState<string | null>(null)

  function handleUpdate() {
    setError(null)
    startTransition(async () => {
      const result = await updateMessageTemplate({ id: template.id, name, content })
      if (result.success) {
        onUpdated({ ...template, name, content })
        setEditing(false)
      } else {
        setError(result.error ?? '저장 실패')
      }
    })
  }

  function handleDeactivate() {
    if (!confirm('이 템플릿을 비활성화합니다. 계속하시겠습니까?')) return
    startTransition(async () => {
      const result = await deactivateMessageTemplate(template.id)
      if (result.success) onDeactivated(template.id)
    })
  }

  return (
    <div style={s.row}>
      <div style={s.rowHeader}>
        <span style={{ ...s.typePill, ...typeColor(template.message_type) }}>
          {typeLabel[template.message_type]}
        </span>
        {editing ? (
          <input
            style={{ ...s.input, flex: 1, fontSize: 13, fontWeight: 500 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        ) : (
          <span style={s.rowName}>{template.name}</span>
        )}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {editing ? (
            <>
              <button style={s.saveBtn} onClick={handleUpdate} disabled={isPending}>
                {isPending ? '저장 중' : '저장'}
              </button>
              <button style={s.cancelBtn} onClick={() => { setEditing(false); setName(template.name); setContent(template.content) }}>
                취소
              </button>
            </>
          ) : (
            <>
              <button style={s.editBtn} onClick={() => setEditing(true)}>수정</button>
              <button style={s.offBtn} onClick={handleDeactivate}>비활성화</button>
            </>
          )}
        </div>
      </div>
      {error && <div style={s.err}>{error}</div>}
      {editing ? (
        <textarea
          style={s.textarea}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
        />
      ) : (
        <div style={s.content}>{template.content}</div>
      )}
    </div>
  )
}

function typeColor(type: MessageType): React.CSSProperties {
  if (type === 'call_script') return { background: '#EFF6FF', color: '#1D4ED8' }
  if (type === 'sms')         return { background: '#F0FDF4', color: '#15803D' }
  return                             { background: '#FFF7ED', color: '#C2410C' }
}

// ── 스타일 ───────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  newBtn: { padding: '8px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  formBox: { border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 },
  formRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  input: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  textarea: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', width: '100%' },
  seg: { display: 'flex', border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden' },
  segBtn: { padding: '7px 12px', border: 'none', borderRight: '1px solid #d1d5db', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#374151' },
  segActive: { padding: '7px 12px', border: 'none', borderRight: '1px solid #d1d5db', background: '#111827', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  row: { border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 },
  rowHeader: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  typePill: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 },
  rowName: { fontSize: 14, fontWeight: 500, color: '#111827' },
  content: { fontSize: 13, color: '#6b7280', whiteSpace: 'pre-wrap', lineHeight: 1.6 },
  err: { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 13 },
  saveBtn: { padding: '5px 12px', background: '#111827', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  saveBtnOff: { padding: '5px 12px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'not-allowed' },
  cancelBtn: { padding: '5px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, color: '#374151', cursor: 'pointer' },
  editBtn: { padding: '5px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, color: '#374151', cursor: 'pointer' },
  offBtn: { padding: '5px 10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, color: '#9ca3af', cursor: 'pointer' },
}
