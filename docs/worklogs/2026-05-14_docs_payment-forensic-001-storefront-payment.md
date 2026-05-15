# PAYMENT-FORENSIC-001 — storefront 결제 포렌식 문서화

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

식당OS storefront 체크아웃·`createCommerceOrder`·관리자 주문 화면을 코드 기준으로 읽어, **무통장·카드(PG)·카카오 전달**이 실제로 어디까지 구현되어 있는지 정리한다. 구현·migration은 하지 않는다.

## 2. 관련 `tasks.md` ID

- `PAYMENT-FORENSIC-001` (신규 블록)
- 참조: `COMMERCE-006` (결제 연동 과제), `COMMERCE-FLOW.md`, `COMMERCE-000` 문서 서술

## 3. 수정 파일 목록

- `docs/PAYMENT-FORENSIC-001.md` (신규)
- `docs/tasks.md`
- `docs/worklogs/2026-05-14_docs_payment-forensic-001-storefront-payment.md` (본 파일)

## 4. 변경 내용 요약

- Toss: **LEVEL 0** (패키지·라우트·승인 없음). 카드 UI는 비활성+submit 차단.
- 무통장: 주문·`pending_payment` 가능, **계좌 정보 UI 없음**.
- 카카오: **LEVEL 2** (`kakaotalk://` + 클립보드), API·상태 연동 없음.
- `payments`/ledger: storefront 주문 경로에 **연결 없음**.
- `COMMERCE-FLOW.md` 카드 자동 paid·24h 자동 취소는 **코드 미확인**으로 문서에 갭 명시.

## 5. migration 여부

없음.

## 6. 테스트 결과

- 문서·grep·파일 열람만 수행. `tsc` 미실행.

## 7. 남은 위험

- 운영자가 SSOT 문서만 읽으면 카드·자동 취소가 있는 것으로 오해할 수 있음 → `PAYMENT-FORENSIC-001.md`로 정정.

## 8. 다음 권장 작업

- `COMMERCE-FLOW.md` / `COMMERCE-000` 과 코드 정합 검토를 별 티켓으로 진행.
- 실입금 안내(설정 소스) 또는 PG 도입 시 별도 설계 ID.
