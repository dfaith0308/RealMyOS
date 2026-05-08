import styles from './route-loading.module.css'

export default function DefaultRouteLoading() {
  return (
    <div className={styles.wrap}>
      <div className="loading-spinner" aria-hidden />
    </div>
  )
}
