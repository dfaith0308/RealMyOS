# AI 작업 종료 시 tasks.md + worklog 필수 절차 도입

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

Cursor·AI가 코드 작업을 끝낼 때 **코드만 남기고 종료하지 않도록**, `docs/tasks.md` 갱신과 `docs/worklogs/` worklog 생성을 **기본 완료 조건**으로 고정한다.

## 관련 tasks.md ID

- `## 문서 사용법` 항목 **6** (9회차)
- `### [OPS — AI worklog] 절차 기록` (감사 ID 외 운영 절차)
- `DB-DANGER-001` 본문을 인벤토리와 일치하도록 **정합 수정** (baseline 체계 문구 복원, 본 worklog와 무관한 이력은 `[OPS]`로만 연결)

## 수정 파일 목록

- `realmyos/.cursor/rules/worklog-completion.mdc` (신규)
- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/README.md`

## 변경 내용 요약

- **`alwaysApply: true`** Cursor 규칙으로 종료 체크리스트(tasks 이력 + worklog 필수 필드) 명문화.
- **`tasks.md`**: 9회차 메타, 문서 사용법 **6**, `[OPS — AI worklog]` 블록, `DB-DANGER-001` 확인·완료 기준을 8회차 baseline 거버넌스와 일치.
- **`docs/worklogs/README.md`**: §3·§8·§9를 “필수” 정책 및 “변경 내용 요약” 워딩에 맞춤.

## migration 여부

- 없음 (문서·Cursor 규칙만 변경; `supabase/migrations/*.sql` 미생성·미적용)

## 테스트 결과

- 미실행 — 저장소 메타·문서 변경만 수행; 자동 테스트 대상 없음.

## 남은 위험

- **`resturant_os`** 등 멀티 루트 작업 시 `.cursor/rules`가 `realmyos`에만 있으면 해당 폴더 단독 오픈에서는 규칙이 로드되지 않을 수 있음 → 필요 시 동일 `.mdc` 복제 또는 워크스페이스 루트 통합 검토.

## 다음 권장 작업

- PR 템플릿에 worklog 경로 필드 추가(선택).
- `resturant_os`에서도 동일 종료 규칙이 필요하면 `.cursor/rules/worklog-completion.mdc`를 복제하거나 공통 위치에 두기.
