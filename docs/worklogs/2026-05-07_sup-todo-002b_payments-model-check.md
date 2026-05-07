# SUP-TODO-002-B — payments SSOT·status 정합 확인 (문서만)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |

## 작업 목적

`SUP-TODO-002-B` 범위에서 **PRODUCT §9**와 운영 DB의 **`payments.status` CHECK**를 대조하고, outbound 데이터 유무에 따라 **migration·백필 필요성**을 확정한다. 이번 턴은 **코드 변경 없음**.

## 관련 `tasks.md` ID

- `SUP-TODO-002-B` / 상위 `SUP-TODO-002`

## 수정 파일 목록

- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-todo-002b_payments-model-check.md`

코드 변경 없음.

## 변경 내용 요약

### 운영 DB CHECK (`pg_get_constraintdef`, `contype = 'c'`)

| 제약 요약 |
|-----------|
| `CHECK ((deposit_amount >= 0))` |
| `CHECK ((payment_method = ANY (ARRAY['transfer','cash','card','platform'])))` |
| `CHECK ((status = ANY (ARRAY['pending','confirmed','reversed'])))` |

→ PRODUCT §9의 **status 세트(`pending` / `confirmed` / `reversed`)와 일치**.

### 데이터 분포 (제공된 집계)

| status    | direction | count |
|-----------|-----------|------:|
| confirmed | inbound   | 87    |

→ **outbound 행 없음** (해당 스냅샷 기준). status 백필·outbound 정리 migration는 **당장 불필요**로 판단.

### PRODUCT §9 정합

- **status**: 운영 CHECK와 §9 정의 **일치** ✅  
- **컬럼명·type·reference_id·allocations**: 본 worklog에서는 “확인 완료” 수준이 아니라 **후속**(예: `SUP-TODO-002-C`~`D`, `SUP-TODO-005`)로 남김.

### 저장소 대비 참고 (잔여 리스크)

- 일부 RPC/마이그레이션 주석·코드에 **outbound insert 시 `planned`** 언급이 있으나, **현 운영 CHECK는 `planned` 미허용**. outbound 데이터가 생기기 전에 **신규 insert 경로를 `pending` 등으로 맞출지**는 구현 시점에 재검증 권장.

## migration 여부

없음 (본 작업·현 데이터 기준).

## 테스트 결과

코드 변경 없음 — `tsc` 등 **미실행**.

## 남은 위험

- outbound·`accept_bid` 연동 시 **status 값·RPC·CHECK** 불일치 가능성(데이터 없을 때는 드러나지 않음).

## 다음 권장 작업

- `SUP-TODO-002-C` 지급 분배(allocations) UX/로직  
- `SUP-TODO-002-D` 지급 취소(reversed) 및 이력  
- outbound 생성 경로 구현 시 **`pending` 사용** 및 집계 RPC 정합
