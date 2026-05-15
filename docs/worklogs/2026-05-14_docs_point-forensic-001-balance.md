# POINT-FORENSIC-001 — 적립금(포인트) 잔고 포렌식

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

`orders.point_used`·적립금 UI가 **실제 잔고 기반인지**, 아니면 **주문 헤더 숫자 필드인지**를 `src`·`docs/CONTEXT.md`·`supabase/migrations` 근거로 확정한다.

## 2. 관련 `tasks.md` ID

- `POINT-FORENSIC-001` (신규)
- 참고: `ORDER-FORENSIC-001`

## 3. 수정 파일 목록

- `docs/POINT-FORENSIC-001.md` (신규)
- `docs/tasks.md`
- `docs/worklogs/2026-05-14_docs_point-forensic-001-balance.md` (본 파일)

## 4. 변경 내용 요약

- CONTEXT 테이블 인벤토리에 포인트 전용 테이블 없음; incremental migration에서 `point` 문자열 0건.
- `createOrder`만 `point_used` 검증·insert; 잔고 차감·취소 환급 RPC 없음 → **CASE C** + 원장은 `final_amount`로 **부분 반영(CASE D 요소)**.

## 5. migration 여부

없음.

## 6. 테스트 결과

- grep·파일 열람만. DB·실행 테스트 없음.

## 7. 남은 위험

- 외부 적립 장부와 앱 숫자 불일치·취소 시 stats `total_amount` 기준 등은 본 문서 §6에 정리.

## 8. 다음 권장 작업

- 잔고 시스템 도입 시 별도 테이블·원자 RPC·취소 정책 설계 ID.
