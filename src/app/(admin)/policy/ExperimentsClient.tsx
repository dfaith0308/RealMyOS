'use client'

import { useEffect, useState, useTransition } from 'react'
import { getExperiments, startExperiment, type ExperimentRow } from '@/actions/admin/policy-console'
import s from '../admin-shared.module.css'

export default function ExperimentsClient() {
  const [pending, startTransition] = useTransition()
  const [rows, setRows] = useState<ExperimentRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [aValue, setAValue] = useState('')
  const [bValue, setBValue] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  function refresh() {
    setError(null)
    startTransition(async () => {
      const r = await getExperiments()
      if (!r.success || !r.data) {
        setError(r.error ?? '조회 실패')
        return
      }
      setRows(r.data)
    })
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function start() {
    setError(null)
    startTransition(async () => {
      const r = await startExperiment({
        name,
        a_value: aValue,
        b_value: bValue,
        start_date: startDate || null,
        end_date: endDate || null,
      })
      if (!r.success) {
        setError(r.error ?? '시작 실패')
        return
      }
      setName('')
      setAValue('')
      setBValue('')
      setStartDate('')
      setEndDate('')
      refresh()
    })
  }

  return (
    <section className={s.panel}>
      <div className={s.panelHeader}>
        <h2 className={s.panelTitle}>실험 설정 (A/B) — 구조</h2>
        <span className={s.inlineMuted}>FORENSIC-002-C · admin_settings에 experiment_* 키로 저장</span>
      </div>

      <div className={s.panelBody}>
        {error && <div className={s.alert}>{error}</div>}

        <div className={s.grid2}>
          <div className={s.stackCol}>
            <div className={s.inlineMuted}>실험명 (영문/숫자/_/-)</div>
            <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: trust_threshold_test" />
          </div>
          <div className={s.stackCol}>
            <div className={s.inlineMuted}>기간 (선택)</div>
            <div className={s.actionsRow}>
              <input className={s.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="start YYYY-MM-DD" />
              <input className={s.input} value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="end YYYY-MM-DD" />
            </div>
          </div>
        </div>

        <div className={s.grid2} style={{ marginTop: 10 }}>
          <div className={s.stackCol}>
            <div className={s.inlineMuted}>정책 A 값</div>
            <input className={s.input} value={aValue} onChange={(e) => setAValue(e.target.value)} placeholder="예: trust_supplier_level1=70" />
          </div>
          <div className={s.stackCol}>
            <div className={s.inlineMuted}>정책 B 값</div>
            <input className={s.input} value={bValue} onChange={(e) => setBValue(e.target.value)} placeholder="예: trust_supplier_level1=65" />
          </div>
        </div>

        <div className={s.actionsRow} style={{ marginTop: 12 }}>
          <button type="button" className={s.primaryBtnMd} disabled={pending} onClick={start}>
            {pending ? '저장 중…' : '실험 시작'}
          </button>
          <button type="button" className={s.ghostBtnMd} disabled={pending} onClick={refresh}>
            새로고침
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className={s.sectionListHead}>
            <div className={s.sectionListTitle}>현재 진행 중인 실험</div>
          </div>
          {rows.length === 0 ? (
            <div className={s.empty}>진행 중인 실험이 없습니다</div>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr className={s.theadRow}>
                    {['name', 'A', 'B', 'start', 'end'].map((h) => (
                      <th key={h} className={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name}>
                      <td className={s.td}><div className={s.cellStrong}>{r.name}</div></td>
                      <td className={s.td}>{r.a_value}</td>
                      <td className={s.td}>{r.b_value}</td>
                      <td className={s.td}>{r.start_date ?? '—'}</td>
                      <td className={s.td}>{r.end_date ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

