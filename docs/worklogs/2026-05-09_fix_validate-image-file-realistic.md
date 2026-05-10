| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

모바일·운영 환경에서 `validateImageFile`에 의해 상세 이미지가 전부 탈락하는 문제를 줄이기 위해 허용 MIME·확장자·octet-stream 규칙을 현실적으로 맞추고, 탈락 시 원인을 DEBUG·콘솔에 남긴다.

## 관련 `tasks.md` ID

`COMMERCE-002`

## 수정 파일 목록

- `src/components/commerce/ListingNewClient.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-09_fix_validate-image-file-realistic.md`

## 변경 내용 요약

- `validateImageFile`: 허용 확장자 `jpg|jpeg|png|webp|heic|heif`(MIME 비어 있어도 확장자만으로 통과), MIME `image/jpeg`·`jpg`·`pjpeg`·`png`·`webp`·`heic`·`heif` 및 `image/heic*`·`image/heif*` 변형, `application/octet-stream`은 허용 확장자와 함께일 때만 통과.
- `processIncomingDetailFiles`: 탈락 시 dev에서 `VALIDATION FAIL` 로그, `rejectSamples`에 `파일명 | MIME | 사유` 최대 20건.
- `ACCEPT_IMAGE`: 위 계열과 맞게 조정(octet-stream 포함). DnD·flushSync·렌더·`DetailImageBlock` 구조 미변경.

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` — pass
- `npm run dev` — 로컬에서 Ready 확인(약 2.4s)
- 브라우저에서 7장 선택·drag reorder·캡처 — **에이전트에서 UI 조작 미실행**(수동 확인 필요)

## 남은 위험

- 확장자·MIME 모두 없는 `File`(예: 일부 임시 blob 이름)은 여전히 탈락.

## 다음 권장 작업

- 동일 7파일 재시도 후 DEBUG `blocks`·`VALIDATION FAIL` 로그 확인; drag reorder는 카드 2장 이상에서 ⋮⋮ 수동 검증.
