# transfer-verification-report.md — 이식 1~3단계 검증 결과

- 기준 문서: `doc/transfer-brief-siksiki.md` / 판단 근거: `doc/transfer-audit-log.md`
- **운영 DB 접근 0건.** 마이그레이션 미적용, 운영 데이터 읽기·쓰기 모두 하지 않았다.
- 검증 도구
  - **SQL**: PGlite 0.5.8 (WASM PostgreSQL 18.3) — realmyos `supabase/migrations/`의 선행 마이그레이션 16개 + 이번 마이그레이션을 **파일 그대로** 적용한 빈 DB. `auth.uid()`, `tenants`/`users`/`products` 최소 스텁만 직접 만들었다.
  - **TS 로직**: 레포 소스를 `typescript.transpileModule`로 변환해 Node에서 실행 (레포 파일·package.json 수정 없음). DB가 필요한 경로는 PGlite에 연결한 가짜 service role 클라이언트로 끝까지 태웠다.
  - **컴포넌트**: `react-dom/server renderToStaticMarkup`으로 실제 컴포넌트를 렌더해 문자열 검사.
  - **타입**: 두 레포 `tsc --noEmit`. 기존부터 있던 오류는 `scripts/` 아래 untracked 파일에만 있고(내 작업 아님), `src/` 오류 0건을 기준으로 삼았다.
- 테스트 스크립트 사본: `scripts/transfer-verification/` (realmyos) — 재실행 방법은 그 폴더 README.

> 한계: 운영 Supabase는 PostgreSQL 버전·확장·RLS 실제 정책이 PGlite와 다를 수 있다. 사용한 기능(plpgsql, partial unique index, 정규식 CHECK, `set_config` 트랜잭션 한정, `has_function_privilege`)은 PG 13 이상 공통이다.
> 브라우저 E2E(로그인 → 버튼 클릭)는 **하지 않았다** — 운영 DB에 컬럼이 없어 화면이 "마이그레이션 미적용" 상태로만 뜨고, 스테이징 DB가 없다.

---

## 1단계 — 배송 추적

실행: 2026-09-14 23:5x KST

### 1-A. SQL (마이그레이션 `20260915100000_commerce_delivery_tracking.sql`) — **33 / 33 통과**

| # | 검증 | 결과 |
|---|---|---|
| 1 | 새 주문 `delivery_status` = NULL / 기존 `status` 변경은 가드에 안 걸림 | PASS ×2 |
| 2 | ready 적용 + 택배사·송장 저장 / `updated_at` 안 건드림 / 단계 건너뛰기(ready→in_transit) 허용 | PASS ×4 |
| 3 | **후퇴 금지**: in_transit → picked_up = `ignored_regress`, 상태 유지, 무시된 입력도 원본과 함께 행으로 기록 | PASS ×3 |
| 4 | 같은 상태 반복 = `ignored_same` | PASS |
| 5 | **중복 방지 키**: 같은 키 재전송 = `duplicate:true`, 키당 1행 | PASS ×3 |
| 6 | **예외 복귀**: 확인필요 진입 → 이미 지난 ready로 복귀 차단 → 도달했던 배달중으로 복귀 허용 | PASS ×3 |
| 7 | **모르는 값**: 체계 밖 값 → `lookup_error`, 원본 `DLV_MAYBE` 보관 | PASS ×2 |
| 8 | **완료 불변**: delivered 적용 시 `became_delivered:true` / 다른 키로 재입력 = `ignored_terminal`·`became_delivered:false` / 완료 후 확인필요 차단 / 적용된 delivered 2행 강제 INSERT → unique 인덱스 거부 | PASS ×4 |
| 9 | 결제 전(pending_payment)·취소 주문 거부, 거부 시 이벤트 행 0 | PASS ×3 |
| 10 | **가드**: 판정 함수 밖 `UPDATE delivery_status` 거부 / INSERT 시 상태 지정 거부 / 잘못된 코드·source 형식 CHECK 거부 | PASS ×4 |
| 11 | 관리자 입력만 `admin_logs` 기록(중복 키 제외 11건), 업체 입력은 기록 안 함 | PASS ×2 |
| 12 | 판정 함수 EXECUTE: anon·authenticated 불가 / service_role 가능 | PASS |
| 13 | 마이그레이션 2회 적용 시 오류 없음 (IF NOT EXISTS / DROP IF EXISTS) | PASS |

### 1-B. TS 로직 + 창구 전체 경로 — **26 / 26 통과**

| 묶음 | 검증 | 결과 |
|---|---|---|
| 버튼 힌트 | 추적 전 = 6+확인필요 / 배송중 = 이후 단계만 / 확인필요 = 도달 단계 복귀 버튼 포함 / 완료 = 없음 / 조회오류는 버튼 없음 / rank 값 | PASS ×6 |
| provider 매핑 | 코드값·한글 라벨만 인정, `DELIVERED`·`배송완료`(띄어쓰기 다름)·빈 값 = `lookup_error` (추측 안 함) / 등록 조회 | PASS ×5 |
| 중복 키 | 제출 UUID → `manual:<uuid>` 소문자 정규화 / UUID 아님 거부 / 업체 키 결정적 | PASS ×3 |
| 입력 검증 | 정상 / 조회오류 선택 거부 / 확인필요 사유 필수 / 체계 밖 거부 / 마이그레이션 전 오류 판별 | PASS ×5 |
| **창구 → DB** | 한글 라벨 → in_transit 반영 / 같은 제출 키 재시도 = duplicate / 모르는 원본 「거의 도착」→ lookup_error + 원본 보관 / 미등록 출처 거부 / delivered → becameDelivered / 함수 없는 DB(마이그레이션 전) → 안내 문구로 실패 | PASS ×7 |

### 1-C. 식당 배송 타임라인 렌더 — **6 / 6 통과**
- 6단계 라벨 모두 표시 / 반영 시각 **KST** 표시(03:00Z → 12:00) / 송장번호 표시 / 정상 진행 시 예외 배너 없음
- 확인필요 상태 → 예외 배너 + 라벨 / 자체 배송(송장 없음) → 송장 줄 숨김

### 1-D. 타입 검사
- realmyos `tsc --noEmit`: `src/` 오류 **0** (1회 발견·수정: 배송현황 page의 `res.data` 좁히기 누락)
- restaurant-os `tsc --noEmit`: `src/` 오류 **0**

### 1-E. 기존 화면 영향 점검 (코드 리뷰)
| 기존 화면 | 변경 | 마이그레이션 전 배포 시 |
|---|---|---|
| 관리자 주문처리 목록 | 없음 (목록 쿼리에 새 컬럼 추가 안 함) | 영향 없음 |
| 관리자 주문 상세 모달 | 패널 1개 삽입 | 모달 정상, 패널 자리에 "마이그레이션 미적용" 문구 |
| 식당 주문 상세 | 타임라인 컴포넌트 병행 삽입 | `catch → null`, 기존 화면 그대로 |
| 사이드바(관리자·공급자) | 메뉴 1줄씩 추가 | 새 화면에서 안내 문구 |

### 1-F. 확인하지 못한 것
- 운영 RLS에서 service role RPC 호출이 실제로 되는지 (PGlite에는 PostgREST가 없다) — 적용 후 관리자 화면에서 버튼 1회로 확인 필요
- 공급자 화면의 allocation 스코프는 실제 allocation 데이터로 돌려보지 못했다(코드 리뷰만)
