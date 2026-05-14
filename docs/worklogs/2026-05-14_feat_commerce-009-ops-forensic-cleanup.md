# COMMERCE-009 — 운영 전환 정리 (forensic / prompt / TEST)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

관리자 커머스 UI에서 개발·포렌식 전용 잔재를 제거하고, 상품 가격 수정을 목록의 `window.prompt`가 아닌 edit 페이지 플로우로 통일한다. 운영 장애 추적에 필요한 `console.error`는 유지한다.

## 2. 관련 `tasks.md` ID

- `COMMERCE-009` (본 작업)
- `COMMERCE-008` (참조: quick edit·dirty·admin_logs·수정 링크 — `TEST.md`에 구현 검증 항목 반영)

## 3. 수정 파일 목록

- `src/components/commerce/ListingNewClient.tsx`
- `src/components/commerce/ListingsClient.tsx`
- `docs/TEST.md`
- `docs/tasks.md`
- `docs/worklogs/2026-05-14_feat_commerce-009-ops-forensic-cleanup.md` (본 파일)

## 4. 변경 내용 요약

- **ListingNewClient**: `NODE_ENV === 'development'` DEBUG 패널·DEBUG TEST BLOCK·`detailDebug*` 상태·CTA/DETAIL 추적 `console.log`·`auditValidateImageFileMeta` 제거. `submitWithStatus`·이미지 추가·취소·CTA 클릭에서 개발용 로그 제거. 업로드·flush·`createListingFull` 실패는 `[ListingNew]` 접두 `console.error` 유지.
- **ListingsClient**: `onChangePrice`·`window.prompt`·가격 버튼·`updateListingPrice` import·호출 제거. 상태 전이·수정 링크·스토어 미리보기 유지.
- **TEST.md**: prompt 제거 반영 `[x]`, COMMERCE-008 구현 검증 `[x]` 블록, COMMERCE-009 수동 검증 `[ ]` 항목 추가.
- **tasks.md**: `COMMERCE-009` 상태·범위·작업 이력·Phase 8 후속 문구 갱신, OPS 작업 이력 한 줄 추가.

## 5. migration 여부

없음.

## 6. 테스트 결과

- `npx tsc --noEmit` (프로젝트 루트) — **exit 0**, 출력 없음 (2026-05-14).

## 7. 남은 위험

- `updateListingPrice` 서버 액션은 유지되나 UI에서 호출하지 않음. 다른 경로에서 호출 여부는 별도 감사 대상.
- production 빌드에서 DEBUG 미노출은 코드상 제거로 충족하나, 배포 파이프라인에서의 최종 확인은 `TEST.md` 수동 항목으로 남김.

## 8. 다음 권장 작업

- `TEST.md`의 COMMERCE-009 수동 항목을 스테이징·운영에서 순차 검증.
- 커머스 Phase 8 잔여 ID(`COMMERCE-000` 등) 로드맵 정리.
