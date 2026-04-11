'use client'

import { useState } from 'react'
import { saveSalesScript } from '@/actions/sales'
import type { SalesScript } from '@/actions/sales'

const TYPE_LABEL: Record<string, string> = { call: '📞 전화', message: '💬 문자', visit: '🚗 방문' }

export default function SalesScriptsClient({ initialScripts }: { initialScripts: SalesScript[] }) {
  const [scripts, setScripts]   = useState(initialScripts)
  const [filter, setFilter]     = useState<'call' | 'message' | 'visit' | ''>('')
  const [editing, setEditing]   = useState<Partial<SalesScript> | null>(null)
  const [saving, setSaving]     = useState(false)

  const filtered = scripts.filter((s) => !filter || s.type === filter)

  async function handleSave() {
    if (!editing?.title || !editing?.content || !editing?.type) return
    setSaving(true)
    const res = await saveSalesScript({
      id:      editing.id,
      type:    editing.type as 'call' | 'message' | 'visit',
      title:   editing.title,
      content: editing.content,
    })
    if (res.success) {
      if (editing.id) {
        setScripts((prev) => prev.map((s) => s.id === editing.id ? { ...s, ...editing } as SalesScript : s))
      } else {
        setScripts((prev) => [...prev, { ...editing, id: res.data!.id, is_default: false, sort_order: 99 } as SalesScript])
      }
      setEditing(null)
    }
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>스크립트관</h1>
        <button onClick={() => setEditing({ type: 'call', title: '', content: '' })}
          style={{ padding: '8px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
          + 스크립트 추가
        </button>
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {([['', '전체'], ['call', '📞 전화'], ['message', '💬 문자'], ['visit', '🚗 방문']] as const).map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k as any)}
            style={{ padding: '6px 14px', border: 'none', borderRadius: 20, fontSize: 12, cursor: 'pointer',
              background: filter === k ? '#111827' : '#f3f4f6', color: filter === k ? '#fff' : '#374151' }}>
            {v}
          </button>
        ))}
      </div>

      {/* 스크립트 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((s) => (
          <div key={s.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#f3f4f6', color: '#6b7280' }}>
                  {TYPE_LABEL[s.type]}
                </span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{s.title}</span>
                {s.is_default && <span style={{ fontSize: 10, color: '#9ca3af' }}>기본</span>}
              </div>
              {!s.is_default && (
                <button onClick={() => setEditing(s)}
                  style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer' }}>
                  수정
                </button>
              )}
            </div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{s.content}</div>
          </div>
        ))}
      </div>

      {/* 편집 모달 */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 480, maxWidth: '90vw' }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>
              {editing.id ? '스크립트 수정' : '스크립트 추가'}
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 5 }}>유형</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['call', 'message', 'visit'] as const).map((t) => (
                  <button key={t} onClick={() => setEditing((prev) => ({ ...prev, type: t }))}
                    style={{ padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      background: editing.type === t ? '#111827' : '#f3f4f6',
                      color:      editing.type === t ? '#fff' : '#374151' }}>
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 5 }}>제목</div>
              <input style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }}
                value={editing.title ?? ''}
                onChange={(e) => setEditing((prev) => ({ ...prev, title: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 5 }}>내용 ([거래처명] [금액] 사용 가능)</div>
              <textarea style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, minHeight: 100, resize: 'vertical', boxSizing: 'border-box' }}
                value={editing.content ?? ''}
                onChange={(e) => setEditing((prev) => ({ ...prev, content: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing(null)}
                style={{ padding: '9px 16px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer' }}>
                취소
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '9px 20px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
