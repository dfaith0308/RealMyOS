# ORDER-LOCK-FORENSIC-001 — `order_edit_lock_days` 실제 연결 상태

> **범위**: `realmyos/src/` 내 문자열 `order_edit_lock_days` 및 주문 수정 잠금 **enforcement** 경로.  
> **전제**: 운영 DB에서 `admin_settings.order_edit_lock_days = 50` 으로 바뀌었다는 **사용자 제공 사실**만 인용. 본 턴에서 DB 조회·설정 변경은 **하지 않음**.

---

## SECTION 1 — 검색 결과 전체 (`realmyos/src/`)

`order_edit_lock_days` 일치 항목만 정리한다. (`rg` / IDE grep 기준, **2026-05-14** 저장소 스냅샷)

| 파일 | 대략적 역할 | 읽기/쓰기 | 문서·주석 | enforcement |
|------|-------------|-----------|------------|----------------|
| `src/constants/settings.ts` | `TenantSettings` 타입 필드 + `DEFAULT_SETTINGS.order_edit_lock_days = 7` | (상수 정의) | 타입/기본값 | **폴백 소스** — DB에 키 없을 때 `getSettings`·누락 키 보강에 사용 |
| `src/actions/settings.ts` | `getSettings` / `saveSettings` | **읽기+쓰기** `settings` 테이블 `key` 행 | 아님 | **설정 UI·저장 경로** — 잠금 일수의 **테넌트별 영속 값** |
| `src/actions/order.ts` | `getLockDays` 내부 | **읽기** `settings` | 아님 | **enforcement** — `updateOrder`가 호출 |
| `src/app/(app)/orders/[id]/edit/page.tsx` | `getSettings()` 결과에서 `order_edit_lock_days` | **읽기**(간접으로 `settings`) | 아님 | **UI 잠금 표시** — `isLocked`·`lockDays` props |
| `src/components/settings/SettingsForm.tsx` | 폼 state `values.order_edit_lock_days` | UI 바인딩 | 아님 | **간접** — `saveSettings`로 `settings`에 반영될 값 편집 |

**`src/` 밖**: `docs/PRODUCT.md` 등은 본 ID 범위 밖이나, PRODUCT는 **`settings.order_edit_lock_days`** 표기(테넌트 설정 SSOT)와 정합.

**`admin_settings` + `order_edit_lock_days`**: `realmyos` 전체에서 `admin_settings`와 `order_edit_lock`을 동시에 언급하는 패턴 **검색 결과 없음** — 이 키로 **플랫폼 `admin_settings`를 읽는 코드 경로 없음**.

---

## SECTION 2 — 실제 enforcement 위치

| 층 | 파일·심볼 | 동작 |
|----|-----------|------|
| **UI** | `orders/[id]/edit/page.tsx` | `getSettings()` → `lockDays`; `order.created_at` 기준 `diffDays > lockDays` 이면 `isLocked` |
| **UI** | `OrderEditForm.tsx` | `isLocked` 시 저장 버튼 미표시·필드 `disabled` |
| **Server action** | `order.ts` — `updateOrder` | `getLockDays` → `diffDays > lockDays` 이면 `success: false` + 에러 메시지 |
| **Helper** | `order.ts` — `getLockDays` | `settings`에서 `key = 'order_edit_lock_days'` AND `tenant_id` — 없으면 **7** |
| **Server (설정)** | `settings.ts` — `getSettings` | 동일 키를 `settings`에서 읽고, 없으면 `DEFAULT_SETTINGS`로 **insert 보강** 후 파싱 |
| **validation util / RPC / DB** | — | 주문 수정 일수만 전용으로 검증하는 **별도 util·RPC·CHECK 트리거는 본 검색에서 확인되지 않음** |

**일수 소스 정리**

- **주된 소스**: 테넌트 테이블 **`settings`** (`key = 'order_edit_lock_days'`, `tenant_id` 필수인 조회 경로).
- **하드코딩 폴백**: `getLockDays`에서 row 없음/조회 실패 시 **`7`** (`order.ts`). 편집 페이지는 `getSettings` 실패 시 **`7`** (`edit/page.tsx`).
- **`admin_settings`**: 이 키로 주문 잠금을 읽는 코드 **없음**.
- **ENV**: `order_edit_lock_days`와 연결된 환경변수 참조 **없음**(문자열 검색 범위 내).

