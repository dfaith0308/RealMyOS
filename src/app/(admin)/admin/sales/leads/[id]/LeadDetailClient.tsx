'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import {
  addSalesLeadNote,
  deleteSalesLead,
  deleteSalesLeadNote,
  updateSalesLead,
} from '@/actions/admin/sales-leads'
import { sendSalesLeadSms } from '@/actions/admin/sales-lead-sms'
import {
  CONTACT_METHOD_OPTIONS,
  INTEREST_LEVEL_OPTIONS,
  LEAD_STATUS_OPTIONS,
  contactMethodLabel,
  leadStatusColor,
  leadStatusLabel,
  type ContactMethod,
  type SalesLeadNoteRow,
  type SalesLeadRow,
} from '@/types/sales-lead'
import s from '../../../../admin-shared.module.css'
import c from '../../sales.module.css'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`
}

export default function LeadDetailClient({
  lead,
  notes,
  tenants,
  smsConfigured,
}: {
  lead: SalesLeadRow
  notes: SalesLeadNoteRow[]
  tenants: Array<{ id: string; name: string }>
  smsConfigured: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  // 메모 작성
  const [body, setBody] = useState('')
  const [tagInput, setTagInput] = useState('')

  // 문자 발송
  const [showSms, setShowSms] = useState(false)
  const [smsText, setSmsText] = useState('')

  /** 타임라인에 쌓인 태그를 모아 요약에 보여준다 (태그는 메모 단위로 저장된다) */
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const n of notes) for (const t of n.tags ?? []) set.add(t)
    return Array.from(set).sort()
  }, [notes])

  function patch(next: Parameters<typeof updateSalesLead>[1], okText?: string) {
    setError(null)
    setOkMsg(null)
    start(async () => {
      const res = await updateSalesLead(lead.id, next)
      if (!res.success) {
        setError(res.error ?? '저장 실패')
        return
      }
      if (okText) setOkMsg(okText)
      router.refresh()
    })
  }

  function toggleMethod(m: ContactMethod) {
    const current = lead.contact_methods ?? []
    const next = current.includes(m) ? current.filter((x) => x !== m) : [...current, m]
    patch({ contact_methods: next })
  }

  function handleAddNote() {
    setError(null)
    setOkMsg(null)
    if (!body.trim()) {
      setError('메모 내용을 입력하세요')
      return
    }
    const tags = tagInput
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)

    start(async () => {
      const res = await addSalesLeadNote({ lead_id: lead.id, body, tags })
      if (!res.success) {
        setError(res.error ?? '메모 저장 실패')
        return
      }
      setBody('')
      setTagInput('')
      router.refresh()
    })
  }

  function handleDeleteNote(noteId: string) {
    if (!confirm('이 메모를 삭제할까요?')) return
    setError(null)
    start(async () => {
      const res = await deleteSalesLeadNote(noteId, lead.id)
      if (!res.success) {
        setError(res.error ?? '삭제 실패')
        return
      }
      router.refresh()
    })
  }

  function handleDeleteLead() {
    if (!confirm(`'${lead.company_name}' 리드와 메모를 모두 삭제할까요? 되돌릴 수 없습니다.`)) return
    setError(null)
    start(async () => {
      const res = await deleteSalesLead(lead.id)
      if (!res.success) {
        setError(res.error ?? '삭제 실패')
        return
      }
      router.push(`/admin/sales?tab=${lead.lead_type}`)
    })
  }

  function handleSendSms() {
    setError(null)
    setOkMsg(null)
    if (!smsText.trim()) {
      setError('메시지 내용을 입력하세요')
      return
    }
    start(async () => {
      const res = await sendSalesLeadSms({ lead_id: lead.id, message: smsText })
      if (!res.success) {
        setError(res.error ?? '발송 실패')
        return
      }
      setOkMsg(`문자를 발송했습니다 (${res.data?.smsType}, ${res.data?.byteLen}바이트)`)
      setShowSms(false)
      setSmsText('')
      router.refresh()
    })
  }

  const region = [lead.region_sido, lead.region_sigungu].filter(Boolean).join(' ')

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>
            {lead.company_name}{' '}
            <span className={c.statusBadge} style={{ background: leadStatusColor(lead.status) }}>
              {leadStatusLabel(lead.status)}
            </span>
          </h1>
          <p className={s.subtitle}>
            {lead.lead_type === 'supplier' ? '공급자 영업' : '식당 영업'} · 등록{' '}
            {formatDateTime(lead.created_at)}
          </p>
        </div>
        <Link href={`/admin/sales?tab=${lead.lead_type}`} className={s.ghostBtnMd}>
          목록으로
        </Link>
      </header>

      {error && <p className={c.errText}>{error}</p>}
      {okMsg && <p className={c.okText}>{okMsg}</p>}

      <div className={c.detailGrid}>
        {/* ── 좌: 요약 + 타임라인 ── */}
        <div>
          <section className={c.card}>
            <h2 className={c.cardTitle}>요약</h2>

            <div className={c.fieldRow}>
              <span className={c.fieldLabel}>전화</span>
              <span className={c.fieldValue}>{lead.phone || '—'}</span>
            </div>
            <div className={c.fieldRow}>
              <span className={c.fieldLabel}>주소</span>
              <span className={c.fieldValue}>{lead.address || '—'}</span>
            </div>
            <div className={c.fieldRow}>
              <span className={c.fieldLabel}>지역</span>
              <span className={c.fieldValue}>{region || '—'}</span>
            </div>
            <div className={c.fieldRow}>
              <span className={c.fieldLabel}>네이버</span>
              <span className={c.fieldValue}>
                {lead.naver_place_url ? (
                  <a href={lead.naver_place_url} target="_blank" rel="noopener noreferrer">
                    네이버플레이스 열기 ↗
                  </a>
                ) : (
                  '—'
                )}
              </span>
            </div>
            <div className={c.fieldRow}>
              <span className={c.fieldLabel}>태그</span>
              <span className={c.fieldValue}>
                {allTags.length === 0
                  ? '—'
                  : allTags.map((t) => (
                      <span key={t} className={c.tagChip}>
                        #{t}
                      </span>
                    ))}
              </span>
            </div>

            <div className={c.actionRow}>
              <a
                className={c.actionBtn}
                href={lead.phone ? telHref(lead.phone) : undefined}
                aria-disabled={!lead.phone}
                style={lead.phone ? undefined : { opacity: 0.5, pointerEvents: 'none' }}
              >
                📞 전화걸기
              </a>
              <button
                type="button"
                className={`${c.actionBtn} ${c.actionBtnPrimary}`}
                onClick={() => setShowSms(true)}
                disabled={!lead.phone || !smsConfigured || pending}
                title={
                  !lead.phone
                    ? '전화번호가 없습니다'
                    : !smsConfigured
                      ? '솔라피 환경변수가 설정되지 않았습니다'
                      : undefined
                }
              >
                ✉️ 문자 발송
              </button>
            </div>
            {!smsConfigured && (
              <p className={c.hint}>
                문자 발송은 SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER 설정이 필요합니다.
              </p>
            )}
          </section>

          {/* ── 메모 타임라인 ── */}
          <section className={c.card} style={{ marginTop: 14 }}>
            <h2 className={c.cardTitle}>메모 타임라인</h2>

            <textarea
              className={c.textarea}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="오늘 방문 결과, 통화 내용, 다음 액션 등을 남기세요."
            />
            <input
              className={c.formInput}
              style={{ marginTop: 8 }}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="태그 (쉼표/공백 구분, 자유 입력) — 예: 재방문 가격민감"
            />
            <div className={c.actionRow}>
              <button
                type="button"
                className={`${c.actionBtn} ${c.actionBtnPrimary}`}
                onClick={handleAddNote}
                disabled={pending}
              >
                {pending ? '저장 중…' : '메모 등록'}
              </button>
            </div>

            <div className={c.timeline}>
              {notes.length === 0 ? (
                <div className={s.empty}>아직 메모가 없습니다.</div>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className={c.timelineItem}>
                    <div className={c.timelineMeta}>
                      <span>{formatDateTime(n.created_at)}</span>
                      {(n.tags ?? []).map((t) => (
                        <span key={t} className={c.tagChip}>
                          #{t}
                        </span>
                      ))}
                    </div>
                    <div className={c.timelineBody}>{n.body}</div>
                    <button
                      type="button"
                      className={c.linkBtn}
                      onClick={() => handleDeleteNote(n.id)}
                      disabled={pending}
                    >
                      삭제
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* ── 우: 편집 패널 ── */}
        <aside>
          <section className={c.card}>
            <h2 className={c.cardTitle}>상태 · 관심도</h2>

            <label className={c.formLabel}>상태</label>
            <select
              className={c.formInput}
              value={lead.status}
              onChange={(e) => patch({ status: e.target.value }, '상태를 저장했습니다')}
              disabled={pending}
            >
              {LEAD_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <label className={c.formLabel}>관심도</label>
            <select
              className={c.formInput}
              value={lead.interest_level}
              onChange={(e) =>
                patch({ interest_level: Number(e.target.value) }, '관심도를 저장했습니다')
              }
              disabled={pending}
            >
              {INTEREST_LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <label className={c.formLabel}>접촉 방법 (복수 선택)</label>
            <div className={c.checkGroup}>
              {CONTACT_METHOD_OPTIONS.map((o) => (
                <label key={o.value} className={c.checkItem}>
                  <input
                    type="checkbox"
                    checked={(lead.contact_methods ?? []).includes(o.value)}
                    onChange={() => toggleMethod(o.value)}
                    disabled={pending}
                  />
                  {o.label}
                </label>
              ))}
            </div>
            <p className={c.hint}>
              현재: {(lead.contact_methods ?? []).map(contactMethodLabel).join(', ') || '없음'}
            </p>

            <label className={c.formLabel}>가입 테넌트 연결</label>
            <select
              className={c.formInput}
              value={lead.linked_tenant_id ?? ''}
              onChange={(e) =>
                patch({ linked_tenant_id: e.target.value || null }, '테넌트 연결을 저장했습니다')
              }
              disabled={pending}
            >
              <option value="">연결 안 됨</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className={c.hint}>리드가 실제로 가입한 뒤 수동으로 연결하세요.</p>
          </section>

          <section className={c.card} style={{ marginTop: 14 }}>
            <h2 className={c.cardTitle}>기본 정보 수정</h2>

            <label className={c.formLabel}>업체명</label>
            <input
              className={c.formInput}
              defaultValue={lead.company_name}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== lead.company_name) {
                  patch({ company_name: e.target.value }, '업체명을 저장했습니다')
                }
              }}
            />

            <label className={c.formLabel}>전화번호</label>
            <input
              className={c.formInput}
              defaultValue={lead.phone ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (lead.phone ?? '')) {
                  patch({ phone: e.target.value }, '전화번호를 저장했습니다')
                }
              }}
            />

            <label className={c.formLabel}>주소</label>
            <input
              className={c.formInput}
              defaultValue={lead.address ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (lead.address ?? '')) {
                  patch({ address: e.target.value }, '주소와 지역을 저장했습니다')
                }
              }}
            />

            <label className={c.formLabel}>네이버플레이스 링크</label>
            <input
              className={c.formInput}
              defaultValue={lead.naver_place_url ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (lead.naver_place_url ?? '')) {
                  patch({ naver_place_url: e.target.value }, '링크를 저장했습니다')
                }
              }}
            />
            <p className={c.hint}>naver.com / naver.me 주소만 저장됩니다.</p>

            <div className={c.actionRow}>
              <button
                type="button"
                className={c.actionBtn}
                onClick={handleDeleteLead}
                disabled={pending}
                style={{ color: '#b91c1c' }}
              >
                리드 삭제
              </button>
            </div>
          </section>
        </aside>
      </div>

      {showSms && (
        <div className={c.overlay} onClick={() => !pending && setShowSms(false)}>
          <div className={c.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={c.modalTitle}>문자 발송 — {lead.company_name}</h2>
            <p className={c.hint}>수신: {lead.phone}</p>

            <textarea
              className={c.textarea}
              style={{ marginTop: 10 }}
              value={smsText}
              onChange={(e) => setSmsText(e.target.value)}
              placeholder="보낼 문자 내용을 입력하세요."
            />
            <p className={c.hint}>
              90바이트를 넘으면 LMS로 발송됩니다. 발송 결과는 메모 타임라인에 기록됩니다.
            </p>

            {error && <p className={c.errText}>{error}</p>}

            <div className={c.modalActions}>
              <button
                type="button"
                className={c.actionBtn}
                onClick={() => setShowSms(false)}
                disabled={pending}
              >
                취소
              </button>
              <button
                type="button"
                className={`${c.actionBtn} ${c.actionBtnPrimary}`}
                onClick={handleSendSms}
                disabled={pending}
              >
                {pending ? '발송 중…' : '발송'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
