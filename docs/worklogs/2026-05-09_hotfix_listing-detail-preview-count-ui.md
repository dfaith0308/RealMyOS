| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

상세 이미지 업로드 후 운영 화면에서 변화가 없다고 느끼는 문제를 **업로드 실패 vs UI/집계 실패**로 구분해 수정한다.

## 관련 `tasks.md` ID

`COMMERCE-002`

## 수정 파일 목록

- `src/components/commerce/ListingNewClient.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-09_hotfix_listing-detail-preview-count-ui.md`

## 변경 내용 요약

- **집계 버그**: `detailSavedCount`가 `url`이 비어 있고 `uploading`인 블록을 제외해, 카드·스켈레톤이 있어도 **“0 / 20장 등록됨”**으로 보일 수 있었음 → `detailRegisteredCount`로 업로드 중 슬롯 포함(오류 블록만 제외), 문구에 “업로드 중 포함” 명시.
- **커밋 순서**: `ingestDetailFiles`에서 블록 append 후 `flushSync`로 동기 커밋 후 업로드(기존 `setTimeout(0)` 제거), 20장 한도 시 업로드 호출 생략·토스트.
- **방어**: `uploadDetailBlockFile` 시작 시 `blockId`가 아직 없으면 `uploading` 블록을 upsert.
- **피드백**: 업로드 성공 시 짧은 `showToast`; 상세 목록이 비었을 때 안내 한 줄.
- **서버/저장**: `createListingFull`·`uploadListingImage` 변경 없음(동작은 기존과 동일).

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` — pass
- 브라우저 JPG/PNG·다중·새로고침 E2E — 미실행(운영/로컬 확인 권장)

## 남은 위험

- `flushSync`는 메인 스레드에서 동기적으로 DOM까지 갱신하므로 과용은 지양; 본 흐름은 파일당 1회 append에만 사용.

## 다음 권장 작업

- 운영에서 상세 다중 선택 후 우측 “상세페이지” 탭·저장 payload `image_urls` 일치 확인.
