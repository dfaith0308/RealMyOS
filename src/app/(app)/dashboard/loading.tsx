import { Surface } from '@/components/ui/Surface'
import styles from './loading.module.css'

export default function Loading() {
  return (
    <main className={styles.page}>
      <Surface variant="panel" density="comfortable">
        <div className={styles.box}>
          <div className={[styles.line, styles.lineStrong].join(' ')} />
          <div className={styles.line} />
        </div>
      </Surface>

      <div className={styles.grid}>
        <Surface variant="panel" density="comfortable">
          <div className={styles.box}>
            <div className={styles.line} />
            <div className={styles.line} />
            <div className={styles.line} />
            <div className={styles.line} />
          </div>
        </Surface>
        <Surface variant="panel" density="comfortable">
          <div className={styles.box}>
            <div className={styles.line} />
            <div className={styles.line} />
            <div className={styles.line} />
          </div>
        </Surface>
      </div>
    </main>
  )
}
