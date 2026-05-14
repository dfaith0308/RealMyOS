# PAYMENTS-TAXONOMY-POLICY-001 — payments.type taxonomy 정책 문서화

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

`payments.type` 회계 이벤트 taxonomy에 대해 정무님 확정안(Q1 NULL·Q2 settlement 명칭·Q3 P1 enforcement 순서)을 **`DECISIONS.md` [D-022]** 및 제품·아키텍처 문서에 반영하고, `planned` / CHECK / 운영 관측 불일치를 **latent schema drift**로 공식 기록한다. **구현·migration·DB 변경은 범위 외**다.

## 2. 관련 `tasks.md` ID

**[PAYMENTS-TAXONOMY-POLICY-001]** — 연계: **[PAYMENTS-TAXONOMY-DESIGN-001]**, **[ACCOUNTING-EVENT-MODEL-001]**, **[ACCOUNTING-EVENT-POLICY-001]** / **[D-021]**, **[D-022]**, **`[PLATFORM-ERP-001]`**, **[KPI-REVERSAL-P0-001]**, **[ACCOUNTING-REVERSAL-P0-001]**

## 3. 수정 파일 목록

- `docs/DECISIONS.md` — **[D-022]** 신설
- `docs/PRODUCT.md` — §10-9 `payments.type` taxonomy 정책 절 추가
- `docs/CONTEXT.md` — **[SCHEMA-DRIFT-001]** · semantics drift 원칙 · taxonomy enforcement 상태
- `docs/tasks.md` — 문서 사용법 31번 · OPS 이력 · Epic **`[PAYMENTS-TAXONOMY-POLICY-001]`** · DESIGN/MODEL 연계 보강
- `docs/worklogs/2026-05-14_docs_payments-taxonomy-policy-001.md` — 본 파일

## 4. 변경 내용 요약

- **[D-022]**: legacy `type` NULL 유지·신규 명시 필수 방향·즉시 NOT NULL 금지·`settlement` transition taxonomy 유지·정책→lifecycle→enforcement 순서·P1 enforcement·`planned` drift 기록·임의 수정 금지.
- **PRODUCT / CONTEXT**: 동일 원칙을 제품·운영 아키텍처 독자가 읽을 수 있게 요약; drift는 **기록·재검증**만 명시.

## 5. migration 여부

**없음** — migration 파일 추가·실행·DB 수정 없음.

## 6. 테스트 결과

해당 없음(문서만).

## 7. 남은 위험

- 운영 DB `planned` 부재는 **환경·baseline 순서**에 따라 달라질 수 있음 — P1 baseline sync 시 **재검증** 필요.
- `type` NULL 다수 상태에서 KPI·집계는 **NULL 규칙** 문서·구현 보강이 후속 과제.

## 8. 다음 권장 작업

- 신규 accounting INSERT 경로에 **`type` 가드** 설계(코드는 별도 승인 후).
- **settlement/payout lifecycle** 설계 완료 후 **[D-022]** 순서에 따라 P1 **enforcement** 검토.
