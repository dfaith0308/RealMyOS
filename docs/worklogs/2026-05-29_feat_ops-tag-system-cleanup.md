| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-29 |

## 작업 목적

운영분류(태그) 관리·거래처 등록 UI를 디자인 시스템에 맞게 정리한다. 설정 화면에서 `prompt`/`confirm`·`Surface`·`color-mix()`를 제거하고, 거래처 등록에서는 카테고리당 단일 선택 드롭다운으로 통일한다. `DEFAULT_SEED`에서 업종과 운영관계를 분리하되 기존 DB 데이터는 변경하지 않는다.

## 관련 `tasks.md` ID

- SUP-MISSING-001 (거래처 분류/태그) — 로드맵 작업 이력
- 없음 (신규 ID 미등록)

## 수정 파일 목록

- `src/components/settings/TagOptionsManagerClient.tsx`
- `src/components/settings/TagOptionsManagerClient.module.css`
- `src/components/customer/CustomerCreateForm.tsx`
- `src/components/customer/CustomerCreateForm.module.css` (미사용 tagChip 스타일 제거)
- `src/actions/customer-tag-options.ts` (`DEFAULT_SEED`만)
- `src/app/(app)/settings/tags/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-29_feat_ops-tag-system-cleanup.md`

## 변경 내용 요약

- **TagOptionsManagerClient**: `Surface` 제거, 카드·모달 UI로 교체. 옵션 추가·수정은 인라인 input, 삭제는 `confirmDelete` 모달. `prompt`/`confirm` 완전 제거.
- **CustomerCreateForm**: 태그 칩 → 카테고리별 `<select>` (카테고리당 1값, `customer_tags` unique 제약과 일치). `selectTag`로 빈 값 시 해당 카테고리 제거.
- **DEFAULT_SEED**: 업종(음식 카테고리)과 운영관계(거래 역할) 분리; 기존 고객유형·식식이OS 등 카테고리 유지.
- **settings/tags/page**: inline style·`seedDefaultOptions()` 제거, 클라이언트가 레이아웃 담당.

## migration 여부

없음 (신규 migration 파일 생성 없음)

## 테스트 결과

- `npx tsc --noEmit` — pass
- `npm run build` — pass
- 브라우저 수동 확인(`/settings/tags`, `/customers/new`) — 미실행 (로컬 로그인 필요)

## 남은 위험

- 이미 seed된 테넌트는 DB에 구 업종 값(식당/업소 등)이 남을 수 있음 — `seedDefaultOptions`는 기존 행이 있으면 재시드하지 않음. 운영관계 카테고리는 UI에서 수동 추가 필요할 수 있음.
- `ensureSeed` 함수는 컴포넌트에 유지하나 UI 버튼은 제거됨 (시드는 `/customers/new` 등 다른 경로에서만 호출 가능).

## 다음 권장 작업

- 브라우저에서 `/settings/tags` CRUD·삭제 모달, `/customers/new` 드롭다운 표시 확인
- 운영관계 복수 선택이 필요하면 `customer_tags` unique 인덱스 변경 migration을 별도 작업으로 설계
