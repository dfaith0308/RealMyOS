# 상품 등록 스튜디오 — 상세페이지 제작 UX 재설계

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-10 |

## 작업 목적

운영자가 URL 입력이 아니라 **이미지 업로드 중심**으로 대표 썸네일·상세 이미지를 구성하고, 순서를 바꾼 뒤 모바일 상세에 가까운 미리보기로 확인할 수 있게 한다. DB는 기존 `thumbnail_url`·`image_urls` 유지.

## 관련 `tasks.md` ID

- `COMMERCE-002`

## 수정 파일 목록

- `src/components/commerce/ListingNewClient.tsx`
- `src/components/commerce/listing-new-client.module.css`
- `src/actions/admin/commerce.ts` (`createListingFull` 상세 이미지 배열 상한 20)
- `docs/tasks.md`
- `docs/worklogs/2026-05-10_feat_commerce-listing-detail-page-studio-ux.md`

## 변경 내용 요약

- 대표 썸네일: 최소 240×240 영역, 클릭·드롭 업로드, 보조 URL 접기, 업로드 실패 시 재시도.
- 상세: 이미지 블록 리스트(업로드·URL 보조·삭제·전체 삭제), HTML5 DnD로 순서 변경, 업로드 중/실패 UI.
- 미리보기 탭 «상세페이지»: 폰 폭 레이아웃으로 히어로·가격·상세 이미지 스택·하단 설명.
- 서버: `image_urls` 정규화 `slice(0, 20)`.

## migration 여부

- 없음

## 테스트 결과

- `npx tsc --noEmit` (realmyos) — pass

## 남은 위험

- 업로드 «진행률»은 서버 액션 한계로 **무한 스크롤 바 형태의 indeterminate** 표시만 제공(정확한 % 없음).
- 다중 파일 동시 추가 시 React 배치 타이밍 이슈를 완화하기 위해 `Promise.resolve().then`으로 업로드 시작을 한 틱 미룸.

## 다음 권장 작업

- 클라이언트에서 Supabase Storage 직접 업로드 시 실제 바이트 진행률·대용량 최적화.
- Listing 수정 화면에 동일 블록 UI 이식.
