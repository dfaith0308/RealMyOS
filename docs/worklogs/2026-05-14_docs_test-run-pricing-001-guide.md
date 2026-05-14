| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

TEST-RUN-PRICING-001: pricing engine P0 구현에 대해 **실제 검증을 나중에 순서대로 실행**할 수 있도록 손 검증 가이드 문서를 추가한다. 본 턴은 **테스트 실행·코드·DB 변경 없음**.

## 관련 `tasks.md` ID

- 문서 사용법·OPS 이력에 **TEST-RUN-PRICING-001** 반영
- 맥락: **DISCOUNT-ENGINE-P0-001** 구현 산출물 검증용

## 수정 파일 목록

- `docs/TEST-RUN-PRICING-001.md` — 신규 (STEP 0~9·기록 템플릿·코드 기준 RPC명)
- `docs/TEST.md` — §7 migration 항목·§9 pricing 체크리스트 추가
- `docs/TEST-RUN-ERP-001.md` — 선행 권장(pricing→ERP)·migration 표에 pricing 파일 1행
- `docs/tasks.md` — 문서 사용법 번호 정렬·OPS 작업 이력

## 변경 내용 요약

- 가격 정책·스냅샷·폴백·우선순위·immutable·기간·`admin_logs`·ERP 조인 관찰·취소 후 스냅샷 유지를 단계별로 정리.
- 구현과 불일치하는 가상 RPC명을 쓰지 않고, **`fetch_active_pricing_policies_for_checkout`** / **`log_pricing_engine_admin_event`** 로 명시.
- 정책 필드 수정은 P0 관리자 UI에 없음 → STEP 4는 **SQL `UPDATE`** 안내.

## migration 여부

- 없음 (문서만)

## 테스트 결과

- 해당 없음 (문서 작성만). `npm run build` 등 코드 검증 미실행.

## 남은 위험

- `supabase_migrations.schema_migrations` 는 호스팅·도구에 따라 다를 수 있음 — 가이드에 병기함.

## 다음 권장 작업

- 스테이징에서 STEP 0~1 스모크 후 기록 템플릿으로 결과 남기기.
- **TEST-RUN-ERP-001** 과 같은 주문으로 allocation/payable 정합 재확인.
