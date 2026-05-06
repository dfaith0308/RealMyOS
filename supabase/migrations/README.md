# Supabase migrations — 운영 원칙 (RealMyOS / 공급자OS SSOT)

> **SSOT**: 현재 **Supabase 운영(Production) DB** 스키마가 유일한 정본이다.  
> **금지**: 과거 migration 히스토리 복원·재구성, 추측(hallucination) DDL 생성, 본 저장소에 없는 상태를 가정한 baseline SQL 작성.

이 디렉터리에는 **baseline 확정 이후**의 변경만 **incremental migration**으로 누적한다.

---

## 1. Baseline 전략

| 항목 | 정의 |
|------|------|
| **Baseline** | “migration으로 관리하기 시작하는 시점”의 **운영 DB 스냅샷**을 1회 고정한 것. |
| **취득 방법** | Supabase 대시보드·`pg_dump`·공식 CLI 등으로 **실제 운영 DB**에서만 추출. AI/에이전트가 DDL을 임의 생성하지 않음. |
| **저장 형태** | 단일 파일 권장: `YYYYMMDDHHMMSS_baseline_from_production_ssot.sql` (내용은 **추출본 그대로**; 수동 편집 최소화). |
| **적용** | **기존 운영 DB에는 baseline 파일을 다시 적용하지 않음** (이미 그 상태이므로). 새 **dev / validation** DB 부트스트랩 시에만 적용 검토. |
| **이후** | baseline 파일 **다음**부터 오직 **incremental** `YYYYMMDDHHMMSS_description.sql` 만 추가. |

**과거 이력**: Git에 없던 옛 migration을 “복원”하지 않는다. 필요한 것은 **현재 SSOT + 앞으로의 diff** 뿐이다.

---

## 2. 디렉터리 구조

```
realmyos/supabase/migrations/
├── README.md                 # 본 문서 (거버넌스)
└── YYYYMMDDHHMMSS_*.sql    # baseline 1개(승인 후) + incremental만
```

- **`resturant_os`** 등 다른 앱 DB는 **별 Supabase 프로젝트**일 수 있음 → 해당 repo에 동일 패턴을 **별도** 두는 것을 권장 (본 README는 `realmyos` SSOT 기준).

---

## 3. 파일명 규칙

```
YYYYMMDDHHMMSS_short_description.sql
```

- **시간**: UTC 또는 팀 합의 타임존 **일관** 사용 (충돌 방지).
- **description**: `snake_case`, 동작 요약 (예: `add_settings_logs_table`).
- **금지**: `migration.sql`, `fix.sql`, `new.sql`, `temp.sql` (기존 `docs/rules.md` [RULE-26]과 동일).

---

## 4. 적용 흐름 (dev → validation → production)

| 단계 | 환경 | 목적 | 승인 |
|------|------|------|------|
| **1** | **dev** | PR에서 migration 리뷰·로컬/개발 프로젝트 적용·앱 연동 테스트 | 개발자 + 리뷰어 |
| **2** | **validation** (staging) | 운영과 동일 버전에 적용, 회귀·RLS·통합 테스트 | QA 또는 릴리즈 담당 |
| **3** | **production** | 운영 Supabase에 적용 (유지보수 창·백업 후) | **DBA/운영 승인 필수** |

**순서**: dev 통과 → validation 통과 → production. **역주행 금지**(prod만 먼저 적용 금지).

**운영 직접 수정**: [RULE-26]에 따라 대시보드에서의 스키마 변경은 원칙 금지. **긴급 핫픽스**가 불가피하면, 동일 내용을 **즉시** incremental migration으로 역산해 커밋하고 `tasks.md` 또는 변경 로그에 기록 (감사 추적).

---

## 5. 운영 원칙 (요약)

1. **SSOT = 현재 운영 DB**; 저장소 migration은 그 이후 **변경 이력**의 레코드다.  
2. **Baseline은 1회·추출본 기준**; hallucination DDL 금지.  
3. **Incremental만** 누적; 파일명은 타임스탬프 규칙 준수.  
4. **dev → validation → production** + 승인.  
5. **DROP / 대량 데이터 변경**은 별도 변경 관리·백업 절차.  
6. 본 단계에서는 **실제 schema 변경 SQL을 이 폴더에 커밋하지 않음** — 거버넌스 확립만 완료한 상태 (실행은 별 작업).

---

## 6. `docs/rules.md`와의 관계

- **[RULE-26]** 이미 `supabase/migrations/` 및 `YYYYMMDDHHMMSS_description.sql` 형식을 규정함.  
- Baseline·환경 순서·SSOT는 **본 README**와 **`docs/tasks.md`** ( `DB-DANGER-001` 완료 기준)로 보완.  
- rules에 baseline 예외·hotfix 역산 절차를 **명문화**할지는 별도 편집 제안으로 검토 (현재 rules 수정은 하지 않음).
