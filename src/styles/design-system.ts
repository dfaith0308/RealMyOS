export type DSDensity = 'compact' | 'comfortable'

export type DSStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'overdue'
  | 'blocked'
  | 'completed'
  | 'partial'
  | 'paid'
  | 'unpaid'
  | 'warning'
  | 'danger'

export type DSRadius = 'sm' | 'md' | 'lg' | 'xl'
export type DSSurface = 'canvas' | 'panel' | 'card' | 'raised'

export const ds = {
  // ============================================================
  // Brand / base tokens (SSOT)
  // ============================================================
  brand: {
    primary: '#1f5d3a',
    background: '#f7f6f2',
    text: '#2b2b2b',
  },

  // Neutral ramp: keep minimal; avoid “template grey soup”.
  neutral: {
    0:  '#ffffff',
    50: '#faf9f6',
    100:'#f3f1eb',
    200:'#e8e6e1', // brand border
    300:'#d6d2c9',
    600:'#6b6b6b', // brand secondary text
    900:'#2b2b2b', // brand base text
  },

  // ============================================================
  // Semantic tokens (what UI should use)
  // ============================================================
  semantic: {
    color: {
      surface: {
        canvas: 'var(--ds-surface-canvas)',
        panel:  'var(--ds-surface-panel)',
        card:   'var(--ds-surface-card)',
        raised: 'var(--ds-surface-raised)',
      },
      text: {
        primary:   'var(--ds-text-primary)',
        secondary: 'var(--ds-text-secondary)',
        muted:     'var(--ds-text-muted)',
        inverse:   'var(--ds-text-inverse)',
      },
      border: {
        default: 'var(--ds-border-default)',
        subtle:  'var(--ds-border-subtle)',
        strong:  'var(--ds-border-strong)',
      },
      focusRing: 'var(--ds-focus-ring)',
    },
  },

  // ============================================================
  // Typography
  // - numbers must read first; default body is calm.
  // ============================================================
  typography: {
    fontFamily: {
      sans: `'Pretendard','Inter',-apple-system,sans-serif`,
      monoNumbers: `'Inter',ui-monospace,SFMono-Regular,Menlo,monospace`,
    },
    size: {
      label: 11,
      body:  14,
      section: 14,
      title: 20,
      display: 24,
      number: 18,
      numberLg: 24,
    },
    weight: {
      regular: 400,
      medium:  500,
      semibold:600,
      bold:    700,
      black:   800,
      ultra:   900,
    },
    lineHeight: {
      tight:  1.2,
      normal: 1.5,
    },
  },

  // ============================================================
  // Layout scale
  // ============================================================
  spacing: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 24,
    6: 32,
    7: 48,
  } as const,

  radius: {
    sm: 6,
    md: 8,
    lg: 10,
    xl: 12,
  } as const satisfies Record<DSRadius, number>,

  // Shadows: do not use by default.
  shadow: {
    none: 'none',
    subtle: '0 1px 0 rgba(0,0,0,0.04)',
  } as const,

  zIndex: {
    nav: 50,
    overlay: 100,
    toast: 200,
  } as const,

  // ============================================================
  // Density (table/list)
  // ============================================================
  density: {
    compact: {
      rowHeight: 34,
      cellPaddingY: 8,
      cellPaddingX: 12,
      chipHeight: 20,
    },
    comfortable: {
      rowHeight: 40,
      cellPaddingY: 10,
      cellPaddingX: 14,
      chipHeight: 22,
    },
  } as const satisfies Record<DSDensity, Record<string, number>>,

  // ============================================================
  // State language (color is not the message)
  // - Always pairs text + shape + priority.
  // ============================================================
  status: {
    pending: {
      label: { ko: '대기', en: 'Pending' },
      priority: 1,
      emphasis: 'normal',
      tone: 'neutral',
    },
    confirmed: {
      label: { ko: '확정', en: 'Confirmed' },
      priority: 2,
      emphasis: 'strong',
      tone: 'success',
    },
    cancelled: {
      label: { ko: '취소', en: 'Cancelled' },
      priority: 2,
      emphasis: 'normal',
      tone: 'neutral',
    },
    overdue: {
      label: { ko: '연체', en: 'Overdue' },
      priority: 3,
      emphasis: 'strong',
      tone: 'danger',
    },
    blocked: {
      label: { ko: '차단', en: 'Blocked' },
      priority: 3,
      emphasis: 'strong',
      tone: 'danger',
    },
    completed: {
      label: { ko: '완료', en: 'Completed' },
      priority: 2,
      emphasis: 'normal',
      tone: 'success',
    },
    partial: {
      label: { ko: '부분', en: 'Partial' },
      priority: 2,
      emphasis: 'normal',
      tone: 'warning',
    },
    paid: {
      label: { ko: '결제완료', en: 'Paid' },
      priority: 2,
      emphasis: 'normal',
      tone: 'success',
    },
    unpaid: {
      label: { ko: '미결제', en: 'Unpaid' },
      priority: 2,
      emphasis: 'normal',
      tone: 'neutral',
    },
    warning: {
      label: { ko: '주의', en: 'Warning' },
      priority: 2,
      emphasis: 'normal',
      tone: 'warning',
    },
    danger: {
      label: { ko: '위험', en: 'Danger' },
      priority: 3,
      emphasis: 'strong',
      tone: 'danger',
    },
  } as const satisfies Record<
    DSStatus,
    {
      label: { ko: string; en: string }
      priority: 1 | 2 | 3
      emphasis: 'normal' | 'strong'
      tone: 'neutral' | 'success' | 'warning' | 'danger'
    }
  >,
} as const

export type DesignSystem = typeof ds

export const DS_STATUS_ORDER: readonly DSStatus[] = [
  'danger',
  'overdue',
  'blocked',
  'warning',
  'partial',
  'unpaid',
  'pending',
  'confirmed',
  'paid',
  'completed',
  'cancelled',
] as const

export function getStatusLabel(status: DSStatus, lang: 'ko' | 'en' = 'ko') {
  return ds.status[status].label[lang]
}


