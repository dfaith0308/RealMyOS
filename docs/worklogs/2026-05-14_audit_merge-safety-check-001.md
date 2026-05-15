| 필드 | 값 |
|------|------|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

**MERGE-SAFETY-CHECK-001**: `dev`에 쌓인 migration·앱 변경이 **main 운영 DB**(payments·supplier_payables·commerce_orders·allocations·orders·tenants 등)에 **파괴적 영향**을 줄 수 있는지 **저장소 migration/SQL만** 근거로 판단한다. **코드 수정·migration 실행·DB 변경 없음.**

## 관련 `tasks.md` ID

- **[MERGE-SAFETY-CHECK-001]**

## 수정 파일 목록

- `docs/tasks.md`
- `docs/worklogs/2026-05-14_audit_merge-safety-check-001.md`

## migration 실행 여부

없음(분석만).

---

## SECTION 1 — destructive migration 감사 결과

**대상 테이블 관련 `supabase/migrations/` 스캔 요약**

| 패턴 | 핵심 테이블 영향 |
|------|------------------|
| **DROP TABLE / DROP COLUMN / TRUNCATE / DELETE FROM (일회성 데이터 마이그레이션)** | `payments`·`supplier_payables`·`commerce_orders`·`commerce_order_allocations`에 대한 **테이블/컬럼 DROP·TRUNCATE** 는 본 저장소 migration 목록에서 **해당 없음**. |
| **DELETE** | `20260506140000_update_order_lines_atomic.sql` 는 **`update_order_lines` RPC 내부**에서 `order_lines` DELETE 후 재삽입 — **일회적 데이터 wipe migration 아님**(함수 호출 시에만 동작). |
| **DROP INDEX / DROP CONSTRAINT** | `20260515100000_add_commerce_order_id_to_payments.sql`: CHECK 재정의를 위해 **기존 constraint DROP 후 재추가**. `20260515500000_add_reversal_fields.sql`: **`payments_commerce_order_id_unique` 인덱스 DROP** 후 부분 unique 재생성. **행 삭제 아님.** |
| **NOT NULL 강제(기존 NULL 불가)** | `payments`·`commerce_orders` 핵심 컬럼에 대한 **ADD … SET NOT NULL** 류는 검색 범위에서 **없음**(신규 컬럼은 nullable 또는 `IF NOT EXISTS`). |

**운영 데이터 “손실” 가능성 (migration 파일 자체만):**  
**직접적인 row 삭제·테이블 제거 migration 은 없음.** 다만 **인덱스/제약 추가 실패**로 migration **중단** 가능(아래 SECTION 2).

---

## SECTION 2 — append-only 관련 migration 안전성

| 파일 | 내용 | 기존 row 충돌 리스크 |
|------|------|----------------------|
| `20260515100000_add_commerce_order_id_to_payments.sql` | `commerce_order_id` nullable 추가, 부분 unique, `payment_method` CHECK 확장 | 이미 **동일 `commerce_order_id` 중복**(둘 다 null `reversal_of_id` 아님)이면 이후 `202605155`와 합쳐 **unique 생성 실패** 가능. `order_id`·`commerce_order_id` 동시 non-null이면 CHECK 추가 **실패**. |
| `20260515500000_add_reversal_fields.sql` | `reversal_*` nullable 컬럼 추가, 인덱스 교체, `payments_reversal_of_id_unique` | **동일 `reversal_of_id`를 가리키는 reversal 2건**이 있으면 unique 실패. **원본 다건**(같은 `commerce_order_id`, 둘 다 `reversal_of_id` null)이 있으면 `payments_commerce_order_id_primary_unique` **실패**. |
| `20260515600000` / `20260515700000_log_payment_reversal_audit*.sql` | RPC `CREATE OR REPLACE` | **기존 payments row 데이터 rewrite 없음.** |
| `supplier_payables` (15220000) | **CREATE TABLE IF NOT EXISTS** + nullable 메타 추가(155) | 기존 운영에 테이블이 이미 있으면 **스키마만 정렬**; **데이터 삭제 없음**. |

