| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

**APPEND-ONLY-CONVERGENCE-POLICY-001**: append-only 수렴 **실행 정책**을 **[D-024]**로 고정하고, **P1 구현 범위**를 `docs/APPEND-ONLY-CONVERGENCE-P1-SPEC-001.md`에 명세한다. **구현·migration·DB 변경은 하지 않는다.**

## 관련 `tasks.md` ID

- **[APPEND-ONLY-CONVERGENCE-POLICY-001]** — 정책 확정 완료  
- **[APPEND-ONLY-CONVERGENCE-P1-001]** — 구현 범위 확정 / 구현 대기  
- 연계: **[APPEND-ONLY-CONVERGENCE-DESIGN-001]**, **[ACCOUNTING-REVERSAL-P0-001]**, **[KPI-REVERSAL-P0-001]**, **[D-021]~[D-024]**

## 수정 파일 목록

- `docs/DECISIONS.md` — **[D-024]** 추가  
- `docs/APPEND-ONLY-CONVERGENCE-P1-SPEC-001.md` — **신규** (P1 범위 명세)  
- `docs/PRODUCT.md` — §10-9 `[append-only convergence 정책]` 보강  
- `docs/CONTEXT.md` — P1 수렴 범위·목표 구조·transition debt 보강  
- `docs/tasks.md` — 문서 인벤토리 35~36, Epic 2건, OPS·`[PLATFORM-ERP-001]` 연계, 기타 연계  
- `docs/worklogs/2026-05-14_docs_append-only-convergence-policy-001.md` — 본 파일  

**코드 변경 없음.**

## 변경 내용 요약

- Q1: reversal row **`amount` 양수 유지** (옵션 A).  
- Q2: **`cancelPayment`(α)** 는 **P1에서 outbound(`reverse_disbursement` 수렴)와 동시** INSERT 수렴.  
- `reverse_disbursement` **즉시 제거 금지** — deprecated transition debt.  
- P1: `insert_outbound_reversal`·inbound 상쇅·`type` 가드 1차·KPI·`admin_logs`·명시적 **제외 범위**·완료 기준.  
- **[D-021]~[D-024]** 가 한 세트로 동작함을 `DECISIONS.md`에 기술.

## migration 여부

**없음** (문서만; migration **실행·파일 추가 없음**).

## 테스트 결과

해당 없음 (문서 작업).

## 남은 위험

- `APPEND-ONLY-CONVERGENCE-DESIGN-001.md` 일부 표에서 **패턴 α 시점이 P1~P2 / P2** 로 서술된 구간이 **[D-024] Q2(P1 동시 수렴)** 와 **문자상 불일치** — 구현 턴 전 **DESIGN 문서 정렬** 또는 **[D-024] 우선** 해석 합의 필요(본 턴에서는 DESIGN 본문 미수정).

## 다음 권장 작업

- **[APPEND-ONLY-CONVERGENCE-P1-001]** 별도 지시로 구현 착수 — `APPEND-ONLY-CONVERGENCE-P1-SPEC-001.md` 준수.  
- 선택: **DESIGN-001** §로드맵 표를 **[D-024]** 와 단일화.
