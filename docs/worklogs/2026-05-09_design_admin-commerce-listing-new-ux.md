| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

관리자OS `/admin/commerce/products/new`를 ERP형 긴 폼에서 **스캔 가능한 운영 콘솔·미리보기 중심** 레이아웃으로 바꿔, 집중 부담을 줄이고 등록 속도를 높인다.

## 관련 `tasks.md` ID

- `COMMERCE-002` (Listing·상품 등록 흐름)

## 수정 파일 목록

- `src/components/commerce/ListingNewClient.tsx`
- `src/components/commerce/listing-new-client.module.css` (신규)
- `src/app/(admin)/admin/commerce/products/new/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-09_design_admin-commerce-listing-new-ux.md` (본 파일)

## 변경 내용 요약

- 페이지 `main`에 `max-width: 1100px`, 가운데 정렬. 좌 60% 폼 / 우 40% 실시간 미리보기, `1024px` 이하에서는 세로 스택·sticky 미리보기 해제.
- 섹션별 화이트 카드, 라벨·입력·포커스 색·하단 sticky CTA 바(취소/임시저장/저장 후 다음/저장 후 공개) 및 계층 스타일.
- 이미지: 점선 업로드 존, URL 보조 입력, 140px 프리뷰. 미리보기는 `/buy` 카드에 가까운 구성·빈 필드 placeholder bar·하단 안내 문구.
- 저장 성공 토스트 문구 `"상품이 저장되었습니다"` 통일. **저장 후 다음 상품**만 폼 리셋; 그 외 성공 시 **페이지에 머물며 입력 유지**(기존 목록으로의 즉시 이동 제거). 서버 액션 인자·검증 분기는 변경 없음.

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` (realmyos) — pass
- 브라우저 E2E 미실행

## 남은 위험

- 성공 후 목록 미이동이 운영 워크플로에 익숙한 사용자에게는 첫 혼란 가능(토스트로만 피드백).

## 다음 권장 작업

- 실제 `/buy` 카드 컴포넌트와 토큰을 공유해 미리보기 픽셀 패리티를 맞출지 검토.
