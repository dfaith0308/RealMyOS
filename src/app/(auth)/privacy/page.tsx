export const metadata = {
  title: '개인정보처리방침 — 식식이OS',
}

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#f8f9fa', padding: '48px 16px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', background: '#fff', borderRadius: 12, padding: '28px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>개인정보처리방침 (최소 버전)</h1>
        <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 13 }}>
          본 문서는 유료 서비스 출시를 위한 최소 요건 문서입니다.
        </p>

        <section style={{ marginTop: 22, lineHeight: 1.8, color: '#111827' }}>
          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>1. 수집하는 개인정보 항목</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>사업자명, 대표자명</li>
            <li>연락처, 이메일</li>
            <li>사업자등록번호</li>
            <li>거래 데이터(발주/주문/정산/메시지 로그 등 서비스 이용 과정에서 생성되는 데이터)</li>
          </ul>

          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>2. 개인정보 수집·이용 목적</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>서비스 제공 및 계정/테넌트 관리</li>
            <li>거래 내역 관리 및 운영 지원</li>
            <li>알림 발송(SMS 등)</li>
          </ul>

          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>3. 보유 및 이용 기간</h2>
          <p style={{ margin: 0 }}>
            회원 탈퇴 후 3년간 보관합니다. (상법 기준) 단, 관계 법령에 따라 보관이 필요한 경우 해당 기간을 따릅니다.
          </p>

          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>4. 제3자 제공</h2>
          <p style={{ margin: 0 }}>없음</p>

          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>5. 처리 위탁</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Supabase: 데이터베이스 저장</li>
            <li>Vercel: 서비스 호스팅</li>
            <li>알리고: SMS 발송</li>
          </ul>

          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>6. 정보주체의 권리</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>개인정보 열람, 정정, 삭제, 처리정지 요청 가능</li>
            <li>요청은 아래 개인정보 보호 책임자에게 문의할 수 있습니다.</li>
          </ul>

          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>7. 개인정보 보호 책임자</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>책임자: 김정무</li>
            <li>연락처: 032-215-3207</li>
            <li>이메일: dfaith0308@gmail.com</li>
          </ul>

          <p style={{ marginTop: 22, color: '#6b7280', fontSize: 13 }}>
            시행일: 2026년 5월
          </p>
        </section>
      </div>
    </main>
  )
}

