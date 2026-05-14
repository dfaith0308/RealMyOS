| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

# PRODUCT.md §13 Storefront — 학습 파이프라인 절 추가

## 작업 목적

`docs/PRODUCT.md` §13 Storefront 내 `### 3-1. 거래 관계`의 핵심 자산 목록 직후에 `### 3-2. 학습 파이프라인`을 추가하여, 학습 데이터 소스·확장 순서·비가역 원칙·현재 미연결 사항을 제품 정의에 명시한다.

## 관련 `tasks.md` ID

없음 (문서 전용).

## 수정 파일 목록

- `docs/PRODUCT.md` — §13에 `### 3-2. 학습 파이프라인` 삽입
- `docs/tasks.md` — 작업 이력 1행 추가
- `docs/worklogs/2026-05-14_docs_product-storefront-learning-pipeline.md` — 본 파일

코드 변경 없음.

## 변경 내용 요약

- 학습 데이터 소스 목록(rfq_requests/bids, orders, ingredients, price_history, commerce_orders, ai_decision_logs, savings_stats) 및 1~5단계 순서·재주문 추천 입력 요인·D-013 인용·commerce_orders 미연결 명시를 요청문 그대로 반영.

## migration 여부

없음.

## 테스트 결과

문서 편집만 수행. 실행 테스트 해당 없음.

## 남은 위험

- 문서에 나열한 학습 소스·단계는 **제품 목표·원칙 서술**이며, 본 worklog 범위에서 코드 경로 일치 검증은 수행하지 않음.

## 다음 권장 작업

- 구현 착수 시 `DECISIONS.md` D-013 문구와 본 절의 정합을 한 번 더 대조.
