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

실행: 2026-09-14 23:59 KST

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

---

## 2단계 — 상품 상세페이지 템플릿

실행: 2026-09-15 00:16 KST · 스크립트 `scripts/transfer-verification/stage2.test.mjs` — **53 / 53 통과**

### 2-A. SQL (마이그레이션 `20260915110000_commerce_detail_templates.sql`, 1단계 위에 적용) — 14 / 14
| 검증 | 결과 |
|---|---|
| 템플릿 생성 / 빈 제목 거부 | PASS ×2 |
| **빈 값은 NULL 한 가지**: 빈 문자열·빈 배열·빈 JSON 배열·JSON 객체 → CHECK 거부 / NULL 로 지우기 허용 | PASS ×5 |
| listing 하나는 템플릿 하나(PK) / 옵션 칸 빈 문자열 거부 / 없는 listing 연결 거부(FK) | PASS ×3 |
| 옵션 테이블에 listing 중복 칸(원산지·알레르기·보관·원재료·대표 사진) **없음** | PASS |
| 기존 `commerce_product_listings`에 컬럼 추가 없음 | PASS |
| 두 테이블 RLS 활성 / 2회 적용 오류 없음 | PASS ×2 |

### 2-B. 상속 규칙 (realmyos 원본) — 17 / 17
| 검증 | 결과 |
|---|---|
| 입력 정규화: 공백→NULL / 한 줄씩→배열(빈 줄 제거) / 빈 줄만→NULL / http 사진 거부 / FAQ 반쪽 오류 / FAQ 빈 행 버림 / 최대 글자 초과는 **자르지 않고 오류** | PASS ×7 |
| **옵션에 넣은 칸만 옵션 것**, 안 넣은 칸은 상품 것, 둘 다 없으면 empty | PASS ×3 |
| listing 기존 칸(알레르기)이 옵션 값 / listing 칸이 빈 문자열이면 템플릿으로 | PASS ×2 |
| **옵션 칸을 지우면(NULL) 다시 상품 것** / 연결 행 없이도 템플릿 값 | PASS ×2 |
| 코드의 옵션 칸 목록 ↔ **실제 DB 컬럼 1:1** / 모든 칸이 템플릿 테이블 컬럼으로 존재 | PASS ×3 |

### 2-C. 시스템값 — 6 / 6
- 마감 시각 형식(`3pm`·`24:00` 거부) / 배송 요일 정렬·중복 제거·범위 밖 거부 / 라벨(오후 3시·오전 10시 30분·오전 12시)
- 대량 단가 = 기존 상세 화면 계산식과 동일(9,990원·7.5% → `Math.round`)
- 옵션 1개 + 수량 조건 없음 → 단가표 숨김 / 설정 없음 → 마감·요일 줄 숨김, 최소주문 1 숨김, 배송비는 기존 문구 규칙

### 2-D. 원본 ↔ 식당OS 복제본 일치 — 3 / 3
- `resolveDetailFields` 3케이스 결과 동일 / 칸·섹션 정의 동일 / `buildOrderGuide` 동일

### 2-E. 식당 화면 모델 + 실제 컴포넌트 렌더 — 13 / 13
| 검증 | 결과 |
|---|---|
| 01만 채움 → 나머지 입력 섹션 전부 null / 옵션 1개 → 규격 칩·단가표 없음 | PASS ×2 |
| 옵션 2개(하나 품절) → 칩 2개·현재 표시·단가표 / 발주 안내 = 마감·요일·배송비 | PASS ×2 |
| 노출 안 된 listing → null(템플릿 안 씀) | PASS |
| 첫 화면 사진: 옵션 자기 상세 이미지 우선 / 없으면 템플릿 대표 사진 | PASS ×2 |
| **렌더: 부분 채움 → 빈 섹션 제목 6개가 HTML에 아예 없음** (01·06만 존재) | PASS ×2 |
| 렌더: 전체 채움 → 8개 섹션 제목 모두 / 대량 개당 8,550원 / 「표 복사」 버튼 / 핵심 한 줄 + 규격 칩 링크 | PASS ×4 |

### 2-F. 타입 검사
- realmyos `src/` 오류 0 / restaurant-os `src/` 오류 0

### 2-G. 기존 화면 영향 점검 (코드 리뷰)
| 기존 화면 | 변경 | 템플릿 미연결 / 마이그레이션 전 |
|---|---|---|
| 식당 상품 상세 | 액션 1개 병렬 추가, `imageUrls`·`headerExtra`·섹션에 조건부 연결 | `detailPage=null` → `imageUrls=p.image_urls`, `headerExtra=undefined`, 섹션 없음 = 기존과 같은 props |
| `BuyProductDetailClient` | 선택 prop `headerExtra` 1개 | 미전달 시 렌더 결과 동일 |
| 관리자 상품 수정 | 하단 패널 1개 | 패널 안에 안내 문구, 수정 폼 영향 없음 |
| `ProductDetailImageGenerator` / `ListingFormClient` | **변경 없음** | — |

