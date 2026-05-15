| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

운영 DB·migration·앱 코드 간 불일치를 한 문서에 고정해(`docs/FORENSIC.md`) 후속 수정 단계에서 같은 가정 실수를 줄인다.

## 관련 `tasks.md` ID

- `DB-TODO-002` (`admin_logs`)
- `DB-CHECK-004` (RLS `WITH CHECK` 잔여 — 문서 §2와 동일 축)

## 수정 파일 목록

- `docs/FORENSIC.md` (신규)
- `docs/tasks.md` (`DB-TODO-002` 작업 이력 한 줄)
- 코드 변경 없음

## 변경 내용 요약

- `admin_logs`: 운영/migration 컬럼(`admin_tenant_id`, `payload` 등)과 앱 INSERT 가정 컬럼 불일치를 **CRITICAL**로 기록.
- §4 정책키 매핑: 코드 검증 결과 `settlement_cycle_days`는 `settlement-control.ts`에서 소비됨 → 사용자 초안 표와 달리 **연결됨**으로 수정; 미연결 키는 5개로 정리.
- 알리고 `settings` vs `admin_settings`, `orders` 이중 테넌트 컬럼, CONTEXT/tasks 드리프트, 처리 순서 체크리스트 반영.

## migration 여부

없음 — 문서만.

## 테스트 결과

해당 없음 (문서 작성만).

## 남은 위험

- RLS `WITH CHECK`는 Supabase에서 미확인(문서 §2).
- `admin_logs` 앱 경로는 코드 수정 전까지 실패·누락 가능성 유지.

## 다음 권장 작업

- `DB-CHECK-004` 잔여: `orders`·`payments`·`rfq_requests` 정책 `WITH CHECK` 재검 후 `tasks.md`·FORENSIC §2 갱신.
- `admin_logs`: 스키마 확장 또는 INSERT를 `payload` 정렬 중 택일 후 구현.
