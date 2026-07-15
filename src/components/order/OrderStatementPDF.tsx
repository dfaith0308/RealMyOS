'use client'

import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'
import type { OrderForExport } from '@/actions/order-export'

// gstatic NotoSansKR woff2 / googlefonts ofl 경로는 404 → jsDelivr Pretendard TTF 사용
// (@react-pdf는 TTF 권장; Helvetica는 한글 깨짐)
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
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: CREAM,
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  stamp: { width: 64, height: 64, objectFit: 'contain' },
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

export function computeStatementTotal(data: OrderForExport): number {
  return data.lines.reduce((sum, line) => {
    const qty = Number(line.quantity) || 0
    const price = Number(line.unit_price) || 0
    return sum + qty * price
  }, 0)
}

export function OrderStatementPdfDoc({ data }: { data: OrderForExport }) {
  const total = computeStatementTotal(data)
  const bankParts = [
    data.supplier.bank_name,
    data.supplier.bank_account,
    data.supplier.bank_holder ? `(예금주: ${data.supplier.bank_holder})` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>거 래 명 세 서</Text>
          <Text style={styles.docNo}>문서번호 {data.document_number}</Text>
        </View>

        <View style={styles.dual}>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>공급받는자</Text>
            {partyLine('상호', data.buyer.name)}
            {partyLine('사업자번호', data.buyer.business_number)}
            {partyLine('대표자', data.buyer.representative_name)}
            {partyLine('주소', data.buyer.address)}
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
            <Text style={styles.metaLabel}>작성일</Text>
            <Text style={styles.metaValue}>{data.order_date || '-'}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>합계금액</Text>
            <Text style={styles.metaValue}>{formatKRW(total)}원</Text>
          </View>
        </View>

        <View>
          <View style={styles.tableHead}>
            <View style={{ width: '46%' }}>
              <Text style={styles.th}>품목명</Text>
            </View>
            <View style={{ width: '14%' }}>
              <Text style={[styles.th, { textAlign: 'right' }]}>수량</Text>
            </View>
            <View style={{ width: '20%' }}>
              <Text style={[styles.th, { textAlign: 'right' }]}>단가</Text>
            </View>
            <View style={{ width: '20%' }}>
              <Text style={[styles.th, { textAlign: 'right' }]}>금액</Text>
            </View>
          </View>

          {data.lines.map((line, idx) => {
            const amount = (Number(line.quantity) || 0) * (Number(line.unit_price) || 0)
            return (
              <View key={`${line.product_name}-${idx}`} style={styles.tr} wrap={false}>
                <View style={{ width: '46%' }}>
                  <Text style={styles.td}>{line.product_name}</Text>
                </View>
                <View style={{ width: '14%' }}>
                  <Text style={[styles.td, { textAlign: 'right' }]}>{line.quantity}</Text>
                </View>
                <View style={{ width: '20%' }}>
                  <Text style={[styles.td, { textAlign: 'right' }]}>{formatKRW(line.unit_price)}</Text>
                </View>
                <View style={{ width: '20%' }}>
                  <Text style={[styles.td, { textAlign: 'right', fontWeight: 700 }]}>{formatKRW(amount)}</Text>
                </View>
              </View>
            )
          })}

          <View style={styles.totalRow} wrap={false}>
            <View style={{ width: '80%' }}>
              <Text style={{ fontSize: 10, fontWeight: 700, textAlign: 'right' }}>합계</Text>
            </View>
            <View style={{ width: '20%' }}>
              <Text style={{ fontSize: 10, fontWeight: 700, textAlign: 'right' }}>{formatKRW(total)}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.dual, { marginTop: 14 }]}>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>입금 계좌</Text>
            <Text style={styles.value}>{bankParts || '미등록'}</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>비고</Text>
            <Text style={styles.value}>{data.memo?.trim() || '-'}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
