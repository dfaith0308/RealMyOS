| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

상세 이미지 `input[type=file]` `onChange`에서 `value`를 먼저 비우면 `FileList` 참조가 비어 `processIncomingDetailFiles`에 빈 배열이 넘어가던 문제를 제거한다.

## 관련 `tasks.md` ID

`COMMERCE-002`

## 수정 파일 목록

- `src/components/commerce/ListingNewClient.tsx` (`addDetailFilesFromPicker`만)
- `docs/tasks.md`
- `docs/worklogs/2026-05-09_fix_detail-filelist-clear-timing.md`

## 변경 내용 요약

- `const files = e.target.files` → `Array.from(e.currentTarget.files ?? [])`로 즉시 스냅샷 후 검증·`processIncomingDetailFiles(filesArr)` 호출, **마지막에** `e.currentTarget.value = ''`.
- DEBUG `[DETAIL STEP 3]` 로그 유지(빈 선택 시 문구만 `no files selected`로 구분).

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` — pass
- 브라우저에서 7장 선택·카드·preview — **에이전트에서 UI 미실행**; 로컬 dev에서 확인.

## 남은 위험

- 단일 파일 `onRetryDetailFile` 등은 기존 순서(먼저 `[0]` 참조) 유지; 동일 라이브 이슈 재현 시 동일 패턴 적용 검토.

## 다음 권장 작업

- 운영/스테이징에서 다중 선택 후 DEBUG `pairs`·`blocks` 확인.
