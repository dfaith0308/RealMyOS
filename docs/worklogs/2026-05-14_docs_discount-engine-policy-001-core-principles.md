| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

정무님이 확정한 B2B 가격정책 엔진 원칙을 **`DECISIONS.md` [D-020]** · **`PRODUCT.md` §13** · **`CONTEXT.md` [ARCH-09]** · **`tasks.md`** (`[DISCOUNT-ENGINE-001]` Epic 등)에 반영한다. 코드·migration·DB 변경 없음.

## 관련 ID

- **DISCOUNT-ENGINE-POLICY-001** · **`[DISCOUNT-ENGINE-001]`** · **`DECISIONS.md` [D-020]** · **`[PLATFORM-ERP-001]`**

## 수정 파일 목록

- `docs/DECISIONS.md` — [D-020] 추가
- `docs/PRODUCT.md` — §13 `1-2` B2B 가격정책 엔진 금액 모델·원칙
- `docs/CONTEXT.md` — [ARCH-09] ERP 가격 금액 축 표(현행 vs 정책·미구현 명시)
- `docs/tasks.md` — 문서 인벤토리 보강, `[DISCOUNT-ENGINE-POLICY-001]`·`[DISCOUNT-ENGINE-001]` 블록, Epic 연계·작업 이력

## 변경 내용 요약

- supplier_basis 옵션 B, platform_fee = customer_charge × fee_rate(초기), `customer_product_prices` storefront 미연결, `pricing_policies` SSOT(향후), fee/margin 분리, immutable snapshot.

## migration 여부

없음.

## 테스트 결과

해당 없음.

## 남은 위험

- `docs/DISCOUNT-ENGINE-DESIGN-001.md`의 수수료 “안 A/B” 탐색 서술은 **[D-020] 확정안과 병존**하므로, 구현 착수 전 설계 문서 정렬이 필요(본 턴에서는 tasks 인벤토리에 우선순위만 명시).

## 다음 권장 작업

- `[DISCOUNT-ENGINE-001]` 착수 시 allocation·주문 스냅샷·`payments` 대사를 [D-020] 식으로 맞추는 migration·코드 설계.
