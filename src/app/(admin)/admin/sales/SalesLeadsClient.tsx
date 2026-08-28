'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createSalesLead } from '@/actions/admin/sales-leads'
import {
  CONTACT_METHOD_OPTIONS,
  INTEREST_LEVEL_OPTIONS,
  LEAD_STATUS_OPTIONS,
  leadStatusColor,
  leadStatusLabel,
  type ContactMethod,
  type LeadType,
  type SalesLeadListRow,
} from '@/types/sales-lead'
import s from '../../admin-shared.module.css'
import c from './sales.module.css'

type Filters = {
  status: string
  sido: string
  sigungu: string
  interest: string
  tag: string
  q: string
}

function stars(level: number): string {
  const n = Math.max(1, Math.min(3, level))
  return '★'.repeat(n) + '☆'.repeat(3 - n)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ko-KR')
}

export default function SalesLeadsClient({
  leadType,
  leads,
  filters,
  options,
}: {
  leadType: LeadType
  leads: SalesLeadListRow[]
  filters: Filters
  options: { sidos: string[]; sigungus: string[]; tags: string[] }
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const [draft, setDraft] = useState<Filters>(filters)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 등록 폼
  const [companyName, setCompanyName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [naverUrl, setNaverUrl] = useState('')
  const [methods, setMethods] = useState<ContactMethod[]>([])
  const [status, setStatus] = useState('new')
  const [interest, setInterest] = useState(1)

  function applyFilters(next: Filters) {
    setDraft(next)
    const params = new URLSearchParams()
    params.set('tab', leadType)
    if (next.status) params.set('status', next.status)
    if (next.sido) params.set('sido', next.sido)
    if (next.sigungu) params.set('sigungu', next.sigungu)
    if (next.interest) params.set('interest', next.interest)
    if (next.tag) params.set('tag', next.tag)
    if (next.q.trim()) params.set('q', next.q.trim())
    start(() => {
      router.push(`/admin/sales?${params.toString()}`)
    })
  }

  function set<K extends keyof Filters>(key: K, value: string) {
    applyFilters({ ...draft, [key]: value })
  }

  function resetForm() {
    setCompanyName('')
    setPhone('')
    setAddress('')
    setNaverUrl('')
    setMethods([])
    setStatus('new')
    setInterest(1)
  }

  function toggleMethod(m: ContactMethod) {
    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
  }

  function handleCreate() {
    setError(null)
    if (!companyName.trim()) {
      setError('업체명을 입력하세요')
      return
    }
    start(async () => {
      const res = await createSalesLead({
        lead_type: leadType,
        company_name: companyName,
        phone,
        address,
        naver_place_url: naverUrl,
        contact_methods: methods,
        status,
        interest_level: interest,
      })
      if (!res.success) {
        setError(res.error ?? '리드 등록 실패')
        return
      }
      setShowForm(false)
      resetForm()
      router.refresh()
    })
  }

  const hasFilter =
    !!draft.status || !!draft.sido || !!draft.sigungu || !!draft.interest || !!draft.tag || !!draft.q

  return (
    <>
      <div className={c.filterRow}>
        <select className={c.select} value={draft.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">상태 전체</option>
          {LEAD_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select className={c.select} value={draft.sido} onChange={(e) => set('sido', e.target.value)}>
          <option value="">시/도 전체</option>
          {options.sidos.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select className={c.select} value={draft.sigungu} onChange={(e) => set('sigungu', e.target.value)}>
          <option value="">시/군/구 전체</option>
          {options.sigungus.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select className={c.select} value={draft.interest} onChange={(e) => set('interest', e.target.value)}>
          <option value="">관심도 전체</option>
          {INTEREST_LEVEL_OPTIONS.map((o) => (
            <option key={o.value} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>

        <select className={c.select} value={draft.tag} onChange={(e) => set('tag', e.target.value)}>
          <option value="">태그 전체</option>
          {options.tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>

        <input
          className={`${c.textInput} ${c.grow}`}
          placeholder="업체명·전화·주소 검색"
          defaultValue={draft.q}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyFilters({ ...draft, q: (e.target as HTMLInputElement).value })
          }}
          onBlur={(e) => {
            if (e.target.value !== draft.q) applyFilters({ ...draft, q: e.target.value })
          }}
        />

        {hasFilter && (
          <button
            type="button"
            className={s.ghostBtnSm}
            onClick={() =>
              applyFilters({ status: '', sido: '', sigungu: '', interest: '', tag: '', q: '' })
            }
          >
            필터 초기화
          </button>
        )}

        <button type="button" className={s.primaryBtnSm} onClick={() => setShowForm(true)}>
          + 리드 추가
        </button>
      </div>

      {error && !showForm && <p className={c.errText}>{error}</p>}

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr className={s.theadRow}>
              <th className={s.th}>업체명</th>
              <th className={s.th}>지역</th>
              <th className={s.th}>연락처</th>
              <th className={s.th}>상태</th>
              <th className={s.th}>관심도</th>
              <th className={s.th}>태그</th>
              <th className={s.th}>메모</th>
              <th className={s.th}>최근 활동</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td className={s.td} colSpan={8}>
                  <div className={s.empty}>
                    {hasFilter ? '조건에 맞는 리드가 없습니다.' : '아직 등록된 리드가 없습니다.'}
                  </div>
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id}>
                  <td className={s.td}>
                    <Link href={`/admin/sales/leads/${lead.id}`} className={c.rowLink}>
                      {lead.company_name}
                    </Link>
                    {lead.linked_tenant_id && <span className={c.tagChip}>가입연결</span>}
                  </td>
                  <td className={s.tdSm}>
                    {[lead.region_sido, lead.region_sigungu].filter(Boolean).join(' ') || (
                      <span className={s.mutedDash}>—</span>
                    )}
                  </td>
                  <td className={s.tdNowrap}>{lead.phone ?? <span className={s.mutedDash}>—</span>}</td>
                  <td className={s.tdNowrap}>
                    <span className={c.statusBadge} style={{ background: leadStatusColor(lead.status) }}>
                      {leadStatusLabel(lead.status)}
                    </span>
                  </td>
                  <td className={s.tdNowrap}>
                    <span className={c.stars}>{stars(lead.interest_level)}</span>
                  </td>
                  <td className={s.tdSm}>
                    {lead.tags.length === 0 ? (
                      <span className={s.mutedDash}>—</span>
                    ) : (
                      lead.tags.slice(0, 4).map((t) => (
                        <span key={t} className={c.tagChip}>
                          #{t}
                        </span>
                      ))
                    )}
                  </td>
                  <td className={s.tdNowrap}>{lead.note_count}</td>
                  <td className={s.tdNowrap}>{formatDate(lead.last_note_at ?? lead.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className={c.hint}>
        {leads.length}건 표시 {pending && '· 불러오는 중…'}
      </p>

      {showForm && (
        <div className={c.overlay} onClick={() => !pending && setShowForm(false)}>
          <div className={c.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={c.modalTitle}>
              {leadType === 'supplier' ? '공급자' : '식당'} 리드 추가
            </h2>

            <label className={c.formLabel}>업체명 *</label>
            <input
              className={c.formInput}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="예: 신선유통"
            />

            <label className={c.formLabel}>전화번호</label>
            <input
              className={c.formInput}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
            />

            <label className={c.formLabel}>주소</label>
            <input
              className={c.formInput}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="예: 경기도 성남시 분당구 판교역로 235"
            />
            <p className={c.hint}>주소를 입력하면 시/도·시/군/구가 자동으로 분류됩니다.</p>

            <label className={c.formLabel}>네이버플레이스 링크</label>
            <input
              className={c.formInput}
              value={naverUrl}
              onChange={(e) => setNaverUrl(e.target.value)}
              placeholder="https://naver.me/..."
            />

            <label className={c.formLabel}>접촉 방법 (복수 선택)</label>
            <div className={c.checkGroup}>
              {CONTACT_METHOD_OPTIONS.map((o) => (
                <label key={o.value} className={c.checkItem}>
                  <input
                    type="checkbox"
                    checked={methods.includes(o.value)}
                    onChange={() => toggleMethod(o.value)}
                  />
                  {o.label}
                </label>
              ))}
            </div>

            <label className={c.formLabel}>상태</label>
            <select className={c.formInput} value={status} onChange={(e) => setStatus(e.target.value)}>
              {LEAD_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <label className={c.formLabel}>관심도</label>
            <select
              className={c.formInput}
              value={interest}
              onChange={(e) => setInterest(Number(e.target.value))}
            >
              {INTEREST_LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            {error && <p className={c.errText}>{error}</p>}

            <div className={c.modalActions}>
              <button
                type="button"
                className={c.actionBtn}
                onClick={() => setShowForm(false)}
                disabled={pending}
              >
                취소
              </button>
              <button
                type="button"
                className={`${c.actionBtn} ${c.actionBtnPrimary}`}
                onClick={handleCreate}
                disabled={pending}
              >
                {pending ? '저장 중…' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
