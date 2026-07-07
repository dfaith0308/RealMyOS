'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export type SearchableCustomer = {
  id: string
  name: string
  representative_name?: string | null
  phone?: string | null
}

export default function SearchableCustomerSelect(props: {
  customers: SearchableCustomer[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
}) {
  const { customers, value, onChange } = props
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const wrapRef = useRef<HTMLDivElement | null>(null)

  const selected = useMemo(() => {
    if (!value) return null
    return customers.find((c) => c.id === value) ?? null
  }, [customers, value])

  useEffect(() => {
    // value가 바뀌면(라우트/필터 변경) 입력창 표시를 동기화
    setQuery(selected?.name ?? '')
  }, [selected?.name])

  const filtered = useMemo(() => {
    const q = query.trim().replace(/-/g, '').toLowerCase()
    const list = q
      ? customers.filter((c) => {
          const name = (c.name ?? '').toLowerCase()
          const rep = (c.representative_name ?? '').toLowerCase()
          const phone = (c.phone ?? '').replace(/-/g, '')
          return name.includes(q) || rep.includes(q) || phone.includes(q)
        })
      : customers

    return list.slice(0, 10)
  }, [customers, query])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const el = wrapRef.current
      if (!el) return
      if (!el.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  function choose(id: string, name: string) {
    onChange(id)
    setQuery(name)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          if (e.target.value === '') {
            // 비우면 전체로 복귀
            onChange('')
          }
        }}
        onFocus={() => setOpen(true)}
        placeholder={props.placeholder ?? '거래처 검색 (상호명·대표자·연락처)'}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid var(--border)',
          borderRadius: 8,
          fontSize: 13,
          fontFamily: 'inherit',
          background: 'var(--surface-2)',
        }}
      />

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            zIndex: 100,
            maxHeight: 240,
            overflowY: 'auto',
            marginTop: 6,
          }}
        >
          <div
            onMouseDown={() => choose('', '')}
            style={{
              padding: '10px 14px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              borderBottom: '1px solid var(--border)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title="전체 거래처"
          >
            전체 거래처
          </div>

          {filtered.length > 0 ? (
            filtered.map((c) => (
              <div
                key={c.id}
                onMouseDown={() => choose(c.id, c.name)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  borderBottom: '1px solid rgba(0,0,0,0.04)',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={c.name}
                >
                  {c.name}
                </div>
                {(c.representative_name || c.phone) && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--text-hint)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={[c.representative_name ?? '', c.phone ?? ''].filter(Boolean).join(' · ')}
                  >
                    {[c.representative_name ?? '', c.phone ?? ''].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-hint)' }}>
              검색 결과가 없습니다.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

