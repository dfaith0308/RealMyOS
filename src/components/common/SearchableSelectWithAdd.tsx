'use client'

import { useState, useRef, useEffect, useTransition } from 'react'

export interface SelectOption { id: string; name: string }

interface Props {
  options: SelectOption[]
  value: string
  onChange: (id: string, name: string) => void
  onAdd?: (name: string) => Promise<SelectOption | null>
  placeholder?: string
  label?: string
  disabled?: boolean
}

export default function SearchableSelectWithAdd({
  options, value, onChange, onAdd,
  placeholder = '검색 또는 선택', label, disabled,
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [isPending, startTransition] = useTransition()
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.id === value)
  const filtered = query
    ? options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSelect(opt: SelectOption) { onChange(opt.id, opt.name); setQuery(''); setOpen(false) }
  function handleClear() { onChange('', ''); setQuery('') }
  function handleAdd() {
    if (!newName.trim() || !onAdd) return
    startTransition(async () => {
      const result = await onAdd(newName.trim())
      if (result) { onChange(result.id, result.name); setNewName(''); setShowAdd(false); setOpen(false) }
    })
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {label && <label style={s.label}>{label}</label>}
      <div style={s.inputWrap}>
        <input style={{ ...s.input, flex: 1 }}
          value={open ? query : (selected?.name ?? '')}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {value && <button type="button" style={s.clearBtn} onClick={handleClear}>✕</button>}
          {onAdd && (
            <button type="button" style={s.addBtn}
              onClick={() => { setShowAdd((v) => !v); setOpen(false) }}>+</button>
          )}
        </div>
      </div>

      {open && (
        <div style={s.dropdown}>
          {filtered.length === 0 && <div style={s.noResult}>결과 없음</div>}
          {filtered.map((opt) => (
            <button key={opt.id} type="button"
              style={{ ...s.option, background: opt.id === value ? '#EFF6FF' : '#fff', fontWeight: opt.id === value ? 500 : 400 }}
              onClick={() => handleSelect(opt)}>{opt.name}</button>
          ))}
        </div>
      )}

      {showAdd && onAdd && (
        <div style={s.addRow}>
          <input style={{ ...s.input, flex: 1 }} value={newName}
            onChange={(e) => setNewName(e.target.value)} placeholder="새 항목 이름" autoFocus />
          <button type="button" style={s.saveBtn} onClick={handleAdd} disabled={isPending}>
            {isPending ? '...' : '추가'}
          </button>
          <button type="button" style={s.cancelBtn}
            onClick={() => { setShowAdd(false); setNewName('') }}>취소</button>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  label:    { display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 },
  inputWrap:{ display: 'flex', gap: 6, alignItems: 'center' },
  input:    { padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', width: '100%' },
  clearBtn: { padding: '4px 8px', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 12 },
  addBtn:   { padding: '7px 12px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 16, cursor: 'pointer', fontWeight: 700 },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 240, overflowY: 'auto', marginTop: 4 },
  option:   { display: 'block', width: '100%', padding: '8px 12px', border: 'none', textAlign: 'left', fontSize: 14, cursor: 'pointer', borderBottom: '1px solid #f3f4f6' },
  noResult: { padding: '10px 12px', color: '#9ca3af', fontSize: 13 },
  addRow:   { display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' },
  saveBtn:  { padding: '8px 12px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  cancelBtn:{ padding: '8px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
}
