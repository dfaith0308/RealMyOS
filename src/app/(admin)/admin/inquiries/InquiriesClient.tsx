'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { uploadListingImage } from '@/actions/admin/commerce'
import { createInquiry } from '@/actions/admin/inquiries'
import {
  ETC_VALUE,
  INQUIRY_TYPES,
  INQUIRY_VIEW_OPTIONS,
  RESPONSE_METHODS,
  formatInquiryDateTime,
  inquiryTypeLabel,
  kstLocalInputToIso,
  nowKstLocalInput,
  responseMethodLabel,
  type InquiryRow,
  type InquiryView,
} from '@/types/inquiry'
import s from '../../admin-shared.module.css'
import c from './inquiries.module.css'

/** 상세이미지 업로드와 같은 피커 필터 */
const ACCEPT_IMAGE =
  'image/jpeg,image/jpg,image/pjpeg,image/png,image/webp,image/heic,image/heif,application/octet-stream,.jpg,.jpeg,.png,.webp,.heic,.heif'
const MAX_IMAGE_FILE_BYTES = 8 * 1024 * 1024
const MAX_PHOTOS = 10

type PhotoSlot = {
  id: string
  url: string
  name: string
  status: 'uploading' | 'done' | 'error'
  error?: string
}

function slotId(): string {
  try {
    const g = globalThis.crypto
    if (g && typeof g.randomUUID === 'function') return g.randomUUID()
  } catch {
    /* 비보안 컨텍스트에서는 randomUUID 를 못 쓴다 */
  }
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/** 상세이미지 업로드와 동일 기준 */
function validateImageFile(file: File): string | null {
  if (file.size === 0) return '빈 파일입니다'
  if (file.size > MAX_IMAGE_FILE_BYTES) return '8MB 이하 이미지만 업로드 가능합니다'

  const mime = (file.type ?? '').trim().toLowerCase()
  const extOk = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)
  const mimeOk = /^image\/(jpeg|jpg|pjpeg|png|webp|heic|heif)/i.test(mime)
  const octetOk = mime === 'application/octet-stream' && extOk

  if (extOk || mimeOk || octetOk) return null
  return 'JPG/PNG/WebP/HEIC·HEIF만 업로드 가능합니다'
}

/** 목록의 O/X — 색이 아니라 글자가 뜻을 갖는다 */
function Mark({ on }: { on: boolean }) {
  return on ? <span className={c.markYes}>O</span> : <span className={c.markNo}>X</span>
}

