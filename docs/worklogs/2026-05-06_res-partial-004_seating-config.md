# RES-PARTIAL-004 좌석/테이블 설정(`seating_config`) 매핑

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

식당OS 매장 설정에서 좌석·테이블 정보가 항상 `0/null`로 반환되던 문제를 해결해, `tenants.seating_config`(jsonb)에 저장된 값을 읽고 저장할 수 있게 한다.

## 관련 tasks.md ID

- RES-PARTIAL-004

## 수정 파일 목록

- `resturant_os/src/actions/restaurant.ts`
- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-06_res-partial-004_seating-config.md`

## 변경 내용 요약 (전/후)

- **변경 전**: `getRestaurant`가 `table_2p/table_4p=0`, `seating_config=null`을 고정 반환했고 저장 경로도 없었다.
- **변경 후**:
  - `getRestaurant`에서 `tenants.seating_config`를 select하여 `{ table_2p, table_4p }`를 매핑해 반환한다.
  - `updateRestaurant`에 `table_2p/table_4p` 입력을 추가하고, 입력이 있으면 `payload.seating_config = { table_2p, table_4p }`로 저장한다.

## JSONB 구조 결정 근거

- 운영 DB `tenants.seating_config`는 jsonb 컬럼으로 존재하며 현재 값은 null.
- 별도 컬럼(`table_2p`, `table_4p`)이 없어, jsonb 내 객체 구조로 저장하는 방향을 채택했다.
- 구조: `{ table_2p: number, table_4p: number }`

## migration 여부

- 없음 (기존 jsonb 컬럼 사용)

## 테스트 결과

- 미실행 — 코드 변경 및 타입/정적 검증만 수행

## 남은 위험

- 기존에 `seating_config`에 다른 JSON 구조가 저장되어 있었다면(현재는 null 샘플), 파싱/매핑이 기대와 다를 수 있다.

## 다음 권장 작업

- 설정 UI에서 `updateRestaurant` 호출 시 `table_2p/table_4p`를 전달하도록 연결하고, 저장 후 `getRestaurant`에서 값이 정상 표시되는지 확인한다.

