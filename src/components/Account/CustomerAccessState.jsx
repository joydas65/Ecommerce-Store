'use client';

import { useRouter } from 'next/navigation';
import { AccountState } from './AccountWorkspace';
import styles from './Account.module.css';

export default function CustomerAccessState() {
  const router = useRouter();
  return <main className={styles.workspace}><AccountState state="error" onRetry={() => router.refresh()} /></main>;
}
