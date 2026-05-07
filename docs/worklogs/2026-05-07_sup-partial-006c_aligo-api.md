# 2026-05-07 — SUP-PARTIAL-006-C 알리고 API 실제 연동

## 목적

- PRODUCT §6-13 자동화영업 “메시지 발송(알리고 API)”을 **실제 연동**한다.
- `settings`에서 테넌트별 알리고 인증 값을 읽어 **Server Action에서만** 호출한다. (D-015)
- 사용자 승인 없는 발송은 금지한다. (D-013)

## 관련 tasks.md ID

- `SUP-PARTIAL-006-C`

## 구현 요약

### 1) 알리고 API 연동 Server Action

- `src/actions/message.ts` 신설
  - `sendAligo({ receiver, msg, customer_id })`
    - settings에서 `aligo_user_id`, `aligo_api_key`, `aligo_sender` 조회(tenant_id 기준)
    - 미설정 시 에러: “알리고 설정이 필요합니다 → /settings”
    - 바이트 계산 규칙(근사):
      - ASCII=1byte, 그 외(한글)=2byte
      - 90byte 이하 → SMS, 초과 → LMS(title 포함)
    - **안심번호 정책**: 050 계열 수신번호는 SMS(90byte)만 허용
    - 알리고 응답을 `message_logs.aligo_response`에 JSON으로 저장
    - `message_logs.status`는 `sent` / `failed`
  - `getAligoSettings()` / `saveAligoSettings()` / `sendAligoTest()` 제공

### 2) 설정 화면에 알리고 설정 추가

- `src/components/settings/AligoSettingsForm.tsx` 추가
  - 알리고 사용자ID / API Key / 발신번호 입력
  - 저장: `settings` upsert(tenant_id+key)
  - 테스트 발송: 발신번호로 “식식이OS 알리고 연동 테스트” 발송(수동 버튼)
- `src/app/(app)/settings/page.tsx`에서 기존 `SettingsForm` 아래에 섹션 추가

### 3) 실행센터 실제 발송으로 교체

- `src/app/(app)/sales/exec/SalesExecClient.tsx`
  - 문자 버튼 → 스크립트 선택 → **발송 확인 모달**(수신번호/내용/바이트/유형 표시) → `sendAligo` 호출
  - 성공 시 “문자 발송 완료” 표시 + 오늘 pending 스케줄이 있으면 done 처리

## 변경 파일

- `src/actions/message.ts`
- `src/components/settings/AligoSettingsForm.tsx`
- `src/app/(app)/settings/page.tsx`
- `src/app/(app)/sales/exec/SalesExecClient.tsx`
- `docs/tasks.md`
- `docs/DECISIONS.md` (D-015)
- `docs/worklogs/2026-05-07_sup-partial-006c_aligo-api.md`

## Migration

- 없음 (UI/액션만)

## 테스트

- `npx tsc --noEmit` ✅

## 리스크 / 남은 일

- 안심번호 판단은 현재 `receiver`가 050으로 시작하는지로 근사 처리. PRODUCT의 `contact_status=safe_number`와의 정합 연결은 후속 작업에서 강화 필요.
- `message_logs`에 `customer_id`가 필수인 경우를 가정하여 테스트 발송은 “거래처 1건 필요”로 처리.

