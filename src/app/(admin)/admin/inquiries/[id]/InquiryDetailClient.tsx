'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { matchInquiryToTenant, searchMatchCandidates } from '@/actions/admin/inquiries'
import {
  formatInquiryDateTime,
  inquiryTypeLabel,
  responseMethodLabel,
  tenantRoleLabel,
  type InquiryRow,
  type MatchCandidate,
} from '@/types/inquiry'
import s from '../../../admin-shared.module.css'
import c from '../inquiries.module.css'

/** "했음 + 내용" 한 줄 */
function ProgressField({
  label,
  on,
  note,
}: {
  label: string
  on: boolean
  note: string | null
}) {
  return (
    <div className={c.fieldRow}>
      <span className={c.fieldLabel}>{label}</span>
      <span className={c.fieldValue}>
        {on ? <span className={c.markYes}>O</span> : <span className={c.markNo}>X</span>}
        {on && note ? <span>{`  ${note}`}</span> : null}
      </span>
    </div>
  )
}

export default function InquiryDetailClient({ inquiry }: { inquiry: InquiryRow }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  // 고객명이 없으면 연락처로 찾는다
  const [query, setQuery] = useState(inquiry.customer_name || inquiry.customer_phone || '')
  const [candidates, setCandidates] = useState<MatchCandidate[] | null>(null)
  const [picked, setPicked] = useState<MatchCandidate | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)

  const matched = inquiry.match_status === 'matched'

  function handleSearch() {
    setSearchError(null)
    setMatchError(null)
    setPicked(null)
    start(async () => {
      const res = await searchMatchCandidates({ q: query })
      if (!res.success) {
        setCandidates(null)
        setSearchError(res.error ?? '검색에 실패했습니다')
        return
      }
      setCandidates(res.data?.candidates ?? [])
    })
  }

  function handleConfirmMatch() {
    if (!picked) return
    setMatchError(null)
    start(async () => {
      const res = await matchInquiryToTenant({ inquiry_id: inquiry.id, tenant_id: picked.id })
      if (!res.success) {
        setMatchError(res.error ?? '연결에 실패했습니다')
        return
      }
      setPicked(null)
      setCandidates(null)
      router.refresh()
    })
  }

  return (
    <main className={s.main}>
      <Link href="/admin/inquiries" className={c.backLink}>
        ← 문의 목록
      </Link>

      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>{inquiry.customer_name || inquiry.customer_phone || '문의'}</h1>
          <p className={s.subtitleMax720}>
            {formatInquiryDateTime(inquiry.inquired_at)} ·{' '}
            {inquiryTypeLabel(inquiry.inquiry_type, inquiry.inquiry_type_etc)} ·{' '}
            {responseMethodLabel(inquiry.response_method, inquiry.response_method_etc)}
          </p>
        </div>
      </header>

      <div className={c.detailGrid}>
        {/* ── 왼쪽: 내용 ── */}
        <div>
          <section className={c.card}>
            <h2 className={c.cardTitle}>문의 내용</h2>

            <div className={c.fieldRow}>
              <span className={c.fieldLabel}>문의일시</span>
              <span className={c.fieldValue}>{formatInquiryDateTime(inquiry.inquired_at)}</span>
            </div>
            <div className={c.fieldRow}>
              <span className={c.fieldLabel}>고객명</span>
              <span className={c.fieldValue}>{inquiry.customer_name || '—'}</span>
            </div>
            <div className={c.fieldRow}>
              <span className={c.fieldLabel}>연락처</span>
              <span className={c.fieldValue}>{inquiry.customer_phone || '—'}</span>
            </div>
            <div className={c.fieldRow}>
              <span className={c.fieldLabel}>문의유형</span>
              <span className={c.fieldValue}>
                {inquiryTypeLabel(inquiry.inquiry_type, inquiry.inquiry_type_etc)}
              </span>
            </div>
            <div className={c.fieldRow}>
              <span className={c.fieldLabel}>응대방식</span>
              <span className={c.fieldValue}>
                {responseMethodLabel(inquiry.response_method, inquiry.response_method_etc)}
              </span>
            </div>
            <ProgressField label="가격안내" on={inquiry.price_guided} note={inquiry.price_guide_note} />
            <ProgressField
              label="결제안내"
              on={inquiry.payment_guided}
              note={inquiry.payment_guide_note}
            />
            <ProgressField label="발송" on={inquiry.shipped} note={inquiry.shipping_note} />
            <div className={c.fieldRow}>
              <span className={c.fieldLabel}>담당자</span>
              <span className={c.fieldValue}>{inquiry.handled_by_email ?? '—'}</span>
            </div>
          </section>

          <section className={c.card}>
            <h2 className={c.cardTitle}>상세메모</h2>
            {inquiry.memo.trim() ? (
              <p className={c.memoBody}>{inquiry.memo}</p>
            ) : (
              <p className={c.hint}>남긴 메모가 없습니다.</p>
            )}

            {inquiry.photo_urls.length > 0 && (
              <div className={c.detailPhotos}>
                {inquiry.photo_urls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="문의 사진" className={c.detailThumb} />
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── 오른쪽: 회원 매칭 ── */}
        <section className={c.card}>
          <h2 className={c.cardTitle}>회원 매칭</h2>

          {matched ? (
            <div className={c.matchedBox}>
              <p className={c.matchedName}>{inquiry.matched_tenant_name ?? '연결된 회원'}</p>
              <p className={c.hint}>
                {formatInquiryDateTime(inquiry.matched_at)}에 연결됨
              </p>
            </div>
          ) : (
            <>
              <p className={c.hint}>
                이름이나 연락처로 기존 회원을 찾습니다. 같은 이름·같은 번호라도 자동으로 연결되지
                않습니다 — 관리자가 직접 확인하고 연결해야 합니다.
              </p>

              <div className={c.matchSearchRow} style={{ marginTop: 10 }}>
                <input
                  className={c.textInput}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearch()
                  }}
                  placeholder="이름 또는 연락처"
                  aria-label="회원 검색어"
                  disabled={pending}
                />
                <button
                  type="button"
                  className={c.actionBtn}
                  onClick={handleSearch}
                  disabled={pending}
                >
                  {pending ? '검색 중…' : '회원 찾기'}
                </button>
              </div>

              {searchError && <p className={c.errText}>{searchError}</p>}

              {candidates !== null && candidates.length === 0 && (
                <p className={c.hint} style={{ marginTop: 10 }}>
                  일치하는 회원이 없습니다. 아직 가입 전인 고객일 수 있습니다.
                </p>
              )}

              {candidates !== null && candidates.length > 0 && (
                <div className={c.candidateList}>
                  {candidates.map((t) => {
                    const isPicked = picked?.id === t.id
                    return (
                      <div
                        key={t.id}
                        className={`${c.candidateItem} ${isPicked ? c.candidateItemPicked : ''}`}
                      >
                        <div className={c.candidateHead}>
                          <span className={c.candidateName}>{t.name ?? '(이름 없음)'}</span>
                          <span className={c.roleChip}>{tenantRoleLabel(t.role)}</span>
                        </div>
                        <p className={c.candidateMeta}>
                          {[
                            t.representative_name ? `대표 ${t.representative_name}` : null,
                            t.owner_name ? `담당 ${t.owner_name}` : null,
                            t.contact_phone ?? t.phone ?? null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '연락처 정보 없음'}
                        </p>
                        <p className={c.matchedOn}>맞은 항목: {t.matched_on.join(', ')}</p>
                        <div className={c.candidateActions}>
                          <button
                            type="button"
                            className={c.actionBtn}
                            onClick={() => {
                              setMatchError(null)
                              setPicked(isPicked ? null : t)
                            }}
                            disabled={pending}
                          >
                            {isPicked ? '선택 취소' : '이 회원 선택'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {picked && (
                <div className={c.confirmBox}>
                  <p className={c.confirmText}>
                    <span className={c.confirmStrong}>
                      {inquiry.customer_name || inquiry.customer_phone || '이 문의'}
                    </span>
                    의 문의를{' '}
                    <span className={c.confirmStrong}>{picked.name ?? '(이름 없음)'}</span> 회원과
                    연결합니다. 같은 사람이 맞는지 확인해 주세요.
                  </p>
                  {matchError && <p className={c.errText}>{matchError}</p>}
                  <div className={c.candidateActions}>
                    <button
                      type="button"
                      className={`${c.actionBtn} ${c.actionBtnPrimary}`}
                      onClick={handleConfirmMatch}
                      disabled={pending}
                    >
                      {pending ? '연결 중…' : '이 사람이 맞다 · 연결'}
                    </button>
                    <button
                      type="button"
                      className={c.actionBtn}
                      onClick={() => setPicked(null)}
                      disabled={pending}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  )
}
