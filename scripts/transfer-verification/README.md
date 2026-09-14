# transfer-verification — 이식 검증 스크립트

`doc/transfer-verification-report.md` 의 결과를 다시 만들어 보는 스크립트다.
**운영 DB에 접속하지 않는다.** PGlite(WASM PostgreSQL)에 `supabase/migrations/` 파일을 그대로 적용한 빈 DB에서 돈다.

```bash
cd scripts/transfer-verification
npm install            # 이 폴더 전용. 루트 package.json 은 건드리지 않는다
node stage1.test.mjs          # 배송 추적 SQL
node stage1.ts.test.mjs       # 조회 창구 TS + DB 전체 경로
node stage1.render.test.mjs   # 식당 배송 타임라인 렌더 (restaurant-os 필요)
node stage2.test.mjs          # 상세페이지 템플릿 SQL + 상속 + 화면 모델 + 렌더
node stage3.sql.test.mjs      # 자동 메시지 SQL: 사건·판정·claim·finish
node stage3.ts.test.mjs       # 자동 메시지 TS: 광고 금지·안전장치·알림톡→문자·전체 경로 (외부 발송 없음 — 가짜 채널)
```

- 레포 위치가 다르면 `REALMYOS_DIR`, `RESTAURANT_OS_DIR` 환경변수로 지정한다.
- TS 파일은 `.build/` 에 CJS 로 변환해서 불러온다(레포 파일 수정 없음). 두 레포 모두 `node_modules` 가 설치돼 있어야 한다.