**`payments.type` NULL:** 저장소 migration grep 기준 **`payments.type` ADD migration 은 확인되지 않음** — 운영 DB에 컬럼이 **이미 있거나** 스키마가 migration 밖에서 관리된 경우 **앱·DB drift** 점검 필요(코드는 `type` 사용).

---

## SECTION 3 — RLS / tenant 영향

- **commerce_orders / allocations / supplier_payables**: `*_admin_all` + supplier **SELECT만 `supplier_tenant_id = get_my_tenant_id()`** 패턴(15200000·15220000 등). **dev 앱 변경은 migration 정책을 바꾸지 않음**(본 턴 DB 미적용 전제).
- **payments `fix_rls_with_check`**: 정책 보강 migration 존재 — 운영 적용 시 **기존 정책명·정의와 충돌**하면 적용 순서 이슈(실패 시 롤백은 운영 절차).
- **middleware / requireAdmin**: 코드 변경은 **라우트 접근**만; DB RLS와 **직접 충돌 없음**.

---

## SECTION 4 — merge 시 TOP 위험 5개 (과장 없이)

1. **`202605155` 인덱스 교체** — 기존 데이터가 새 partial unique 위반 시 **migration 실패·배포 중단**.  
2. **`202605151` CHECK** — `order_id`+`commerce_order_id` 동시 설정 row 존재 시 **실패**.  
3. **스키마 drift** — `payments.type` 등 **migration에 없는 컬럼**이 운영에 없으면 **앱만 먼저 merge 시 런타임 오류**.  
4. **`reverse_disbursement` RPC** — 레거시 **UPDATE `payments.status`**; 앱이 여전히 호출 가능한 경로면 **append-only 정책과 긴장**(기능은 기존과 동일 축).  
5. **적용 순서·누락** — main이 일부 migration만 적용된 상태면 **중간 상태**에서 앱 기대와 불일치.

---

## SECTION 5 — merge 전략 권장안

**A. dev→main merge 후 “main만 개발” 즉시 전환?**  
→ **migration이 운영 DB에 전부 성공 적용되고**, 스테이징에서 **동일 데이터 복제본으로 검증된 뒤**에나 안전. 그 전에는 **B. dev 유지 + 제어된 배포**(feature flag 없이도 **브랜치·배포 파이프라인 분리**)가 운영 데이터 보호에 유리.

**이유:** 본 저장소에는 **DDL·인덱스·CHECK가 많고**, 운영 실데이터가 이미 있다면 **“코드만 main”**은 스키마 미적용 시 **깨짐**, **migration만 선적용**은 앱 구버전과 **불일치**할 수 있음.

---

## SECTION 6 — merge 전 필수 체크리스트 (현실적)

1. **Supabase(또는 DB) 전체 백업** 직전 스냅샷.  
2. **운영 복제 staging**에 migration을 **시간순 전부** 적용해 보기.  
3. **사전 SQL**: `payments`에서 `(commerce_order_id, reversal_of_id)` 중복 후보, `order_id`+`commerce_order_id` 동시 non-null, `reversal_of_id` 중복 후보.  
4. **배포 순서** 고정: migration 완료 → 앱 배포(또는 팀 표준).  
5. **`payments.type` 존재 여부** `information_schema` 확인.

---

## SECTION 7 — 최종 결론

**조건부 가능 (merge / deploy)**  
- **조건:** 운영 DB 백업 + staging migration 리허설 + 위 중복·CHECK 위반 **없음** 확인 + `payments.type` 등 **앱 기대 스키마** 일치.  
- **보류가 맞는 경우:** staging에서 migration 실패·데이터 정리 필요가 나오면 **main merge 보류**, 정리 후 재시도.

**직접적 “migration 한 방에 운영 row 대량 삭제” 유형은 본 저장소 migration 목록 기준으로는 확인되지 않았다.** 위험은 주로 **제약 실패·순서·drift**이다.

## 다음 권장 작업

- 해내음코리아 운영 DB에서 **미적용 migration 목록** diff 후 staging 1회 전체 적용.
