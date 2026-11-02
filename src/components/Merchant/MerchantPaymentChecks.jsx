'use client';

import Link from 'next/link';
import { Alert, Button, CircularProgress } from '@mui/material';
import { checkOutcomeLabels, checkStateLabels } from './payment-check-client';
import { orderDate } from './merchant-display';
import styles from './Merchant.module.css';

const eligibilityMessages = {
  not_stripe: 'Simulated orders do not have a Stripe payment to check.',
  resolved: 'This payment is already resolved. Its saved result is shown above.',
  missing_session: 'This order has no saved Stripe checkout session to check.',
  in_progress: 'A payment check is in progress. Refresh history after the current check finishes.',
  cooldown: 'A recent check is already recorded. Wait briefly before checking again.',
  payments_disabled: 'Stripe payment checks are currently unavailable in this environment.',
};

export default function MerchantPaymentChecks({ checks, signInHref = '/admin/sign-in' }) {
  const { current, action, busy, retryAt, refresh, recheck } = checks;
  const eligibility = current.data?.eligibility;
  const recovering = !!current.pendingRequestId;
  const showButton = current.state === 'ready' && (recovering || eligibility.eligible || ['in_progress', 'cooldown'].includes(eligibility.reason));
  const blocked = busy || current.storageError || action.conflict || (!recovering && !eligibility?.eligible) || !!retryAt;

  return <section className={`${styles.panel} ${styles.paymentChecks}`} aria-labelledby="payment-check-history-title">
    <div className={styles.checkHeading}>
      <div><p className={styles.eyebrow}>Merchant activity</p><h2 id="payment-check-history-title">Payment check history</h2></div>
      <Button variant="outlined" disabled={busy || current.state === 'loading'} onClick={refresh}>Refresh history</Button>
    </div>
    <p className={styles.checkIntro}>Recheck an unresolved Stripe test payment against its existing checkout session. Each request and outcome is recorded here.</p>
    {action.message && <Alert severity={action.severity || 'info'} role="status" sx={{ mb: 2 }}>{action.replayed ? 'Recovered saved result. ' : ''}{action.message}</Alert>}
    {action.refreshWarning && <Alert severity="warning" sx={{ mb: 2 }}>{action.refreshWarning}</Alert>}
    {current.state === 'loading' ? <div className={styles.checkLoading} role="status"><CircularProgress size={20} aria-hidden="true" /> Loading payment check history…</div>
      : ['unauthorized', 'forbidden'].includes(current.state) ? <Alert severity="warning" action={current.state === 'unauthorized' ? <Button component={Link} href={signInHref}>Sign in</Button> : undefined}>
        {current.state === 'unauthorized' ? 'Sign in again to view payment checks.' : 'Merchant permission is required to view payment checks.'}
      </Alert>
        : current.state !== 'ready' ? <Alert severity="warning" action={<Button onClick={refresh}>Retry payment history</Button>}>Payment check history is unavailable. The saved order above has not been changed by this page.</Alert>
          : <>
            {current.storageError && <Alert severity="warning" sx={{ mb: 2 }}>Browser recovery storage is unavailable or invalid. Retry payment history before starting a check.</Alert>}
            <div className={styles.checkAction}>
              <div>
                {recovering && <p className={styles.recoveryNotice}>A previous request is saved in this tab. Recover it before starting another check.</p>}
                {!eligibility.eligible && <p className={styles.checkReason}>{eligibilityMessages[eligibility.reason]}</p>}
                {retryAt && <p className={styles.checkReason}>Try again after {new Intl.DateTimeFormat('en-US', { timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(retryAt))} UTC.</p>}
              </div>
              {showButton && <Button variant="contained" disabled={blocked} onClick={recheck}>
                {busy ? action.recovering ? 'Recovering check…' : 'Checking Stripe…' : recovering ? 'Recover previous check' : 'Recheck payment status'}
              </Button>}
            </div>
            {current.data.events.length === 0 ? <p className={styles.emptyHistory}>No merchant payment checks yet.</p>
              : <ol className={styles.checkTimeline} aria-label="Payment check history">{current.data.events.map((event) => <li key={event.id}>
                <div className={styles.checkEventHeader}><strong>{checkOutcomeLabels[event.outcome]}</strong><time dateTime={event.occurredAt}>{orderDate(event.occurredAt)}</time></div>
                <p className={styles.checkActor}>By {event.actor.displayName}</p>
                <p className={styles.checkChange}>{event.previousPaymentStatus === event.resultPaymentStatus
                  ? `Saved status: ${checkStateLabels[event.resultPaymentStatus]} (unchanged)`
                  : <>{checkStateLabels[event.previousPaymentStatus]} <span aria-label="changed to">→</span> {checkStateLabels[event.resultPaymentStatus]}</>}</p>
                {event.outcome === 'interrupted' && <p className={styles.checkEventNote}>This attempt ended before a payment result could be recorded.</p>}
                {event.outcome === 'provider_unavailable' && <p className={styles.checkEventNote}>Stripe could not be reached during this check.</p>}
              </li>)}</ol>}
            {current.data.hasMore && <p className={styles.detailFootnote}>Showing the latest 20 activity entries. Earlier entries remain saved in the audit record.</p>}
          </>}
  </section>;
}
