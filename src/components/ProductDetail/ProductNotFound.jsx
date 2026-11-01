import Link from 'next/link';
import styles from './ProductDetail.module.css';

export default function ProductNotFound() {
  return (
    <main className={`${styles.page} ${styles.state}`}>
      <p className={styles.eyebrow}>A LITTLE OFF THE SHELF</p>
      <h1 className={styles.stateTitle}>Product not found</h1>
      <p>This product may have moved or is no longer available.</p>
      <div className={styles.stateActions}><Link href="/#products">Back to products</Link></div>
    </main>
  );
}
