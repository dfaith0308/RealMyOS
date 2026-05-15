| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

상품관리 목록의 미리보기를 관리자용 카드 스냅샷이 아니라 **식당OS 실제 `/buy`·`/buy/products/[id]` 화면**과 동일하게 검수할 수 있도록 한다. `resturant_os` 라우팅·구매 로직·`realmyos` 상품 저장 구조는 변경하지 않는다.

## 관련 `tasks.md` ID

`COMMERCE-002`

## 수정 파일 목록

- `src/components/commerce/ListingsClient.tsx`
- `.env.example` (신규 — `NEXT_PUBLIC_STOREFRONT_ORIGIN` 안내)
- `docs/tasks.md`

## 변경 내용 요약

- 가짜 카드 미리보기 제거.
- `NEXT_PUBLIC_STOREFRONT_ORIGIN` 기준으로 **iframe**에 식당OS 실제 URL 로드(상세·목록 탭, 390px 폭·85vh 모달 프레임).
- 비노출·비visible 행: 스토어가 404를 내는 점을 관리자에게 안내(resturant_os `getListing` 조건과 일치).

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit`: PASS
- 브라우저 iframe·교차 출처: 로컬에서 `resturant_os` 기동 및 env 설정 후 확인 필요

## 남은 위험

- iframe은 **별도 오리진**이면 쿠키 세션이 관리자와 분리될 수 있음(의도된 격리).
- 스토어 상세 페이지가 `image_urls` 전부를 아직 그리지 않으면 미리보기에도 동일 한계(스토어 코드와 1:1).

## 다음 권장 작업

- 스테이징/운영에서 `NEXT_PUBLIC_STOREFRONT_ORIGIN`을 식당OS 공개 URL로 설정.
- (선택) 미리보기 전용 쿼리는 `resturant_os` 정책 승인 후에만 검토.
