# ADM-MISSING-007 정책/실험 콘솔 MVP

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

PRODUCT §10-10 정책/실험 콘솔의 실행 규칙에 맞춰, 운영 정책을 코드 배포 없이 `admin_settings`에서 바꾸고 모든 변경을 `admin_logs`에 남기는 관리자 화면을 제공한다.

## 관련 `tasks.md` ID

- ADM-MISSING-007

## 수정 파일 목록

- `src/actions/admin/policy-console.ts` (신규)
- `src/actions/admin/settlement-control.ts` (정책 시드 SSOT 위임)
- `src/actions/admin/trust-engine.ts` (신뢰 Level 경계를 admin_settings에서 로드)
- `src/app/(admin)/policy/page.tsx` (신규)
- `src/app/(admin)/policy/PolicyConsoleClient.tsx` (신규)
- `src/components/layout/AdminSidebar.tsx`
- `docs/tasks.md`

## 변경 내용 요약

- 정책 키 전체 시드를 `POLICY_SETTING_DEFAULTS` 단일 객체로 정의하고, 누락 시에만 `admin_settings` INSERT.
- `getAdminSettings` / `updateAdminSetting` / `getAdminSettingHistory` — 변경 시 `admin_logs`에 `before_value`/`after_value` 및 변경자(`updated_by`, 로그 `new_value.updated_by`) 기록, `reason`에 키별 고정 문자열로 필터링.
- `/admin/policy`에서 수수료·신뢰도·영업·발주·알리고 섹션별 수정·즉시 적용 확인 모달·키별 이력 모달·알리고 테스트 발송(ADMIN 설정 기준).
- `trust-engine`의 Level 매핑을 동일 키(`trust_*_level*`)에서 읽도록 연결해 하드코딩 제거.
- `settlement-control`의 시드는 `ensurePolicyDefaults` 호출로 통합해 수수료율 등 중복 시드 제거.

## migration 여부

없음 (`admin_settings`·`admin_logs` 활용). PRODUCT에 언급된 `admin_settings_logs` 전용 테이블은 미도입 — MVP는 `admin_logs`로 대체.

## 테스트 결과

- `npx tsc --noEmit` — 통과 (realmyos).

## 남은 위험

- 알리고 자격증명이 테넌트 `settings` 경로(`message.ts`)와 관리자 `admin_settings` 경로로 이원화될 수 있음 — 운영에서 어느 쪽을 SSOT로 둘지 합의 필요.
- A/B·정책 충돌 감지 등 §10-10 고급 기능은 미구현(MVP는 값 편집·감사 로그).

## 다음 권장 작업

- `admin_settings_logs` 또는 통합 감사 스키마 확정 시 로그 스키마 정렬.
- RFQ·납기 로직이 본 정책 키들을 실제 런타임에서 읽도록 후속 연결.
