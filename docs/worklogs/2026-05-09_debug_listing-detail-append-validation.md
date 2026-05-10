| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

운영/개발 DEBUG에서 `lastFiles: 7`인데 `blocks: 0`인 현상의 원인을 코드로 특정하고, `setDetailBlocks` append가 실행되도록 한다.

## 관련 `tasks.md` ID

`COMMERCE-002`

## 수정 파일 목록

- `src/components/commerce/ListingNewClient.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-09_debug_listing-detail-append-validation.md`

## 변경 내용 요약

- **확정 원인**: `processIncomingDetailFiles`에서 `validateImageFile`에 걸린 파일은 `pairs`에 넣지 않고, **전부 탈락 시 `if (pairs.length === 0) return`으로 `flushSync`/`setDetailBlocks`가 호출되지 않음** → `lastFiles`만 갱신되고 `blocks`는 0 유지.
- **조치**: 클라이언트 검증 완화(`image/jpg`·`pjpeg`·GIF/BMP/AVIF/HEIC·`application/octet-stream`+이미지 확장자 등), `accept` 속성 동기화, 탈락 시 `detailDebugLastError`·콘솔·첫 탈락 사유 토스트.
- **검증용**: dev 전용 `console.log`·`DEBUG TEST BLOCK` 버튼(유효한 `DetailImageBlock` 1개 주입), `detailBlocksRef`로 microtask 시점 길이 로그.

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` — pass
- 브라우저에서 7장 선택·DEBUG TEST·preview 캡처 — **에이전트 미실행**; 로컬 dev에서 확인.

## 남은 위험

- 확장자/MIME 없는 일부 캡처 파일은 여전히 탈락 가능; 필요 시 매직 바이트 검사 후속.
- HEIC 등은 Storage/브라우저 미리보기 제약 가능.

## 다음 권장 작업

- 동일 7파일로 재선택 후 DEBUG `blocks`·콘솔 `FILES` 메타 확인; 탈락이면 `err` 패널 문구로 MIME/파일명 공유.