### 2-H. 확인하지 못한 것
- 관리자 편집 화면의 실제 저장 왕복(세션 쿠키 + PostgREST 필요) — 액션 코드는 타입 검사·리뷰만
- 사진 업로드는 기존 `uploadListingImage`(commerce-images 버킷)를 그대로 호출 — 새 경로 없음

---

## 3단계 — 자동 메시지 (배송 완료)

실행: 2026-09-15 00:30 KST

### 3-A. SQL (마이그레이션 `20260915120000_delivery_completed_messages.sql`, 1·2단계 위에 적용) — `stage3.sql.test.mjs` **36 / 36 통과**
| 묶음 | 검증 | 결과 |
|---|---|---|
| 사건 | 배송 중엔 사건 없음 / 완료 반영 → 1행 / 완료가 여러 번 와도 1행 / payload 에 배송 업체 정보 없음 / 직접 2번 INSERT → UNIQUE 거부 | PASS ×5 |
| **판정 한 곳** | 설정 없음 → disabled / 기본값 enabled=false·manual_confirm / 켬 → eligible / 완료 아닌 주문은 목록에 없음 / 제외 → excluded / 유효 제외 식당당 1개 / 해제(삭제 아님) → 다시 eligible | PASS ×7 |
| 명의 | 단독 공급 → 그 공급자 명의·상호 / 공급자 설정 행(꺼짐)이 기본값(켜짐)을 행 단위로 대체 / 복수 공급 → 플랫폼 기본 | PASS ×3 |
| 사건 처리 | 확인 후 발송 → pending_approval / 공급자 설정 꺼짐 → skipped + 사유 / 처리한 사건 재처리 없음 / 자동 모드 → auto_send 반환 | PASS ×6 |
| **claim·finish** | 첫 claim 성공 + 스냅샷 / 두 번째 claim → sending 거부 / both_failed 기록 → **실패자는 다시 대상** / 성공 기록 → already_sent / 성공 후 claim 거부 / 시도 4건 채널·결과·외부 번호 / claim 없이 finish 덮어쓰기 거부 / **테스트 기록은 성공 아님** / 잘못된 상태 코드 거부 | PASS ×9 |
| 기타 | 완료 후 취소 → not_active_order / 판정·처리·claim·finish 함수 anon·authenticated 불가·service_role 가능 / 설정 빈 문자열 거부 / 2회 적용 오류 없음 / 재적용 후 트리거 1개 | PASS ×5 |

### 3-B. TS — `stage3.ts.test.mjs` **52 / 52 통과**
| 묶음 | 검증 | 결과 |
|---|---|---|
| 문구 | [식식이] 명의 / 보내는 분 = 단독 공급자 / 기본 감사 문구 / 알림톡 변수 = 틀 변수 / 설정 표기 우선·주문번호 없으면 id / 둘 다 없으면 식식이 / 자리표시 잔존 없음 | PASS ×7 |
| **광고 금지** | 거절 13종: 링크 4(https·www·co.kr·bit.ly) / 전화번호 4(휴대·지역·1588·붙여쓴 번호) / 광고 단어 5(특별가·할인·쿠폰·1+1 이벤트·SALE) · 통과 4종(기본 문구 포함) · 거절 이유 표시 | PASS ×18 |
| **안전장치 5겹** | 1) 열쇠 없음 → 테스트 / 2) 스위치 기본 꺼짐 / 2) `yes` 는 불인정 / 3) preview → 테스트 / 통과 시 실제 모드·4) 템플릿 없음 → kakao null / 4) pfId+템플릿 모두 있을 때만 / 5) 휴대전화만 | PASS ×7 |
| **알림톡 → 문자** | 카카오 성공 → 문자 안 보냄 / 카카오 실패 → 문자 성공 + 실패 사유 / 둘 다 실패 / 템플릿 없음 → 카카오 호출 0 → 문자 / 번호 이상 → 호출 0·failed / 테스트 모드 → 호출 0·기록만 | PASS ×6 |
| 경계 | 채널 모듈이 `actions/message` import 안 함 / **`message.ts` git diff 없음** / 메시지 모듈이 배송 조회 코드 import 안 함 | PASS ×3 |
| **전체 경로 (PGlite)** | 창구로 배송 완료 입력 → 사건 → 자동 발송(카카오 실패·문자 성공) / 결과·수신번호·보내는 분·본문 스냅샷 / 완료가 또 들어와도 추가 사건·발송 0 / 관리자가 또 눌러도 already_sent — 외부 호출 누계 1 / both_failed / **실패 재발송을 동시에 2번 → 외부 호출 1번** / 시도 3건 기록 / 확인 후 발송 모드 → 대기만·호출 0 / 마이그레이션 전 안내 | PASS ×11 |

