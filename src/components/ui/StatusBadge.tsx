import React from 'react'
import type { DSStatus } from '@/styles/design-system'
import { ds, getStatusLabel } from '@/styles/design-system'
import styles from './StatusBadge.module.css'

type BadgeSize = 'sm' | 'md'

export function StatusBadge({
  status,
  lang = 'ko',
  size = 'md',
  prefix,
  title,
  className,
}: {
  status: DSStatus
  lang?: 'ko' | 'en'
  size?: BadgeSize
  prefix?: string
  title?: string
  className?: string
}) {
  const meta = ds.status[status]

  const label = getStatusLabel(status, lang)

  const sizeClass = size === 'sm' ? styles.sizeSm : styles.sizeMd
  const emphasisClass =
    meta.emphasis === 'strong' ? styles.emphasisStrong : styles.emphasisNormal
  const toneClass =
    meta.tone === 'success'
      ? styles.toneSuccess
      : meta.tone === 'warning'
        ? styles.toneWarning
        : meta.tone === 'danger'
          ? styles.toneDanger
          : styles.toneNeutral

  return (
    <span
      title={title ?? `${label} · P${meta.priority}`}
      className={[styles.root, sizeClass, emphasisClass, toneClass, className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {prefix ? (
        <span className={styles.prefix}>{prefix}</span>
      ) : null}
      {label}
    </span>
  )
}

