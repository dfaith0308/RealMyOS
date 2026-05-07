import React from 'react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { DSStatus } from '@/styles/design-system'
import styles from './KPIBlock.module.css'

export function KPIBlock({
  label,
  value,
  hint,
  delta,
  status,
  align = 'start',
  valueSize = 'md',
  statusPlacement = 'head',
}: {
  label: string
  value: string
  hint?: string
  delta?: { text: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }
  status?: DSStatus
  align?: 'start' | 'end'
  valueSize?: 'md' | 'lg'
  statusPlacement?: 'head' | 'below'
}) {
  const rootAlign = align === 'end' ? styles.alignEnd : styles.alignStart
  const deltaClass =
    delta?.tone === 'success'
      ? styles.deltaSuccess
      : delta?.tone === 'warning'
        ? styles.deltaWarning
        : delta?.tone === 'danger'
          ? styles.deltaDanger
          : styles.deltaNeutral

  return (
    <div className={[styles.root, rootAlign].join(' ')}>
      <div className={styles.head}>
        <span>{label}</span>
        {status && statusPlacement === 'head' ? (
          <StatusBadge status={status} size="sm" />
        ) : null}
      </div>

      <div
        className={[styles.value, valueSize === 'lg' ? styles.valueLg : '']
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </div>

      {status && statusPlacement === 'below' ? (
        <div className={styles.below}>
          <StatusBadge status={status} size="sm" />
        </div>
      ) : null}

      {delta || hint ? (
        <div className={styles.sub}>
          {delta ? (
            <span className={[styles.delta, deltaClass].join(' ')}>
              {delta.text}
            </span>
          ) : null}
          {hint ? <span className={styles.hint}>{hint}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