### 3-C. 타입 검사
- realmyos `src/` 오류 0 (1회 발견·수정: `process.env` 를 좁은 env 타입에 넘기던 TS2559, 크론 응답 `ok` 중복 키)

### 3-D. 확인하지 못한 것
- **실제 알림톡·문자 발송은 하지 않았다.** 안전장치 2번(실제 발송 스위치)이 운영에 없고, 테스트 중 외부 발송은 금지 사항이다. 솔라피 SDK의 `kakaoOptions` 모양은 설치된 SDK 타입 정의(`solapi` d.ts)와 대조만 했다.
- 알림톡 템플릿 심사 전이라 `templateId` 가 없다 → 켜더라도 당분간 문자로 나간다(4번).
- 크론 라우트는 인증·응답만 코드 리뷰(등록 안 함).

---

## 전체 — 빌드 · 회귀 · 합계

실행: 2026-09-15 00:36 KST

### 빌드 (`next build`, DB 주소를 `127.0.0.1:9`로 바꿔 운영 DB 접속 차단한 상태)
| 레포 | 결과 | 비고 |
|---|---|---|
| realmyos | ✅ 성공 (컴파일 + 타입 검사 + 페이지 수집) | 새 라우트 `/admin/commerce/deliveries`, `/admin/commerce/detail-templates(/[id])`, `/admin/commerce/delivery-messages`, `/storefront-deliveries`, `/api/cron/domain-events` 포함 |
| restaurant-os (작업 폴더 그대로) | ⚠️ 컴파일 성공 후 타입 검사에서 중단 | 원인: 원래부터 있던 **untracked** `scripts/_probe-login.ts` 등이 설치 안 된 `playwright`를 import. 내 파일 아님 — 손대지 않았다 |
| restaurant-os (dev HEAD `3d195e2` 깨끗한 임시 worktree) | ✅ 성공 (컴파일 + 타입 검사 + 정적 페이지 49/49) | 위 untracked 파일만 빠진 같은 코드. 확인 후 worktree 제거, node_modules 는 junction 으로만 연결했다 |
- 부작용: 두 레포의 `.next/` 빌드 산출물이 새로 만들어졌다(gitignore 대상, 코드·데이터 영향 없음).

### 회귀 — 모든 검증 스크립트 마지막 일괄 실행
| 스크립트 | 결과 |
|---|---|
| `stage1.test.mjs` (배송 추적 SQL) | 33 / 33 |
| `stage1.ts.test.mjs` (조회 창구 + DB) | 26 / 26 |
| `stage1.render.test.mjs` (식당 배송 타임라인) | 6 / 6 |
| `stage2.test.mjs` (상세페이지 템플릿) | 53 / 53 |
| `stage3.sql.test.mjs` (자동 메시지 SQL) | 36 / 36 |
| `stage3.ts.test.mjs` (자동 메시지 TS + 전체 경로) | 52 / 52 |
| **합계** | **206 / 206 통과** |

### 이번 검증에서 하지 않은 것 (다시 정리)
- 운영 DB 읽기·쓰기, 마이그레이션 적용 — 0건
- 실제 문자·알림톡 발송 — 0건 (모든 발송 검증은 가짜 채널)
- 로그인 세션을 쓰는 브라우저 E2E — 스테이징 DB가 없어 미실시. 마이그레이션 적용 후 권장 확인 순서:
  1. 관리자 > 배송 현황에서 결제완료 주문 하나에 「배송 준비」 → 식당 주문 상세에 배송 타임라인이 붙는지
  2. 같은 버튼 연타 → 입력 기록에 1건만 남는지
  3. 관리자 > 배송완료 메시지: 설정 저장 시 「010-…」 넣으면 거절되는지 → 사용 켬(확인 후 발송) → 주문을 「배송 완료」 → 발송 대기 1건 → 선택 발송 → **테스트 모드 기록**으로 남는지(스위치를 켜기 전까지 실제 발송 없음)
  4. 관리자 > 상세페이지 템플릿: 01만 채우고 연결 → 식당 상품 상세에 01·06만 보이는지
