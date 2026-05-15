| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

상세 이미지 “+ 이미지 추가” 후 카드·카운트·상태가 보이지 않던 현상을 코드 경로·재현 가능한 개발 DEBUG로 추적하고, 파일 선택 직시 블록이 생기도록 흐름을 고친다.

## 관련 `tasks.md` ID

`COMMERCE-002`

## 수정 파일 목록

- `src/components/commerce/ListingNewClient.tsx`
- `src/components/commerce/listing-new-client.module.css`
- `docs/tasks.md`
- `docs/worklogs/2026-05-09_hotfix_listing-detail-image-evidence-ui.md`

## 변경 내용 요약

- `randomBlockId()`: `crypto.randomUUID` 미지원·예외 시 폴백 ID(비보안 컨텍스트 등에서 `newBlock` throw로 onChange 전체 실패하던 가능성 제거).
- `processIncomingDetailFiles`: 검증 통과 파일을 한 번의 `flushSync(setDetailBlocks)`로 append 후 업로드 큐 실행; `ingestDetailFiles` 제거.
- 카드 `onDrop`: OS 파일 드롭 시 `processIncomingDetailFiles` 호출(기존에는 `stopPropagation`만 하고 순서 변경만 시도해 파일 드롭이 무시될 수 있음).
- 섹션/카드 `onDragOver`: `Files` 타입일 때 `dropEffect = copy`.
- 카드별 상태 문구(`detailBlockStatusLabel`), 빈 목록 문구 정리, 드래그 핸들은 블록 2개 이상일 때만 `draggable`.
- `NODE_ENV === 'development'`일 때 DEBUG 패널(blocks/uploading/success/error/lastFiles/lastUrl/lastError).

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` — pass
- `npm run build` — pass
- 실제 브라우저에서 파일 선택·드래그·저장 payload 확인 — **에이전트 환경에서 미실행**; 로컬 `npm run dev`에서 DEBUG 패널로 검증 권장.

## 남은 위험

- 운영(production) 빌드에는 DEBUG 패널이 번들에서 제거됨(`NODE_ENV`); 현장 재현은 dev 또는 네트워크 탭으로 `uploadListingImage` 확인.
- Supabase Storage/RLS 실패 시 카드는 남고 `error` 상태로 표시됨.

## 다음 권장 작업

- 운영에서 한 장 선택 후 DEBUG(dev) 또는 DB `image_urls`로 업로드 성공 여부 확인; 문제 지속 시 `detailDebugLastError`·`lastUrl` 스크린 캡처.
