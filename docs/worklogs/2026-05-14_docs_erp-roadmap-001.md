| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

정책 **[D-021]~[D-024]** 및 append-only 수렴 방향을 전제로, **관리자OS ERP 완성까지의 실제 구현 로드맵**을 우선순위·의존성·위험·운영 가능성 관점에서 **한 문서(`ERP-ROADMAP-001`)로 고정**한다. 구현은 하지 않는다.

## 관련 `tasks.md` ID

- **[ERP-ROADMAP-001]** (신규 Epic)  
- **`[PLATFORM-ERP-001]`**, **`[APPEND-ONLY-CONVERGENCE-P1-001]`**, **[ACCOUNTING-LIFECYCLE-POLICY-001]** 등 (본문 연계)

## 수정 파일 목록

- `docs/ERP-ROADMAP-001.md` — **신규** (SECTION 1~12)  
- `docs/tasks.md` — 문서 인벤토리 37, OPS, **`[PLATFORM-ERP-001]`** 연계·작업 이력, **`[APPEND-ONLY-CONVERGENCE-P1-001]`** 연계, **`[ERP-ROADMAP-001]`** Epic  
- `docs/worklogs/2026-05-14_docs_erp-roadmap-001.md` — 본 파일  

**코드 변경 없음.**

## 변경 내용 요약

- ERP 완성도 **다층 %**(코드 존재 vs 운영 증명 vs 통합 정산·지급)로 냉정 기술.  
- 남은 구현을 **회계 축선·lifecycle·운영·가격**으로 분해하고 **P1 append-only 선행**을 고정.  
- TOP5 선행 / TOP5 위험 / transition debt P0~P2 / 지시 횟수 시나리오 / 권장 전략 / 운영 가능 여부 / 남은 설계 논쟁 정리.

## migration 여부

**없음.**

## 테스트 결과

해당 없음.

## 남은 위험

- `PLATFORM-ERP-ARCH-001` 일부 표는 시점상 구버전 — **P1 완료 후 포렌식 갱신** 권장(로드맵 SECTION 10).

## 다음 권장 작업

- **`[APPEND-ONLY-CONVERGENCE-P1-001]`** 별도 구현 지시로 착수.  
- 스테이징에서 **migration 적용 + `TEST-RUN-ERP-001`** 증거 확보.
