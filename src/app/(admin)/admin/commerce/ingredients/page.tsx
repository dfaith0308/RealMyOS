import Link from 'next/link'
import { getConfirmedMasters, getUnconfirmedMasters } from '@/actions/admin/ingredient-master'
import UnconfirmedMasterList from '@/components/admin/UnconfirmedMasterList'
import s from '../../../admin-shared.module.css'

export const metadata = { title: '식자재 마스터 — 식식이 관리자' }

type ConfirmedMaster = {
  id: string
  name: string
  spec?: string | null
  brand?: string | null
  barcode?: string | null
  ingredient_mappings?: Array<{ source_type: string }>
}

/**
 * 식자재 마스터 DB — 학습센터에서 이관 (2026-08-31).
 *
 * 상품을 등록하면 commerce.ts 가 upsertIngredientMaster 로 여기에 쌓는다.
 * 바코드·품목보고번호가 없는 건은 "미확정"으로 남아 관리자 확인을 기다린다.
 * 상품 데이터 큐레이션이므로 쇼핑몰관리 아래가 제자리다.
 */
export default async function AdminIngredientMasterPage() {
  const [confirmedRes, unconfirmedRes] = await Promise.all([
    getConfirmedMasters(),
    getUnconfirmedMasters(),
  ])

  const confirmed = (confirmedRes.data ?? []) as ConfirmedMaster[]
  const unconfirmed = (unconfirmedRes.data ?? []) as unknown[]
  const loadError = confirmedRes.success ? null : confirmedRes.error ?? '조회 실패'

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>식자재 마스터</h1>
          <p className={s.subtitleMax720}>
            상품을 등록하면 자동으로 쌓입니다. 바코드·품목보고번호가 없는 건은 미확정으로 남아
            관리자 확인을 기다립니다.
          </p>
        </div>
        <Link href="/admin/commerce/products" className={s.ghostBtnMd}>
          상품관리
        </Link>
      </header>

      {loadError && <div className={s.alert}>{loadError}</div>}

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>미확정 — 바코드/품목보고번호 없이 등록된 상품</h2>
          <div className={s.inlineMuted}>{unconfirmed.length}건 검토 필요</div>
        </div>
        <div className={s.panelBody}>
          {unconfirmed.length === 0 ? (
            <div className={s.empty}>검토할 항목이 없습니다.</div>
          ) : (
            <UnconfirmedMasterList items={unconfirmed} />
          )}
        </div>
      </section>

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>확정 마스터 상품</h2>
          <div className={s.inlineMuted}>총 {confirmed.length}개</div>
        </div>
        {confirmed.length === 0 ? (
          <div className={s.empty}>상품을 등록하면 여기에 나타납니다.</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  {['상품명', '브랜드', '바코드', '소스'].map((h) => (
                    <th key={h} className={s.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {confirmed.map((m) => (
                  <tr key={m.id}>
                    <td className={s.tdWide}>
                      <div className={s.cellStrong}>
                        {m.name}
                        {m.spec ? ` ${m.spec}` : ''}
                      </div>
                    </td>
                    <td className={s.tdNowrap}>{m.brand ?? '-'}</td>
                    <td className={s.tdNowrap}>{m.barcode ?? '-'}</td>
                    <td className={s.tdNowrap}>
                      {(m.ingredient_mappings ?? []).map((mp) => mp.source_type).join(', ') || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