---

## SECTION 3 — 현재 연결 상태 판정 (CASE)

**질문 초점이 `admin_settings.order_edit_lock_days = 50` 인 경우**

→ **CASE B — 코드(잠금 로직)는 존재하나, `admin_settings`의 해당 값과는 미연결.**

근거:

- 잠금 일수는 **`getLockDays` → `from('settings')`** 만 조회한다.

```118:125:C:/Users/babok/Desktop/realmyos/src/actions/order.ts
async function getLockDays(supabase: any, tenant_id: string): Promise<number> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'order_edit_lock_days')
    .eq('tenant_id', tenant_id)   // tenant_id 필터 필수
    .single()
  return data ? parseInt(data.value, 10) : 7
}
```

- UI의 `lockDays`도 **`getSettings()`** → 역시 **`settings`** 행만 사용한다.

```43:50:C:/Users/babok/Desktop/realmyos/src/app/(app)/orders/[id]/edit/page.tsx
  const lockDays = settingsResult.success && settingsResult.data
    ? settingsResult.data.order_edit_lock_days
    : 7

  const diffDays = Math.floor(
    (Date.now() - new Date(order.created_at).getTime()) / 86400000
  )
  const isLocked = diffDays > lockDays || order.status === 'cancelled'
```

**보조 판정 (구현 존재 여부)**

- **CASE D(미구현)** 는 **해당 없음** — UI + `updateOrder` 양쪽에서 잠금이 동작한다.

**`settings` 테이블만 바꾼 경우**

- 그때는 **CASE A에 가까움** — 다만 저장소 용어로는 **`admin_settings`가 아니라 `settings`** 가 SSOT이다.

---

## SECTION 4 — bypass 가능 여부

| 경로 | 서버 검증 | 결론 |
|------|-----------|------|
| 정상 UI 저장 | `updateOrder`가 `getLockDays` 재실행 | 잠금 초과 시 **거부** |
| UI만 우회 (클라이언트 조작) | 동일 Server Action 호출 시 동일 검증 | **서버에서 차단** — “UI만 막음”이 아님 |

```380:384:C:/Users/babok/Desktop/realmyos/src/actions/order.ts
  // 수정 잠금
  const lockDays = await getLockDays(supabase, ctx.tenant_id)
  const diffDays = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 86400000)
  if (diffDays > lockDays)
    return { success: false, error: `주문 수정 가능 기간이 지나 수정할 수 없습니다. (${lockDays}일 초과)` }
```

- **“직접 API 호출”**: 공개 REST가 아니라 **동일 `updateOrder` Server Action**을 호출하는 한, 위 분기가 그대로 적용된다.  
- **우회가 성립하는 경우**(본 코드만으로 단정 가능한 범위): 테넌트 격리·인증을 깨는 **별도 공격면**이 아니라, **DB에서 직접 `orders`/`order_lines`를 바꾸는 경로** 등 앱 밖 조작 — 이는 “잠금 로직 bypass”가 아니라 **데이터 직접 변경**에 해당.

---

## SECTION 5 — 운영 영향 분석 (`admin_settings` = 50 가정)

| 항목 | 판정 |
|------|------|
| `admin_settings` 만 50으로 변경 | 주문 수정 가능 기간에 **코드상 영향 없음** — 읽지 않음 |
| 실제 수정 허용 일수 | 각 테넌트의 **`settings` 행 `order_edit_lock_days`** 및 실패 시 **7일 폴백**에 따름 |
| 부분 영향 | **`admin_settings`를 읽는 다른 기능**(정산·정책 콘솔 등)은 별도 키만 해당 — **본 키는 주문 잠금과 무관** |

**요약**: 운영에서 `admin_settings.order_edit_lock_days = 50` 이라도, **앱의 주문 수정 잠금은 바뀌지 않는다**고 보는 것이 코드와 일치한다. 효과를 내려면 **`settings` 테이블의 동일 키(테넌트별)** 를 바꾸거나, 설정 화면에서 저장해 `saveSettings` 경로로 반영해야 한다(본 문서는 구현·변경 지시 없음).

---

## 참고

- 선행 문서: [`docs/ORDER-FORENSIC-001.md`](./ORDER-FORENSIC-001.md) (동일 키·`settings` SSOT 서술).
