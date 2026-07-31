'use client'

// 3rd copy — OrderStatementPDF.tsx, QuoteExportButton 참고. 4번째 문서 타입 생기면 공유 모듈 검토 필요

import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'
import type { LedgerForExport } from '@/actions/ledger-export'
import { classifyAccountsReceivable } from '@/lib/ledger-calc'

Font.register({
  family: 'NotoSansKR',
  fonts: [
    {
      src: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/alternative/Pretendard-Regular.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/alternative/Pretendard-Bold.ttf',
      fontWeight: 700,
    },
  ],
})

const GREEN = '#1f5d3a'
const CREAM = '#f7f6f2'

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 40,
    fontFamily: 'NotoSansKR',
    fontSize: 10,
    color: '#111827',
  },
  titleRow: {
    position: 'relative',
    borderBottomWidth: 2,
    borderBottomColor: GREEN,
    paddingBottom: 8,
    marginBottom: 16,
    minHeight: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 6,
    textAlign: 'center',
  },
  docNo: {
    position: 'absolute',
    right: 0,
    bottom: 10,
    fontSize: 9,
    color: '#4b5563',
    textAlign: 'right',
  },
  dual: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  box: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 10,
    minHeight: 96,
  },
  boxTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: GREEN,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 54, color: '#6b7280', fontSize: 9 },
  value: { flex: 1, fontSize: 9 },
  metaRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  metaBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 10,
    backgroundColor: CREAM,
  },
  metaLabel: { fontSize: 9, color: '#6b7280', marginBottom: 4 },
  metaValue: { fontSize: 12, fontWeight: 700 },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: GREEN,
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  th: { color: '#ffffff', fontSize: 9, fontWeight: 700 },
  tr: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  td: { fontSize: 9 },
  stamp: { width: 64, height: 64, objectFit: 'contain' },
  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 12 },
  summaryCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 10,
    backgroundColor: CREAM,
  },
  summaryLabel: { fontSize: 9, color: '#6b7280', marginBottom: 4 },
  summaryValue: { fontSize: 11, fontWeight: 700 },
})

function formatKRW(n: number) {
  return Math.round(n ?? 0).toLocaleString('ko-KR')
}

