# RealMyOS

식식이 ERP — Next.js + Supabase

## 시작하기

### 1. 패키지 설치
```bash
npm install
```

### 2. 환경변수 설정
`.env.local.example`을 복사해서 `.env.local`로 이름 변경 후 값 입력:
```bash
cp .env.local.example .env.local
```

Supabase 대시보드 → Settings → API에서 복사:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Supabase DB 마이그레이션
Supabase SQL Editor에서 순서대로 실행:
1. `001_realmyos_initial_schema.sql` — 테이블 + 인덱스
2. `004_rls_clean_rebuild.sql` — RLS 정책

### 4. 온보딩 (최초 1회)

**admin 계정 등록** (Supabase Auth 가입 후 SQL Editor에서):
```sql
insert into users (id, tenant_id, role, user_type, email)
values (auth.uid(), null, 'admin', 'human', 'admin@yourdomain.com');
```

**테넌트 생성** (admin으로 로그인 후):
```sql
insert into tenants (name, slug) values ('식식이', 'siksiki') returning id;
```

**운영 계정 등록** (Supabase Auth에서 별도 이메일 가입 후):
```sql
insert into users (id, tenant_id, role, user_type, email)
values ('<새 auth.uid()>', '<tenant uuid>', 'supplier', 'human', 'ops@yourdomain.com');
```

### 5. 개발 서버 실행
```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속 → 운영 계정으로 로그인

## 프로젝트 구조

```
src/
├── app/
│   ├── layout.tsx             루트 레이아웃
│   ├── page.tsx               / → /orders/new 리다이렉트
│   ├── login/page.tsx         로그인 페이지
│   ├── auth/callback/route.ts 인증 콜백
│   └── orders/new/page.tsx    주문 등록 페이지
├── actions/
│   └── order.ts               Server Actions (주문 생성, 거래처/상품 조회)
├── components/
│   └── order/
│       └── OrderCreateForm.tsx 주문 입력 폼 UI
├── lib/
│   ├── calc.ts                세금·마진·합계 계산 (순수 함수)
│   ├── supabase-server.ts     서버용 Supabase 클라이언트
│   └── supabase-browser.ts    클라이언트용 Supabase 클라이언트
├── middleware.ts              인증 미들웨어 (미로그인 → /login 리다이렉트)
└── types/
    └── order.ts               TypeScript 타입 정의
```

## 핵심 설계 원칙

- **스냅샷**: `order_lines`에 주문 시점의 `product_code`, `product_name`, `cost_price` 저장. 이후 상품 변경 무관.
- **반품**: `quantity` 음수 입력 → 자동 반품 처리.
- **tenant 격리**: RLS + 서버 액션에서 `tenant_id` 이중 검증.
- **cost_price 서버 확정**: 클라이언트가 보내는 값 무시, 서버에서 DB 조회 후 저장.
