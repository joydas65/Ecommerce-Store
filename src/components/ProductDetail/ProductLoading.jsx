import styles from './ProductDetail.module.css';

export default function ProductLoading() {
  return (
    <main className={styles.page} aria-busy="true">
      <h1 className={styles.stateTitle}>Loading product</h1>
      <p role="status" aria-live="polite">Getting the product details ready…</p>
      <div className={styles.hero} aria-hidden="true">
        <div className={`${styles.imagePanel} ${styles.skeleton}`} />
        <div><div className={styles.skeletonLine} /><div className={styles.skeletonLine} /><div className={styles.skeletonLine} /></div>
      </div>
    </main>
  );
}
