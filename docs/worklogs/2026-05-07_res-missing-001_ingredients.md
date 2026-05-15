# 2026-05-07 — RES-MISSING-001 식당OS 식자재 화면 구현

## 작업 목적

- PRODUCT §8-7 식당OS 설정의 “식자재(ingredients) 관리” 화면을 구현한다.
- `ingredients` 테이블을 기반으로 **카테고리/가격(현재가·목표가) 관리**가 가능하도록 한다.
- 물리 삭제 없이 `is_active=false`로 비활성화한다.

## 관련 작업 ID

- `RES-MISSING-001`

## 변경 범위(저장소)

- `resturant_os` (식당OS)
- `realmyos` 문서(`docs/tasks.md`, 본 worklog)

## 구현 내용 요약

### 1) /settings/ingredients 목록

- 카테고리별 그룹 표시(미분류 포함)
- 검색: 식자재명
- 필터: 카테고리
- 표시 컬럼:
  - 식자재명 / 단위 / 현재가 / 목표가 / 가격차이(현재-목표) / 카테고리(그룹)
- 가격차이 표시:
  - 현재가 > 목표가 → 빨강(비싸게 사는 중)
  - 현재가 ≤ 목표가 → 초록(정상)

### 2) 등록/수정

- 입력 필드:
  - 식자재명(필수)
  - 카테고리(선택, 직접 입력)
  - 단위(필수)
  - 현재 구매가(선택)
  - 목표가(선택) + 안내 문구
  - 메모(선택)

### 3) 비활성화(soft delete)

- 삭제 대신 `is_active=false`

## Server Actions

- `resturant_os/src/actions/ingredients.ts` 신규
  - `getIngredients()` : `is_active=true` 전체 조회
  - `createIngredient(input)` : 신규 등록
  - `updateIngredient(id, input)` : 수정
  - `deactivateIngredient(id)` : 비활성화

## migration 여부

- 없음 (UI 구현만)

## 테스트

- `resturant_os`: `npx tsc --noEmit` 통과

## 남은 위험 / TODO

- 사진 인식(OCR) 기반 자동 등록은 PRODUCT 상 후속(= `SUP-MISSING-011` 연계)로 별도 구현이 필요하다.

