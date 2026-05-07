import React from 'react'
import styles from './Surface.module.css'

type SurfaceVariant = 'canvas' | 'panel' | 'card' | 'raised'
type Density = 'compact' | 'comfortable'

export function Surface({
  as: Comp = 'div',
  variant = 'panel',
  density = 'comfortable',
  inset = false,
  children,
  ...rest
}: {
  as?: keyof React.JSX.IntrinsicElements
  variant?: SurfaceVariant
  density?: Density
  inset?: boolean
  children?: React.ReactNode
} & React.HTMLAttributes<HTMLElement>) {
  const variantClass =
    variant === 'canvas'
      ? styles.variantCanvas
      : variant === 'panel'
        ? styles.variantPanel
        : variant === 'card'
          ? styles.variantCard
          : styles.variantRaised

  const densityClass =
    density === 'compact' ? styles.densityCompact : styles.densityComfortable

  return (
    <Comp
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(rest as any)}
      className={[
        styles.root,
        variantClass,
        densityClass,
        inset ? styles.inset : '',
        rest.className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Comp>
  )
}

