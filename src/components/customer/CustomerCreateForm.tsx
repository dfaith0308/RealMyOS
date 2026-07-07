'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCustomer, checkCustomerDuplicate } from '@/actions/customer'
import { upsertCustomerTag } from '@/actions/customer-tags'
import { formatPaymentTerms } from '@/lib/payment-terms'
import { isSafeNumber } from '@/lib/is-safe-number'
import SafeNumberSmsModal from '@/components/customer/SafeNumberSmsModal'
import type { PaymentTermsType } from '@/lib/payment-terms'
import type { AcquisitionChannel } from '@/actions/acquisition-channel'
import { addAcquisitionChannel } from '@/actions/acquisition-channel'
import styles from './CustomerCreateForm.module.css'

type CustomerType = 'business' | 'individual' | 'prospect'

function buildPaymentTermsString(
  termsType: PaymentTermsType,
  termsDay: string,
  termsDays: string,
) {
  if (termsType === 'monthly_day') {
    const d = Number(termsDay)
    return d ? `monthly_day:${d}` : 'monthly_day'
  }
  if (termsType === 'days_after') {
    const n = Number(termsDays)
    return n ? `days_after:${n}` : 'days_after'
  }
  return termsType
}

export default function CustomerCreateForm({
  channels: initChannels,
  tagOptions,
}: {
  channels: AcquisitionChannel[]
  tagOptions: Array<{ id: string; category: string; value: string; sort_order: number }>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dupWarning, setDupWarning] = useState<string | null>(null)   // 경고 (계속 가능)
  const [dupBlock, setDupBlock] = useState<{ id: string; name: string } | null>(null) // 차단

  const [customerType, setCustomerType] = useState<CustomerType>('business')
  const [bizNumber, setBizNumber] = useState('')
  const [name, setName] = useState('')
  const [repName, setRepName] = useState('')
  const [bizType, setBizType] = useState('') // 업태
  const [bizItem, setBizItem] = useState('') // 종목 (schema 없으면 business_type에 합쳐 저장)
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')

  const [openingBalance, setOpeningBalance] = useState('')
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().slice(0, 10))
  const [termsType, setTermsType] = useState<PaymentTermsType>('immediate')
  const [termsDays, setTermsDays] = useState('')
  const [termsDay, setTermsDay] = useState('')

  const [tradeStatus, setTradeStatus] = useState<'active' | 'inactive' | 'lead'>('active')
  const [isBuyer, setIsBuyer] = useState(true)
  const [isSupplier, setIsSupplier] = useState(false)
  const [channelId, setChannelId] = useState('')
  const [channels, setChannels] = useState(initChannels)
  const [newChannelName, setNewChannelName] = useState('')
  const [showAddCh, setShowAddCh] = useState(false)
  const [, startCh] = useTransition()
  const [targetRevenue, setTargetRevenue] = useState('')

  const [selectedTags, setSelectedTags] = useState<Map<string, string>>(new Map())

  const [showSafeModal, setShowSafeModal] = useState(false)
  const [savedCustomer, setSavedCustomer] = useState<{ id: string; name: string; phone: string } | null>(null)

  // payment_terms_days 역산
  function getTermsDays(): number {
    if (termsType === 'immediate') return 0
    if (termsType === 'days_after') return Number(termsDays) || 0
    return 0
  }

  function selectTag(category: string, value: string) {
    setSelectedTags((prev) => {
      const next = new Map(prev)
      if (value === '') {
        next.delete(category)
      } else {
        next.set(category, value)
      }
      return next
    })
  }

  function handleAddChannel() {
    if (!newChannelName.trim()) return
    startCh(async () => {
      const r = await addAcquisitionChannel(newChannelName)
      if (r.success && r.data) {
        setChannels((p) => [...p, r.data!])
        setChannelId(r.data.id)
        setNewChannelName('')
        setShowAddCh(false)
      } else {
        setError(r.error ?? '유입경로 추가 실패')
      }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('상호명/이름을 입력해주세요.'); return }
    if (!phone.trim()) { setError('연락처를 입력해주세요.'); return }
    if (dupBlock) { setError('이미 등록된 사업자번호입니다. 기존 거래처를 수정해주세요.'); return }
    if (!isBuyer && !isSupplier) {
      setError('매출처 또는 매입처 중 하나는 선택해야 합니다.')
      return
    }

    startTransition(async () => {
      const bizCombined =
        customerType === 'business'
          ? [bizType.trim(), bizItem.trim()].filter(Boolean).join(' / ')
          : ''

      const result = await createCustomer({
        customer_type:          customerType,
        name,
        phone:                  phone,
        address:                address || undefined,
        email:                  email || undefined,
        biz_number:             bizNumber || undefined,
        representative_name:    repName || undefined,
        business_type:          bizCombined || undefined,
        opening_balance:        openingBalance ? Number(openingBalance) : 0,
        opening_balance_date:   openingDate,
        payment_terms_type:     termsType,
        payment_terms_days:     getTermsDays(),
        payment_day:            termsType === 'monthly_day' ? (termsDay ? Number(termsDay) : undefined)
                              : termsType === 'days_after'  ? (termsDays ? Number(termsDays) : undefined)
                              : undefined,
        payment_terms: buildPaymentTermsString(termsType, termsDay, termsDays),
        trade_status:           tradeStatus,
        is_buyer:               isBuyer,
        is_supplier:            isSupplier,
        acquisition_channel_id: channelId || undefined,
        target_monthly_revenue: targetRevenue ? Number(targetRevenue) : undefined,
      })

      if (result.success && result.data?.id) {
        const customerId = result.data.id
        for (const [category, value] of selectedTags.entries()) {
          await upsertCustomerTag({ customer_id: customerId, category, value })
        }

        const savedPhone = phone.trim()
        if (isSafeNumber(savedPhone)) {
          setSavedCustomer({ id: customerId, name: name.trim(), phone: savedPhone })
          setShowSafeModal(true)
          return
        }

        router.push(`/customers/${customerId}`)
        return
      }

      if (result.success) router.push('/customers')
      else setError(result.error ?? '저장 실패')
    })
  }

  const termsPreview = formatPaymentTerms(termsType, termsDay ? Number(termsDay) : (termsDays ? Number(termsDays) : null))

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div className={styles.pageTitle}>거래처 등록</div>
        <Link href="/customers" className={styles.pageBack}>← 목록으로</Link>
      </div>

      <form onSubmit={handleSubmit} className={styles.formStack}>
        {error && <div className={styles.errBanner}>{error}</div>}

        {/* 카드 1 — 기본 정보 */}
        <section className={styles.secCard}>
          <div className={styles.secHead}>
            <div className={styles.secNum}>1</div>
            <div className={styles.secTitle}>기본 정보</div>
            <div className={styles.secDesc}>상호명·연락처 필수</div>
          </div>

          <div className={styles.secBody}>
            <div className={styles.field}>
              <div className={styles.label}>
                고객 유형 <span className={styles.opt}>(선택)</span>
              </div>
              <div className={styles.seg}>
                {([
                  { value: 'business', label: '사업자' },
                  { value: 'individual', label: '개인' },
                  { value: 'prospect', label: '예비' },
                ] as const).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={[
                      styles.segBtn,
                      customerType === o.value ? styles.segBtnOn : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setCustomerType(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <div className={styles.label}>
                상호명 / 이름 <span className={styles.req}>*</span>
              </div>
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 정무식당"
                required
              />
            </div>

            {customerType === 'business' && (
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <div className={styles.label}>대표자명 <span className={styles.opt}>(선택)</span></div>
                  <input
                    className={styles.input}
                    value={repName}
                    onChange={(e) => setRepName(e.target.value)}
                    placeholder="홍길동"
                  />
                </div>

                <div className={styles.field}>
                  <div className={styles.label}>사업자등록번호 <span className={styles.opt}>(선택)</span></div>
                  <input
                    className={styles.input}
                    value={bizNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/-/g, '')
                      setBizNumber(val)
                      setDupBlock(null)
                      setDupWarning(null)
                    }}
                    onBlur={async () => {
                      if (bizNumber.length < 10) return
                      const r = await checkCustomerDuplicate({ business_number: bizNumber })
                      if (r.success && r.data?.hasDuplicate) {
                        setDupBlock({ id: r.data.existingId!, name: r.data.existingName! })
                      }
                    }}
                    placeholder="숫자만 입력"
                    maxLength={10}
                  />
                </div>
              </div>
            )}

            <div className={styles.field}>
              <div className={styles.label}>
                연락처 <span className={styles.req}>*</span>
              </div>
              <input
                className={styles.input}
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setDupWarning(null) }}
                onBlur={async () => {
                  if (!name.trim() || !phone.trim()) return
                  const r = await checkCustomerDuplicate({ name, phone })
                  if (r.success && r.data?.hasSimilar) {
                    setDupWarning(`동일한 이름과 연락처의 거래처가 있습니다 (${r.data.existingName}). 계속 등록하시겠습니까?`)
                  }
                }}
                placeholder="010-0000-0000"
              />

              {dupWarning && (
                <div className={styles.dupWarn}>
                  {dupWarning}
                </div>
              )}
            </div>

            {customerType === 'business' && (
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <div className={styles.label}>업태 (업장 분류) <span className={styles.opt}>(선택)</span></div>
                  <input
                    className={styles.input}
                    value={bizType}
                    onChange={(e) => setBizType(e.target.value)}
                    placeholder="업태 (예: 음식점업)"
                  />
                </div>
                <div className={styles.field}>
                  <div className={styles.label}>종목 <span className={styles.opt}>(선택)</span></div>
                  <input
                    className={styles.input}
                    value={bizItem}
                    onChange={(e) => setBizItem(e.target.value)}
                    placeholder="종목 (예: 한식)"
                  />
                </div>
              </div>
            )}

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <div className={styles.label}>주소 <span className={styles.opt}>(선택)</span></div>
                <input
                  className={styles.input}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="주소 입력"
                />
              </div>

              <div className={styles.field}>
                <div className={styles.label}>이메일 <span className={styles.opt}>(선택)</span></div>
                <input
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="선택 입력"
                />
              </div>
            </div>

            {dupBlock && (
              <div className={styles.dupError}>
                <span>이미 등록된 거래처입니다 — {dupBlock.name}</span>
                <Link href={`/customers/${dupBlock.id}/edit`} className={styles.dupLink}>
                  거래처 보기
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* 카드 2 — 운영 분류 */}
        <section className={styles.secCard}>
          <div className={styles.secHead}>
            <div className={styles.secNum}>2</div>
            <span className={styles.secTitle}>운영 분류</span>
            <span className={styles.secDesc}>CRM · 자동화영업에 활용</span>
            <a
              href="/settings/tags"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.secLink}
            >
              ⚙️ 운영분류 설정
            </a>
          </div>

          <div className={styles.secBody}>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <div className={styles.label}>거래 상태 <span className={styles.opt}>(선택)</span></div>
                <select
                  className={styles.select}
                  value={tradeStatus}
                  onChange={(e) => setTradeStatus(e.target.value as any)}
                >
                  <option value="active">거래중</option>
                  <option value="lead">예비 거래처</option>
                  <option value="inactive">휴면</option>
                </select>
              </div>

              <div className={styles.field}>
                <div className={styles.label}>역할 <span className={styles.opt}>(선택)</span></div>
                <div className={styles.checkGroup}>
                  <label className={styles.checkItem}>
                    <input
                      type="checkbox"
                      checked={isBuyer}
                      onChange={(e) => setIsBuyer(e.target.checked)}
                    />
                    매출처
                  </label>
                  <label className={styles.checkItem}>
                    <input
                      type="checkbox"
                      checked={isSupplier}
                      onChange={(e) => setIsSupplier(e.target.checked)}
                    />
                    매입처
                  </label>
                </div>
              </div>
            </div>

            {!showAddCh ? (
              <div className={styles.field}>
                <div className={styles.label}>유입경로 <span className={styles.opt}>(선택)</span></div>
                <div className={styles.channelRow}>
                  <select
                    className={styles.select}
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                  >
                    <option value="">선택 안 함</option>
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>{ch.name}</option>
                    ))}
                  </select>
                  <button type="button" className={styles.btnSm} onClick={() => setShowAddCh(true)}>
                    직접 추가
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.field}>
                <div className={styles.label}>유입경로 직접 추가</div>
                <div className={styles.channelRow}>
                  <input
                    className={styles.input}
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="유입경로명 (예: 지인소개, 인스타그램)"
                  />
                  <button type="button" className={styles.btnSm} onClick={handleAddChannel}>
                    추가
                  </button>
                  <button
                    type="button"
                    className={styles.btnSm}
                    onClick={() => { setShowAddCh(false); setNewChannelName('') }}
                  >
                    취소
                  </button>
                </div>
              </div>
            )}

            <div className={styles.field}>
              <div className={styles.label}>목표 월매출 <span className={styles.opt}>(선택)</span></div>
              <input
                className={styles.input}
                value={targetRevenue}
                onChange={(e) => setTargetRevenue(e.target.value)}
                placeholder="예: 3000000"
                inputMode="numeric"
              />
            </div>

            {(() => {
              const groups = new Map<string, Array<{ id: string; value: string }>>()
              for (const o of tagOptions) {
                const list = groups.get(o.category) ?? []
                list.push({ id: o.id, value: o.value })
                groups.set(o.category, list)
              }
              const sorted = [...groups.entries()].sort(([a], [b]) =>
                a === '업종' ? -1 : b === '업종' ? 1 : a.localeCompare(b),
              )
              if (sorted.length === 0) return null
              return (
                <>
                  {sorted.map(([category, opts]) => (
                    <div key={`tag-${category}`} className={styles.field}>
                      <div className={styles.label}>
                        {category} <span className={styles.opt}>(선택)</span>
                      </div>
                      <select
                        className={styles.select}
                        value={selectedTags.get(category) ?? ''}
                        onChange={(e) => selectTag(category, e.target.value)}
                      >
                        <option value="">선택 안 함</option>
                        {opts.map((o) => (
                          <option key={o.id} value={o.value}>
                            {o.value}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </>
              )
            })()}
          </div>
        </section>

        {/* 카드 3 — 거래 조건 */}
        <section className={styles.secCard}>
          <div className={styles.secHead}>
            <div className={styles.secNum}>3</div>
            <div className={styles.secTitle}>거래 조건</div>
            <div className={styles.secDesc}>미입력 시 즉시결제 · 잔액 0원</div>
          </div>

          <div className={styles.secBody}>
            <div className={styles.field}>
              <div className={styles.label}>
                결제 조건 <span className={styles.opt}>(선택)</span> <span className={styles.opt}>— {termsPreview}</span>
              </div>
              <select
                className={styles.select}
                value={termsType}
                onChange={(e) => setTermsType(e.target.value as PaymentTermsType)}
              >
                <option value="immediate">즉시결제</option>
                <option value="monthly_end">말일</option>
                <option value="monthly_day">매월N일</option>
                <option value="days_after">N일후</option>
              </select>

              {termsType === 'monthly_day' && (
                <input
                  className={styles.input}
                  type="number"
                  value={termsDay}
                  onChange={(e) => setTermsDay(e.target.value)}
                  placeholder="몇 일? (예: 15)"
                  min={1}
                  max={31}
                />
              )}
              {termsType === 'days_after' && (
                <input
                  className={styles.input}
                  type="number"
                  value={termsDays}
                  onChange={(e) => setTermsDays(e.target.value)}
                  placeholder="며칠 후? (예: 30)"
                  min={1}
                />
              )}
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <div className={styles.label}>최초 미수금 <span className={styles.opt}>(선택)</span></div>
                <input
                  className={styles.input}
                  type="number"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className={styles.field}>
                <div className={styles.label}>최초 미수금 기준일 <span className={styles.opt}>(선택)</span></div>
                <input
                  className={styles.input}
                  type="date"
                  value={openingDate}
                  onChange={(e) => setOpeningDate(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.hint}>
              기존에 발생한 미수금이 있을 경우 입력하세요. 등록 후 직접 수정은 이력과 함께 진행합니다.
            </div>
          </div>
        </section>

        {/* Sticky 하단 버튼 */}
        <div className={styles.stickyFoot} aria-hidden={false}>
          <div className={styles.stickyFootInner}>
            <div className={styles.stickyFootLeft}>
              <strong>필수 입력</strong>{' '}— 상호명 · 연락처
            </div>
            <div className={styles.footRight}>
              <Link href="/customers" className={styles.btnCancel}>취소</Link>
              <button type="submit" className={styles.btnSubmit} disabled={isPending}>
                {isPending ? '저장 중...' : '거래처 등록'}
              </button>
            </div>
          </div>
        </div>
      </form>

      {showSafeModal && savedCustomer && (
        <SafeNumberSmsModal
          customerId={savedCustomer.id}
          customerName={savedCustomer.name}
          phone={savedCustomer.phone}
          onClose={() => {
            setShowSafeModal(false)
            router.push(`/customers/${savedCustomer.id}`)
          }}
          onSent={() => {
            setShowSafeModal(false)
            router.push(`/customers/${savedCustomer.id}`)
          }}
        />
      )}
    </div>
  )
}
