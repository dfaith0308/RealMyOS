# ORDER-LOCK-FORENSIC-001 — 주문 수정 잠금 설정 연결 포렌식

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

`admin_settings.order_edit_lock_days = 50` 변경이 앱에 반영되는지 여부를 **`realmyos/src/` 코드만**으로 확정한다. 코드·DB 설정·migration 변경은 하지 않는다.

## 2. 관련 `tasks.md` ID

- `ORDER-LOCK-FORENSIC-001` (신규)
- 연관 참고: `ORDER-FORENSIC-001`

## 3. 수정 파일 목록

- `docs/ORDER-LOCK-FORENSIC-001.md` (신규)
- `docs/tasks.md`
- `docs/worklogs/2026-05-14_docs_order-lock-forensic-001-settings-vs-admin.md` (본 파일)

## 4. 변경 내용 요약

- `order_edit_lock_days` 사용 파일·역할(읽기/폴백/UI/enforcement) 표로 정리.
- 잠금은 **`settings` 테이블** + 폴백 **7**; **`admin_settings`는 해당 키 미사용** → 운영에서 admin만 50이면 주문 잠금에 **영향 없음**(CASE B).

## 5. migration 여부

없음.

## 6. 테스트 결과

- `src/` grep 및 `order.ts`·`settings.ts`·편집 페이지 열람. 빌드·DB 조회 미실행.

## 7. 남은 위험

- DB에 `settings`와 `admin_settings`에 동시에 키가 있을 때 운영자가 **어느 쪽이 SSOT인지 혼동**할 수 있음.

## 8. 다음 권장 작업

- 운영 문서에 “주문 수정 일수 = 테넌트 `settings`” 명시 또는 관리 UI 라벨 정합.
