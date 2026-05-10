| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

관리자 상품 등록(`/admin/commerce/products/new`)에서 대표 썸네일 업로드는 되지만 상세 이미지는 파일 선택 후 프리뷰·업로드 완료 상태·`image_urls` 반영이 되지 않던 문제를, 실제 React state 업데이트 순서를 기준으로 수정한다.

## 관련 `tasks.md` ID

`COMMERCE-002` (Listing 관리·등록 스튜디오)

## 수정 파일 목록

- `src/components/commerce/ListingNewClient.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-09_hotfix_listing-detail-image-upload-state.md`

## 변경 내용 요약

- `ingestDetailFiles`: 상세 블록을 `setDetailBlocks`로 append한 직후 `Promise.resolve().then`로 업로드를 시작하면, 해당 마이크로태스크가 React의 append 커밋보다 먼저 실행될 수 있어 `uploadDetailBlockFile` 내부 `setDetailBlocks(prev => prev.map(...))`가 해당 `blockId`를 찾지 못하고 noop이 되는 레이스가 있었다.
- **대응**: `await new Promise((r) => window.setTimeout(r, 0))`로 한 틀 양보한 뒤 `uploadDetailBlockFile` 호출, 다중 파일은 순차 처리.
- 업로드 성공 시에도 동일 레이스 잔여를 대비해 `blockId`가 `prev`에 없으면(한도 내) 완료 블록을 append하는 복구 분기 유지.
- `setDetailBlocks` updater 안에서 `showToast`를 호출하던 부분은 `queueMicrotask`로 밖에서 실행하도록 정리(업데이터 순수성).

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` — pass (realmyos)
- 브라우저에서 JPG/PNG 다중 업로드·저장·새로고침 E2E는 이 환경에서 미실행(운영/로컬에서 확인 권장)

## 남은 위험

- Storage/RLS·네트워크 오류는 기존과 동일하게 토스트·블록 `error` 상태에 의존; 재시도 UX는 별도 과제.

## 다음 권장 작업

- 스테이징에서 상세 이미지 다중 선택 → `createListingFull` payload의 `image_urls` 배열·DB 컬럼 일치 확인.