function partyLine(label: string, value: string | null | undefined) {
  if (!value) return null
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

const METHOD_LABEL: Record<string, string> = {
  transfer: '계좌이체',
  cash: '현금',
  card: '카드',
  platform: '플랫폼',
}

function rowDescription(type: 'order' | 'payment', summary?: string, memo?: string, method?: string) {
  if (type === 'order') return summary?.trim() || memo?.trim() || '-'
  const methodLabel = method ? METHOD_LABEL[method] ?? method : null
  const parts = [methodLabel, memo?.trim()].filter(Boolean)
  return parts.length ? parts.join(' · ') : '입금'
}

export function LedgerStatementPdfDoc({ data }: { data: LedgerForExport }) {
  const bankParts = [
    data.supplier.bank_name,
    data.supplier.bank_account,
    data.supplier.bank_holder ? `(예금주: ${data.supplier.bank_holder})` : null,
  ]
    .filter(Boolean)
    .join(' ')

  const arCurrent = classifyAccountsReceivable(data.current_balance)
  const arOpening = classifyAccountsReceivable(data.opening_balance)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>거 래 명 세 서</Text>
          <Text style={styles.docNo}>
            문서번호 {data.document_number}
            {'\n'}
            발행일 {data.issued_date}
          </Text>
        </View>

        <View style={styles.dual}>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>공급받는자</Text>
            {partyLine('상호', data.buyer.name)}
            {partyLine('사업자번호', data.buyer.business_number)}
            {partyLine('대표자', data.buyer.representative_name)}
            {partyLine('주소', data.buyer.address)}
            {partyLine('연락처', data.buyer.phone)}
          </View>

          <View style={[styles.box, { flexDirection: 'row' }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.boxTitle}>공급자</Text>
              {partyLine('상호', data.supplier.name)}
              {partyLine('사업자번호', data.supplier.business_number)}
              {partyLine('대표자', data.supplier.representative_name)}
              {partyLine('주소', data.supplier.address)}
              {partyLine('연락처', data.supplier.phone)}
            </View>
            {data.supplier.stamp_image_url ? (
              <View style={{ width: 72, alignItems: 'center', justifyContent: 'center', marginLeft: 6 }}>
                <Image src={data.supplier.stamp_image_url} style={styles.stamp} />
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>조회 기간</Text>
            <Text style={styles.metaValue}>
              {data.period_from} ~ {data.period_to}
            </Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>
              {arCurrent.kind === 'prepayment' ? '총초과입금' : '총미수금'}
            </Text>
            <Text style={[styles.metaValue, { color: arCurrent.color }]}>
              {formatKRW(arCurrent.absolute)}원
            </Text>
          </View>
        </View>

        <View>
          <View style={styles.tableHead}>
            <View style={{ width: '16%' }}>
              <Text style={styles.th}>날짜</Text>
            </View>
            <View style={{ width: '10%' }}>
              <Text style={styles.th}>구분</Text>
            </View>
            <View style={{ width: '34%' }}>
              <Text style={styles.th}>품목 / 메모</Text>
            </View>
            <View style={{ width: '20%' }}>
              <Text style={[styles.th, { textAlign: 'right' }]}>금액</Text>
            </View>
            <View style={{ width: '20%' }}>
              <Text style={[styles.th, { textAlign: 'right' }]}>잔액</Text>
            </View>
          </View>

          {data.rows.length === 0 ? (
            <View style={styles.tr} wrap={false}>
              <View style={{ width: '100%' }}>
                <Text style={[styles.td, { color: '#6b7280', textAlign: 'center' }]}>
                  기간 내 거래 내역이 없습니다
                </Text>
              </View>
            </View>
          ) : (
            data.rows.map((row) => {
              const isOrder = row.type === 'order'
              const amount = isOrder
                ? Number(row.total_amount ?? 0)
                : Number(row.payment_amount ?? 0)
              const lines = isOrder ? (row.lines ?? []) : []
              return (
                <View key={`${row.type}-${row.id}`} wrap={false}>
                  <View style={styles.tr}>
                    <View style={{ width: '16%' }}>
                      <Text style={styles.td}>{row.date}</Text>
                    </View>
                    <View style={{ width: '10%' }}>
                      <Text style={styles.td}>{isOrder ? '매출' : '입금'}</Text>
                    </View>
                    <View style={{ width: '34%' }}>
                      <Text style={styles.td}>
                        {rowDescription(row.type, row.summary, row.memo, row.payment_method)}
                      </Text>
                    </View>
                    <View style={{ width: '20%' }}>
                      <Text
                        style={[
                          styles.td,
                          {
                            textAlign: 'right',
                            fontWeight: 700,
                            color: isOrder ? '#111827' : GREEN,
                          },
                        ]}
                      >
                        {isOrder ? formatKRW(amount) : `-${formatKRW(amount)}`}
                      </Text>
                    </View>
                    <View style={{ width: '20%' }}>
                      <Text style={[styles.td, { textAlign: 'right' }]}>
                        {formatKRW(row.running_balance)}
                      </Text>
                    </View>
                  </View>

                  {lines.map((line, idx) => {
                    const qty = Number(line.quantity) || 0
                    const unit = Number(line.unit_price) || 0
                    const lineAmt =
                      line.line_total != null && Number.isFinite(Number(line.line_total))
                        ? Number(line.line_total)
                        : qty * unit
                    return (
                      <View
                        key={`${row.id}-line-${idx}`}
                        style={[styles.tr, { backgroundColor: '#fafafa' }]}
                      >
                        <View style={{ width: '16%' }}>
                          <Text style={styles.td}> </Text>
                        </View>
                        <View style={{ width: '10%' }}>
                          <Text style={styles.td}> </Text>
                        </View>
                        <View style={{ width: '34%' }}>
                          <Text style={[styles.td, { color: '#6b7280', paddingLeft: 10 }]}>
                            {line.product_name} × {qty}
                            {unit ? `  ·  ${formatKRW(unit)}` : ''}
                          </Text>
                        </View>
                        <View style={{ width: '20%' }}>
                          <Text style={[styles.td, { textAlign: 'right', color: '#6b7280' }]}>
                            {formatKRW(lineAmt)}
                          </Text>
                        </View>
                        <View style={{ width: '20%' }}>
                          <Text style={styles.td}> </Text>
                        </View>
                      </View>
                    )
                  })}
                </View>
              )
            })
          )}
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>
              {arOpening.kind === 'prepayment' ? '기초초과입금' : '전미수금'}
            </Text>
            <Text style={[styles.summaryValue, { color: arOpening.color }]}>
              {formatKRW(arOpening.absolute)}원
            </Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>기간매출</Text>
            <Text style={styles.summaryValue}>{formatKRW(data.period_sales)}원</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>기간입금</Text>
            <Text style={styles.summaryValue}>{formatKRW(data.period_payments)}원</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>
              {arCurrent.kind === 'prepayment' ? '총초과입금' : '총미수금'}
            </Text>
            <Text style={[styles.summaryValue, { color: arCurrent.color }]}>
              {formatKRW(arCurrent.absolute)}원
            </Text>
          </View>
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>입금 계좌</Text>
          <Text style={styles.value}>{bankParts || '미등록'}</Text>
        </View>
      </Page>
    </Document>
  )
}
