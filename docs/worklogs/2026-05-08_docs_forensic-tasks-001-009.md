| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

FORENSIC 문서 감사에서 도출된 미등록 후속 과제를 `tasks.md`에 고정 ID(`FORENSIC-001`~`009`)로 등록하고, 집계·교차 검증 규칙에 반영해 추적 가능하게 한다.

## 관련 `tasks.md` ID

`FORENSIC-001`~`FORENSIC-009` (신규 섹션 `## [FORENSIC]`). 연계: `DB-DANGER-004`, `ADM-MISSING-001`~`007`, `SUP-PARTIAL-005` 등 본문 참조.

## 수정 파일 목록

- `docs/tasks.md`
- `docs/worklogs/2026-05-08_docs_forensic-tasks-001-009.md` (본 파일)

## 변경 내용 요약

- `## [FORENSIC]` 절 추가: customer_stats 계산값 저장(RULE-02), §10-10 오케스트레이션, §10-9 금융 통제, 신뢰도 정합성, 거래 drill-down UI, 주문 상태 이중 축, loading.tsx, 관리자 인라인 스타일, growth-engine 지표 상한.
- 문서 사용법에 `[FORENSIC]` 안내 추가.
- `감사 요약`: 집계 규칙에 `FORENSIC-*` 교차 축 명시; 접두사별 표에 소계 65 + `FORENSIC-` 9 → 본문 합계 74; 교차 검증 표 동일 반영.
- OPS 작업 이력 한 줄 추가.
- Phase 6 로드맵에 `FORENSIC-002`~`005` 등 교차 후속 한 줄.

## migration 여부

없음 (문서만).

## 테스트 결과

해당 없음 (코드·빌드 변경 없음).

## 남은 위험

본문 ID 총계는 문서 관례상 `DB`/`SUP`/`ADM`/`RES` 소계 65에 `FORENSIC-*` 9를 더한 값으로 표기함. 유형별 표의 행 합계와 원시 `#### […]` 개수는 기존부터 다른 집계 규칙을 따를 수 있음.

## 다음 권장 작업

- `FORENSIC-001` 선행: 원장 vs `customer_stats` 캐시 불일치 검증 스크립트·문서.
- `FORENSIC-002`/`003`: PRODUCT §10-10·§10-9 MVP 분해 후 하위 `ADM-*` 또는 신규 ID 등록.
