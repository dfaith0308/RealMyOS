export const metadata = {
  title: '이용약관 — 식식이OS',
}

export default function TermsPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#f8f9fa', padding: '48px 16px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', background: '#fff', borderRadius: 12, padding: '28px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>이용약관 (최소 버전)</h1>
        <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 13 }}>
          본 문서는 유료 서비스 출시를 위한 최소 요건 문서입니다.
        </p>

        <section style={{ marginTop: 22, lineHeight: 1.8, color: '#111827' }}>
          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>1. 서비스 정보</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>서비스 명칭: 식식이OS</li>
            <li>운영자: [상호명] / 대표자: [대표자명]</li>
            <li>사업자등록번호: [사업자등록번호]</li>
            <li>연락처: [연락처] / 이메일: [이메일]</li>
          </ul>
          {/* TODO: 운영자 정보(상호/대표/사업자등록번호/연락처/이메일)를 실제 값으로 교체하세요. */}

          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>2. 서비스 목적</h2>
          <p style={{ margin: 0 }}>
            식식이OS는 식자재 공급망 운영 관리 플랫폼으로서 발주, 거래, 정산, 영업, 데이터 관리 기능을 제공합니다.
          </p>

          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>3. 회원의 의무</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>회원은 서비스 이용에 필요한 정보를 정확하게 제공해야 합니다.</li>
            <li>계정 정보의 관리 책임은 회원에게 있으며, 타인에게 계정을 양도/대여할 수 없습니다.</li>
            <li>법령 및 본 약관, 서비스 내 공지사항을 준수해야 합니다.</li>
          </ul>

          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>4. 서비스 이용 제한 사유</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>타인의 명의/정보 도용, 불법·부정 사용, 서비스 운영 방해</li>
            <li>요금 미납, 과도한 트래픽/발송 등 남용 행위</li>
            <li>관련 법령 또는 본 약관 위반</li>
          </ul>

          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>5. 전자금융 서비스 아님</h2>
          <p style={{ margin: 0 }}>
            식식이OS는 전자금융거래법상 전자금융업에 해당하는 서비스를 제공하지 않습니다. 결제/송금/예치금 등을 직접 취급하지 않습니다.
          </p>

          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>6. 책임 제한</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>운영자는 천재지변, 통신 장애 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.</li>
            <li>회원의 귀책사유로 발생한 손해에 대해 운영자는 책임을 지지 않습니다.</li>
            <li>운영자는 서비스 제공을 위해 합리적인 범위에서 기능/정책을 변경할 수 있습니다.</li>
          </ul>

          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>7. 데이터 보관 정책</h2>
          <p style={{ margin: 0 }}>
            서비스 운영 및 법적 의무 이행을 위해 거래 데이터 및 로그가 일정 기간 보관될 수 있으며, 보관 기간 및 범위는 개인정보처리방침을 따릅니다.
          </p>

          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>8. 약관 변경 고지</h2>
          <p style={{ margin: 0 }}>
            약관이 변경되는 경우 서비스 내 공지 또는 이메일 등 합리적인 방법으로 사전 고지합니다.
          </p>

          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>9. 준거법 및 관할</h2>
          <p style={{ margin: 0 }}>
            본 약관은 대한민국 법률을 준거법으로 하며, 분쟁이 발생한 경우 대한민국 법원에 제기합니다.
          </p>

          <p style={{ marginTop: 22, color: '#6b7280', fontSize: 13 }}>
            시행일: 2026년 5월
          </p>
        </section>
      </div>
    </main>
  )
}

