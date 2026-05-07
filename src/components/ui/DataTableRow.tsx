import React from 'react'
import Link from 'next/link'
import styles from './DataTableRow.module.css'

type Density = 'compact' | 'comfortable'

export function DataTableRow({
  href,
  onClick,
  density = 'comfortable',
  selected = false,
  children,
}: {
  href?: string
  onClick?: () => void
  density?: Density
  selected?: boolean
  children: React.ReactNode
}) {
  const densityClass =
    density === 'compact' ? styles.densityCompact : styles.densityComfortable

  const className = [
    styles.row,
    densityClass,
    selected ? styles.selected : '',
    href || onClick ? styles.interactive : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    )
  }

  if (onClick) {
    return (
      <div
        className={className}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
      >
        {children}
      </div>
    )
  }

  return <div className={className}>{children}</div>
}

export function DataCell({
  align = 'start',
  tone = 'primary',
  children,
}: {
  align?: 'start' | 'end'
  tone?: 'primary' | 'secondary' | 'muted'
  children: React.ReactNode
}) {
  const alignClass = align === 'end' ? styles.alignEnd : styles.alignStart
  const toneClass =
    tone === 'primary'
      ? styles.tonePrimary
      : tone === 'secondary'
        ? styles.toneSecondary
        : styles.toneMuted

  return (
    <div className={[styles.cell, alignClass, toneClass].join(' ')}>
      {children}
    </div>
  )
}

