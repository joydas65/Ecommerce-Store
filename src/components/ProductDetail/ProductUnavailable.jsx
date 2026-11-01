'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@mui/material';
import Link from 'next/link';
import styles from './ProductDetail.module.css';

export default function ProductUnavailable() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <main className={`${styles.page} ${styles.state}`}>
      <p className={styles.eyebrow}>PLEASE TRY AGAIN</p>
      <h1 className={styles.stateTitle}>Product unavailable</h1>
      <p role="alert">We couldn&apos;t load this product right now. Please try again in a moment.</p>
      <div className={styles.stateActions}>
        <Button variant="contained" disabled={isPending} aria-busy={isPending} onClick={() => startTransition(() => router.refresh())}>{isPending ? 'Retrying…' : 'Retry'}</Button>
        <Link href="/#products">Back to products</Link>
      </div>
    </main>
  );
}