export default function InquiriesClient({
  view,
  inquiries,
  q,
}: {
  view: InquiryView
  inquiries: InquiryRow[]
  q: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const [formOpen, setFormOpen] = useState(false)

  // ── 등록 폼 ──
  const [inquiredAt, setInquiredAt] = useState(nowKstLocalInput())
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [inquiryType, setInquiryType] = useState<string>(INQUIRY_TYPES[0].value)
  const [inquiryTypeEtc, setInquiryTypeEtc] = useState('')
  const [responseMethod, setResponseMethod] = useState<string>(RESPONSE_METHODS[0].value)
  const [responseMethodEtc, setResponseMethodEtc] = useState('')
  const [priceGuided, setPriceGuided] = useState(false)
  const [priceNote, setPriceNote] = useState('')
  const [paymentGuided, setPaymentGuided] = useState(false)
  const [paymentNote, setPaymentNote] = useState('')
  const [shipped, setShipped] = useState(false)
  const [shippingNote, setShippingNote] = useState('')
  const [memo, setMemo] = useState('')
  const [photos, setPhotos] = useState<PhotoSlot[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const uploading = photos.some((p) => p.status === 'uploading')

  // ── 사진 업로드 (관찰기록·상세이미지와 같은 서버 액션·버킷) ──
  async function uploadOne(slot: PhotoSlot, file: File) {
    const fd = new FormData()
    fd.set('file', file)
    try {
      const res = await uploadListingImage(fd)
      setPhotos((prev) =>
        prev.map((p) =>
          p.id !== slot.id
            ? p
            : res.success
              ? { ...p, url: res.data?.url ?? '', status: 'done' as const }
              : { ...p, status: 'error' as const, error: res.error ?? '업로드 실패' },
        ),
      )
    } catch {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id !== slot.id
            ? p
            : { ...p, status: 'error' as const, error: '네트워크 오류로 업로드에 실패했습니다' },
        ),
      )
    }
  }

  function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setFormError(null)
    setOkMsg(null)

    const room = MAX_PHOTOS - photos.length
    if (room <= 0) {
      setFormError(`사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있습니다`)
      return
    }
    if (files.length > room) setFormError(`사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있습니다`)

    for (const file of files.slice(0, room)) {
      const invalid = validateImageFile(file)
      const slot: PhotoSlot = {
        id: slotId(),
        url: '',
        name: file.name,
        status: invalid ? 'error' : 'uploading',
        error: invalid ?? undefined,
      }
      setPhotos((prev) => [...prev, slot])
      if (!invalid) void uploadOne(slot, file)
    }
  }

  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id))
  }

  function resetForm() {
    setInquiredAt(nowKstLocalInput())
    setCustomerName('')
    setCustomerPhone('')
    setInquiryType(INQUIRY_TYPES[0].value)
    setInquiryTypeEtc('')
    setResponseMethod(RESPONSE_METHODS[0].value)
    setResponseMethodEtc('')
    setPriceGuided(false)
    setPriceNote('')
    setPaymentGuided(false)
    setPaymentNote('')
    setShipped(false)
    setShippingNote('')
    setMemo('')
    setPhotos([])
  }

  function handleSave() {
    setFormError(null)
    setOkMsg(null)

    if (!customerName.trim() && !customerPhone.trim()) {
      setFormError('고객명 또는 연락처 중 하나는 입력해야 합니다')
      return
    }
    if (inquiryType === ETC_VALUE && !inquiryTypeEtc.trim()) {
      setFormError('문의유형 기타 내용을 입력하세요')
      return
    }
    if (responseMethod === ETC_VALUE && !responseMethodEtc.trim()) {
      setFormError('응대방식 기타 내용을 입력하세요')
      return
    }
    if (uploading) {
      setFormError('사진 업로드가 끝난 뒤 저장해 주세요')
      return
    }

    const iso = kstLocalInputToIso(inquiredAt)
    if (!iso) {
      setFormError('문의일시를 확인해 주세요')
      return
    }

    const photo_urls = photos.filter((p) => p.status === 'done' && p.url).map((p) => p.url)

    start(async () => {
      const res = await createInquiry({
        inquiry_type: inquiryType,
        inquiry_type_etc: inquiryTypeEtc,
        response_method: responseMethod,
        response_method_etc: responseMethodEtc,
        price_guided: priceGuided,
        price_guide_note: priceNote,
        payment_guided: paymentGuided,
        payment_guide_note: paymentNote,
        shipped,
        shipping_note: shippingNote,
        memo,
        photo_urls,
        customer_name: customerName,
        customer_phone: customerPhone,
        inquired_at: iso,
      })
      if (!res.success) {
        setFormError(res.error ?? '저장에 실패했습니다')
        return
      }
      resetForm()
      setOkMsg('문의를 기록했습니다.')
      router.refresh()
    })
  }

  function go(next: { view?: InquiryView; q?: string }) {
    const params = new URLSearchParams()
    const v = next.view ?? view
    if (v !== 'all') params.set('view', v)
    const query = (next.q ?? q).trim()
    if (query) params.set('q', query)
    const qs = params.toString()
    start(() => {
      router.push(qs ? `/admin/inquiries?${qs}` : '/admin/inquiries')
    })
  }

  return (
    <>
      {/* ── 새 문의 등록 ── */}
      <section className={c.card}>
        <div className={s.headerBetween}>
          <h2 className={c.cardTitle}>새 문의 등록</h2>
          <button
            type="button"
            className={c.actionBtn}
            onClick={() => {
              setFormOpen((v) => !v)
              setFormError(null)
              setOkMsg(null)
            }}
          >
            {formOpen ? '접기' : '＋ 문의 기록하기'}
          </button>
        </div>

        {!formOpen ? (
          <p className={c.hint}>
            고객이 먼저 연락해 온 내용을 남깁니다. 담당자는 로그인한 관리자 계정으로 자동 기록됩니다.
          </p>
        ) : (
          <>
            <div className={c.formGrid}>
              <div>
                <label className={c.formLabel} htmlFor="inq-at">
                  문의일시
                </label>
                <input
                  id="inq-at"
                  type="datetime-local"
                  className={c.formInput}
                  value={inquiredAt}
                  onChange={(e) => setInquiredAt(e.target.value)}
                  disabled={pending}
                />
              </div>

              <div>
                <label className={c.formLabel} htmlFor="inq-name">
                  고객명
                </label>
                <input
                  id="inq-name"
                  className={c.formInput}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="예: 김정무"
                  disabled={pending}
                />
              </div>

              <div>
                <label className={c.formLabel} htmlFor="inq-phone">
                  연락처
                </label>
                <input
                  id="inq-phone"
                  className={c.formInput}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="예: 010-1234-5678"
                  disabled={pending}
                />
              </div>

              <div>
                <label className={c.formLabel} htmlFor="inq-type">
                  문의유형
                </label>
                <select
                  id="inq-type"
                  className={c.formSelect}
                  value={inquiryType}
                  onChange={(e) => setInquiryType(e.target.value)}
                  disabled={pending}
                >
                  {INQUIRY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {inquiryType === ETC_VALUE && (
                  <input
                    className={`${c.formInput} ${c.etcInput}`}
                    value={inquiryTypeEtc}
                    onChange={(e) => setInquiryTypeEtc(e.target.value)}
                    placeholder="문의유형을 직접 입력"
                    aria-label="문의유형 직접 입력"
                    disabled={pending}
                  />
                )}
              </div>

              <div>
                <label className={c.formLabel} htmlFor="inq-method">
                  응대방식
                </label>
                <select
                  id="inq-method"
                  className={c.formSelect}
                  value={responseMethod}
                  onChange={(e) => setResponseMethod(e.target.value)}
                  disabled={pending}
                >
                  {RESPONSE_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {responseMethod === ETC_VALUE && (
                  <input
                    className={`${c.formInput} ${c.etcInput}`}
                    value={responseMethodEtc}
                    onChange={(e) => setResponseMethodEtc(e.target.value)}
                    placeholder="응대방식을 직접 입력"
                    aria-label="응대방식 직접 입력"
                    disabled={pending}
                  />
                )}
              </div>
            </div>

            <label className={c.formLabel}>진행 상황</label>
            <div className={c.progressRow}>
              <label className={c.checkItem}>
                <input
                  type="checkbox"
                  checked={priceGuided}
                  onChange={(e) => setPriceGuided(e.target.checked)}
                  disabled={pending}
                />
                가격안내
              </label>
              <input
                className={c.noteInput}
                value={priceNote}
                onChange={(e) => setPriceNote(e.target.value)}
                placeholder="안내한 내용 (예: 1병 12,000원)"
                aria-label="가격안내 내용"
                disabled={pending || !priceGuided}
              />
            </div>
            <div className={c.progressRow}>
              <label className={c.checkItem}>
                <input
                  type="checkbox"
                  checked={paymentGuided}
                  onChange={(e) => setPaymentGuided(e.target.checked)}
                  disabled={pending}
                />
                결제안내
              </label>
              <input
                className={c.noteInput}
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="안내한 내용 (예: 계좌이체 안내, 입금 대기)"
                aria-label="결제안내 내용"
                disabled={pending || !paymentGuided}
              />
            </div>
            <div className={c.progressRow}>
              <label className={c.checkItem}>
                <input
                  type="checkbox"
                  checked={shipped}
                  onChange={(e) => setShipped(e.target.checked)}
                  disabled={pending}
                />
                발송
              </label>
              <input
                className={c.noteInput}
                value={shippingNote}
                onChange={(e) => setShippingNote(e.target.value)}
                placeholder="부연 설명 (예: 당일발송)"
                aria-label="발송 내용"
                disabled={pending || !shipped}
              />
            </div>

            <label className={c.formLabel} htmlFor="inq-memo">
              상세메모
            </label>
            <textarea
              id="inq-memo"
              className={c.textarea}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="고객이 한 말을 그대로 적어두면 나중에 도움이 됩니다."
              disabled={pending}
            />

            <label className={c.formLabel}>사진</label>
            <label className={c.photoBtn}>
              <span className={c.photoBtnIcon}>＋</span>
              사진 첨부
              <span className={c.photoBtnSub}>여러 장 가능 · 선택</span>
              <input
                type="file"
                accept={ACCEPT_IMAGE}
                multiple
                className={c.hiddenInput}
                onChange={onPickPhotos}
                disabled={pending}
              />
            </label>

            {photos.length > 0 && (
              <div className={c.photoGrid}>
                {photos.map((p) => (
                  <div key={p.id} className={c.photoItem}>
                    {p.status === 'done' && p.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt="" className={c.photoImg} />
                    ) : (
                      <div className={c.photoPlaceholder}>
                        {p.status === 'uploading' ? '업로드 중…' : '실패'}
                      </div>
                    )}
                    <button
                      type="button"
                      className={c.photoRemove}
                      onClick={() => removePhoto(p.id)}
                      aria-label="사진 제거"
                    >
                      ×
                    </button>
                    {p.status === 'error' && <span className={c.photoErr}>{p.error}</span>}
                  </div>
                ))}
              </div>
            )}

            <p className={c.hint}>담당자는 로그인한 관리자 계정으로 자동 기록됩니다.</p>

            {formError && <p className={c.errText}>{formError}</p>}
            {okMsg && <p className={c.okText}>{okMsg}</p>}

            <div className={c.actionRow}>
              <button
                type="button"
                className={`${c.actionBtn} ${c.actionBtnPrimary}`}
                onClick={handleSave}
                disabled={pending || uploading}
              >
                {pending ? '저장 중…' : uploading ? '사진 업로드 중…' : '저장'}
              </button>
              <button
                type="button"
                className={c.actionBtn}
                onClick={resetForm}
                disabled={pending}
              >
                비우기
              </button>
            </div>
          </>
        )}
        {!formOpen && okMsg && <p className={c.okText}>{okMsg}</p>}
      </section>

      {/* ── 목록 ── */}
      <div className={c.toolbar}>
        {INQUIRY_VIEW_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`${c.viewBtn} ${view === o.value ? c.viewBtnActive : ''}`}
            onClick={() => go({ view: o.value })}
          >
            {o.label}
          </button>
        ))}
        <input
          className={`${c.textInput} ${c.grow}`}
          placeholder="고객명 · 연락처 · 메모 검색"
          defaultValue={q}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go({ q: (e.target as HTMLInputElement).value })
          }}
          onBlur={(e) => {
            if (e.target.value !== q) go({ q: e.target.value })
          }}
        />
      </div>

      {inquiries.length === 0 ? (
        <div className={s.empty}>
          {q ? '검색 결과가 없습니다.' : '아직 기록된 문의가 없습니다.'}
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr className={s.theadRow}>
                <th className={s.th}>문의일시</th>
                <th className={s.th}>고객</th>
                <th className={s.th}>문의유형</th>
                <th className={s.th}>응대방식</th>
                <th className={s.thSm}>가격안내</th>
                <th className={s.thSm}>결제안내</th>
                <th className={s.thSm}>발송</th>
                <th className={s.th}>매칭상태</th>
              </tr>
            </thead>
            <tbody>
              {inquiries.map((inq) => (
                <tr key={inq.id}>
                  <td className={s.tdNowrap}>
                    <Link href={`/admin/inquiries/${inq.id}`} className={c.rowLink}>
                      {formatInquiryDateTime(inq.inquired_at)}
                    </Link>
                  </td>
                  <td className={s.td}>
                    <Link href={`/admin/inquiries/${inq.id}`} className={c.rowLink}>
                      {inq.customer_name || inq.customer_phone || '(이름 없음)'}
                    </Link>
                    {inq.customer_name && inq.customer_phone && (
                      <div className={s.cellMutedXs}>{inq.customer_phone}</div>
                    )}
                    {inq.photo_urls.length > 0 && (
                      <span className={c.photoCount}>📷 {inq.photo_urls.length}</span>
                    )}
                  </td>
                  <td className={s.td}>{inquiryTypeLabel(inq.inquiry_type, inq.inquiry_type_etc)}</td>
                  <td className={s.td}>
                    {responseMethodLabel(inq.response_method, inq.response_method_etc)}
                  </td>
                  <td className={s.tdSm}>
                    <Mark on={inq.price_guided} />
                  </td>
                  <td className={s.tdSm}>
                    <Mark on={inq.payment_guided} />
                  </td>
                  <td className={s.tdSm}>
                    <Mark on={inq.shipped} />
                  </td>
                  <td className={s.tdNowrap}>
                    {inq.match_status === 'matched' ? (
                      <span className={`${c.badge} ${c.badgeMatched}`}>
                        {inq.matched_tenant_name ?? '연결됨'}
                      </span>
                    ) : (
                      <Link href={`/admin/inquiries/${inq.id}`} className={c.rowLink}>
                        <span className={`${c.badge} ${c.badgeUnmatched}`}>미매칭 · 연결하기</span>
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
