| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

정무님 확정 회계 이벤트 정책(append-only ledger·immutable snapshot·refund≠cancellation·reversal 중심·KPI 시점·부분 환불 범위)을 `DECISIONS.md` **[D-021]** · `PRODUCT.md` · `CONTEXT.md` · `tasks.md`에 반영한다.

## 관련 `tasks.md` ID

- **[ACCOUNTING-EVENT-POLICY-001]**
- 연계: **[D-021]**, **[D-017]**, **[D-020]**, **`[PLATFORM-ERP-001]`**, ACCOUNTING-EVENT-MODEL-001, ACCOUNTING-REVERSAL-DESIGN-001

## 수정 파일 목록

- `docs/DECISIONS.md` — **[D-021]** 신규
- `docs/PRODUCT.md` — `### 10-9` 하위 `#### 회계 이벤트 정책` 추가
- `docs/CONTEXT.md` — **`[ARCH-17A]`** 신규
- `docs/tasks.md` — 문서 목록 27번, Epic 블록, OPS·`[PLATFORM-ERP-001]` 연계·작업 이력
- `docs/worklogs/2026-05-14_docs_accounting-event-policy-001.md` (본 파일)

## 변경 내용 요약

- Q1 confirmed 이후 수동만·자동 rollback 금지, Q2 KPI는 reversal/refund 완료 기준(목표), Q3 주문 단위만·P0/P1 부분 환불 금지를 [D-021]로 고정.
- PRODUCT·CONTEXT에 운영/회계 분리·immutable·append-only·구현 전 금지·현재 vs 목표 표기.

## migration 여부

- 없음

## 테스트 결과

- 해당 없음 (문서만)

## 남은 위험

- 현행 코드 KPI는 일부 `confirmed` 입금 기준 — **[D-021] 목표와 구현 갭**이 남음(의도된 기술 부채).

## 다음 권장 작업

- `[PLATFORM-ERP-001]` 하위 구현 티켓에 [D-021] 준수 조건 명시.

---

## SECTION 1 — DECISIONS.md 추가 내용

- 신규 **`## [D-021] 회계 이벤트 정책 핵심 원칙`**: Q1/Q2/Q3, append-only·refund≠cancellation·KPI 시점·부분 환불 금지·immutable·연결 **[D-017]**·**[D-020]**·**`[PLATFORM-ERP-001]`**·근거 설계 문서 2종.

## SECTION 2 — PRODUCT.md 변경 내용

- **`### 10-9. 수익/정산 통제`** 끝에 **`#### 회계 이벤트 정책 (ACCOUNTING-EVENT-POLICY-001 · DECISIONS [D-021])`** 추가: [회계 이벤트 원칙]·[취소·환불 원칙]·[immutable 원칙]·[append-only 방향]; 10-9 일반 서술과 충돌 시 **[D-021] 우선** 문구.

## SECTION 3 — CONTEXT.md 변경 내용

- **`## [ARCH-17A] 플랫폼 회계 이벤트 정책`** 추가: reversal·immutable·현재 미구현·구현 전 금지·현재 vs 목표 표.

## SECTION 4 — tasks.md 변경 내용

- 문서 사용법 **항목 27** (`DECISIONS.md` [D-021]).
- **`[PLATFORM-ERP-001]`** 연계 목록에 **[D-021]** 추가.
- Epic **`#### [ACCOUNTING-EVENT-POLICY-001]`** 및 작업 이력(OPS·Epic 상위 목록).
- ACCOUNTING-EVENT-MODEL / REVERSAL Epic **연계**에 **[D-021]** 링크.

## SECTION 5 — 문서 일관성 점검 결과 (타 문서 본 턴 미수정)

| 대상 | 결과 |
|------|------|
| `ACCOUNTING-EVENT-MODEL-001` | SECTION 8이 **현행 KPI = `confirmed` 등 status 필터**를 사실로 기술. **[D-021]**은 **목표 = reversal/refund 완료 기준** — **현행 vs 목표** 이중 서술이 공존; EVENT-MODEL 본문은 사용자 지시에 따라 **이번 턴 수정하지 않음**. |
| `ACCOUNTING-REVERSAL-DESIGN-001` | status·`reversed`·void 병행 서술과 **[D-021]** append-only 목표는 **이행 단계에서 정렬**; 직접 모순으로 보이진 않음. |
| `PLATFORM-ERP-001` / tasks | Epic 연계에 [D-021] 반영함. |
| `DISCOUNT-ENGINE-DESIGN-001` / `DISCOUNT-ENGINE-POLICY-001` | [D-020]·스냅샷 불변과 **[D-021]** 정합. |
| `TEST-RUN-ERP-001` | confirmed 수동 검토·자동 부재 서술과 **[D-021] Q1** 정합. |
| `CONTEXT.md` **[ARCH-17]** 미수금 예시에 `type='refund'` orders | storefront `commerce_orders`와 표기 축이 다를 수 있음 — **기존 ARCH-17 문장은 변경하지 않음**(이번 범위 밖). |
| `PRODUCT.md` 10-9 “자동 정산” 등 | **부분 긴장** — 신규 절에 **[D-021] 우선**으로 완화 문구 삽입함. |

## SECTION 6 — 현재 구조 vs 목표 구조 요약

- **현재**: 일부 축에서 **status 필터 집계**·**`reversed` UPDATE**·주문 **cancelled와 `payments` 비동기** 등이 공존.
- **목표([D-021])**: **운영 상태와 회계 이벤트 분리**, **append-only reversal**, **KPI는 reversal/refund 완료**, **confirmed 이후 수동**, **overwrite 금지**.

**명시**: 현재는 **정책 확정 단계**이며, reversal/refund **append-only 구현** 및 KPI 재계산 반영은 **아직 미구현**이다.
