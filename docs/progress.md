# RealMyOS — progress.md
> 세션별 작업 완료 기록. AI가 작업 완료 후 반드시 업데이트한다.

---

## 2026-04-23 | 문서 시스템 초기 구축

### 완료
- [x] `docs/CONTEXT.md` 생성
  - supplier-os / restaurant-os 전체 구조 문서화
  - 두 앱의 역할 · 페이지 구조 · lib 파일 정리
  - restaurant-os schema.sql 전체 반영
  - supplier-os DB 구조 (대화 기록 + types 기반, TODO 명시)
  - 두 시스템 관계 설명
  - 현재 구현 상태 체크리스트

- [x] `docs/rules.md` 생성
  - RULE-01: tenant_id / restaurant_id 필수 필터
  - RULE-02: 계산값 DB 저장 금지
  - RULE-03: 과거 데이터 불변
  - RULE-04: cost_price 서버 확정
  - RULE-05: N+1 쿼리 금지
  - RULE-06: 두 앱 분리 원칙
  - RULE-07: 하위 호환 유지
  - RULE-08: Server Action 전용 DB 접근
  - RULE-09: TypeScript strict 모드
  - RULE-10: 고객 삭제 금지
  - RULE-11: 주문 상태 순서 강제
  - RULE-12: collection_schedules cancel→insert 순서
  - RULE-13: 배포 즉시 동작하는 기능만 납품
  - RULE-14: restaurant-os RLS 강화 원칙

### TODO (다음 세션에서 채워야 할 것)
- [ ] `docs/tasks.md` 생성 (다음 개발 작업 단위 분해)
- [ ] `docs/plan.md` 생성 (현재 개발 목표 기획)
- [ ] supplier-os `schema.sql` 확인 후 CONTEXT.md DB 섹션 보완
  - customers 전체 컬럼
  - products 전체 컬럼
  - collection_schedules 전체 컬럼
  - payments 전체 컬럼
  - action_logs 전체 컬럼
  - contact_logs 전체 컬럼
- [ ] Cursor `.cursorrules` 파일 생성
- [ ] Supabase MCP 설정 파일 생성

---

## 2026-04-23 | tasks.md 생성 — 멀티테넌트 전환 실행 단위 작업 정의

### 완료
- [x] `docs/tasks.md` 생성
  - PHASE 1~5, 총 18개 Task 정의
  - 각 Task: 목적·작업내용·영향범위·변경파일·DB변경여부·위험도·검증방법 포함
  - 실행 순서 요약 및 TODO 목록 포함

### Task 현황
| PHASE | 내용 | Task 수 | 상태 |
|-------|------|---------|------|
| PHASE 1 | DB 구조 전환 | 7개 | 미실행 |
| PHASE 2 | Backend 로직 수정 | 7개 | 미실행 |
| PHASE 3 | RLS 정책 전환 | 4개 | 미실행 |
| PHASE 4 | 데이터 마이그레이션 | 3개 | 미실행 (TASK-4-01 선행 필수) |
| PHASE 5 | 레거시 제거 | 3개 | 미실행 (전체 완료 후) |

---

## 2026-04-23 | DB 통합 완료 및 멀티테넌트 구조 전환

### 완료
- [x] CONTEXT.md 전면 재작성 — 확정된 멀티테넌트 아키텍처 기준
- [x] orders / payments 단일화 구조 확정
  - orders: `buyer_tenant_id` / `seller_tenant_id` 구조로 확정
  - payments: `payer_tenant_id` / `payee_tenant_id` / `direction` 구조로 확정
- [x] tenants = 모든 주체 (restaurant / supplier / admin) 구조 정의
- [x] supplier_contacts 주소록 구조 정의 (suppliers / customers 통합 방향)
- [x] restaurant_id / supplier_id 신규 사용 금지 정책 명시
- [x] 기존 테이블 "점진적 제거 대상" 전부 명시
- [x] RLS 표준 패턴 정의 (orders 양방향 접근 포함)

### 핵심 구조 확정
| 항목 | 확정 내용 |
|------|---------|
| DB | 단일 Supabase, tenant_id 기반 전체 격리 |
| 주체 구분 | tenants.role = 'supplier' / 'restaurant' / 'admin' |
| orders | buyer_tenant_id + seller_tenant_id (단일 테이블) |
| payments | payer_tenant_id + payee_tenant_id + direction (단일 테이블) |
| 공급자 주소록 | supplier_contacts (supplier_tenant_id로 실제 tenant 연결) |
| 금지 필드 | restaurant_id, supplier_id (신규 사용 금지) |

---

## 2026-04-23 | CONTEXT.md 전면 재작성 — 단일 DB 통합 기준

### 변경 내용
- [x] CONTEXT.md 전면 재작성
  - **제거:** "별도 Supabase 프로젝트" 전제 전부 삭제
  - **변경:** 두 앱이 단일 Supabase DB 공유 구조로 재정의
  - **변경:** restaurant_id → tenant_id 통합 방향으로 재해석
  - **변경:** supplier ↔ restaurant 관계를 "동일 DB 내 역할 관계"로 재정의
  - **유지:** 기존 코드 구조 · 파일 목록 · lib 설명 그대로 유지
  - **추가:** 미해결 TODO 목록 (우선순위 포함) 섹션 신설

### 핵심 전제 변경
| 이전 | 이후 |
|------|------|
| 두 앱 = 별도 Supabase 프로젝트 | 두 앱 = 단일 Supabase DB 공유 |
| restaurant_id 독립 격리 | restaurant_id → tenant_id 통합 방향 |
| 앱 간 연동 = API/webhook 필요 | 앱 간 연동 = RPC/트리거로 직접 가능 |

### 데이터 소스
- supplier-os: GitHub README + 파일 목록 + `src/types/order.ts` 직접 확인
- restaurant-os: 파일 목록 + `schema.sql` 직접 확인
- 개발 철칙: 대화 기록 (세션 1~9) 기반
