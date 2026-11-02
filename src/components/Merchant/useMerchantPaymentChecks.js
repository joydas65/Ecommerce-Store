'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isStripeOrder } from '../../lib/orders/order-contract';
import { checkFeedback, checkOutcomeLabels, clearPaymentCheck, isPaymentCheckHistory, isPaymentCheckResult, paymentCheckFailure, reservePaymentCheck, savedPaymentCheck } from './payment-check-client';

const ambiguousMessage = 'The result could not be confirmed. Recover the previous check to reuse the same request.';
const historyPath = (id) => `/api/merchant/orders/${encodeURIComponent(id)}/payment-checks`;
const accessState = (status) => ({ 401: 'unauthorized', 403: 'forbidden', 404: 'missing' }[status]);

async function historyRequest(orderId, signal) {
  const response = await fetch(historyPath(orderId), { cache: 'no-store', credentials: 'same-origin', signal });
  const denied = accessState(response.status);
  if (denied) return { state: denied };
  if (!response.ok) throw new Error('Payment history unavailable.');
  const data = await response.json();
  if (!isPaymentCheckHistory(data)) throw new Error('Payment history could not be verified.');
  return { state: 'ready', data };
}

export default function useMerchantPaymentChecks({ orderId, revision, onOrder, onAccessDenied }) {
  const key = `${orderId}:${revision}`;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [operation, setOperation] = useState(null);
  const [clock, setClock] = useState(() => Date.now());
  const activeController = useRef(null);
  const actionLock = useRef(null);
  const expiryRefresh = useRef(null);
  const current = result?.key === key ? result : { state: 'loading' };
  const action = operation?.key === key ? operation : {};
  const busy = !!action.busy;
  const rawRetryAt = action.retryAt || current.data?.eligibility.retryAt;
  const retryAt = rawRetryAt && Date.parse(rawRetryAt) > clock ? rawRetryAt : null;

  useEffect(() => {
    const controller = new AbortController();
    activeController.current = controller;
    let active = true;
    async function loadHistory() {
      let pendingRequestId = null;
      let storageError = false;
      try { pendingRequestId = savedPaymentCheck(orderId); } catch { storageError = true; }
      try {
        const history = await historyRequest(orderId, controller.signal);
        if (!active) return;
        if (['unauthorized', 'forbidden'].includes(history.state)) onAccessDenied(history.state);
        setClock(Date.now());
        setResult({ key, ...history, pendingRequestId, storageError });
      } catch {
        if (active) setResult({ key, state: 'error', pendingRequestId, storageError });
      }
    }
    loadHistory();
    return () => { active = false; controller.abort(); };
  }, [orderId, key, attempt, onAccessDenied]);

  // One read when a server-provided cooldown/lease expires. Never retry a
  // provider check automatically, and never poll while one is in flight.
  useEffect(() => {
    if (busy || !rawRetryAt) return;
    const wait = Date.parse(rawRetryAt) - Date.now();
    const expiryKey = `${key}:${rawRetryAt}`;
    if (wait <= 0 && expiryRefresh.current === expiryKey) return;
    const timer = setTimeout(() => {
      expiryRefresh.current = expiryKey;
      setClock(Date.now());
      setOperation((previous) => previous?.key === key ? { ...previous, retryAt: null } : previous);
      setAttempt((value) => value + 1);
    }, Math.max(0, Math.min(wait + 100, 2147483647)));
    return () => clearTimeout(timer);
  }, [busy, rawRetryAt, key]);

  const refresh = useCallback(() => {
    if (actionLock.current?.key === key) return;
    setResult(null);
    setOperation(null);
    setAttempt((value) => value + 1);
  }, [key]);

  const updatePending = (pendingRequestId, storageError = false) => {
    setResult((previous) => previous?.key === key ? { ...previous, pendingRequestId, storageError } : previous);
  };

  const refreshSavedState = async (signal) => {
    const requests = await Promise.allSettled([
      historyRequest(orderId, signal),
      fetch(`/api/merchant/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store', credentials: 'same-origin', signal }).then(async (response) => {
        const denied = accessState(response.status);
        if (denied) return { state: denied };
        if (!response.ok) throw new Error('Order unavailable.');
        const order = await response.json();
        if (!isStripeOrder(order, orderId)) throw new Error('Order could not be verified.');
        return { state: 'ready', order };
      }),
    ]);
    if (signal.aborted) return;
    for (const request of requests) {
      if (request.status === 'fulfilled' && ['unauthorized', 'forbidden'].includes(request.value.state)) {
        onAccessDenied(request.value.state);
        return;
      }
    }
    let pendingRequestId = null;
    let storageError = false;
    try { pendingRequestId = savedPaymentCheck(orderId); } catch { storageError = true; }
    const [history, order] = requests;
    setClock(Date.now());
    setResult({ key, ...(history.status === 'fulfilled' ? history.value : { state: 'error' }), pendingRequestId, storageError });
    if (order.status === 'fulfilled' && order.value.state === 'ready') onOrder(order.value.order);
    if (order.status !== 'fulfilled' || order.value.state !== 'ready') {
      setOperation((previous) => previous?.key === key ? { ...previous, refreshWarning: 'The latest order record could not be refreshed. Use Refresh order to try again.' } : previous);
    }
  };

  const recheck = async () => {
    if (actionLock.current?.key === key || current.state !== 'ready' || current.storageError || !activeController.current) return;
    const eligibility = current.data.eligibility;
    if (!current.pendingRequestId && !eligibility.eligible) return;
    if (retryAt && Date.parse(retryAt) > Date.now()) return;
    const controller = activeController.current;
    const lock = { key };
    actionLock.current = lock;
    let requestId;
    try {
      requestId = reservePaymentCheck(orderId);
    } catch {
      actionLock.current = null;
      updatePending(current.pendingRequestId || null, true);
      setOperation({ key, severity: 'error', message: 'This browser could not save recovery for the check. No request was sent. Retry payment history after browser storage is available.' });
      return;
    }
    updatePending(requestId);
    setOperation({ key, busy: true, recovering: !!current.pendingRequestId });
    try {
      const response = await fetch(`/api/merchant/orders/${encodeURIComponent(orderId)}/recheck-payment`, {
        method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }), signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if ([401, 403].includes(response.status)) {
        onAccessDenied(accessState(response.status));
        return;
      }
      if (response.status === 200) {
        const value = await response.json();
        if (controller.signal.aborted) return;
        if (!isPaymentCheckResult(value, orderId, requestId)) throw new Error('Check result could not be verified.');
        onOrder(value.order);
        let storageError = false;
        try { clearPaymentCheck(orderId, requestId); } catch { storageError = true; }
        updatePending(storageError ? requestId : null, storageError);
        setOperation({ key, busy: true, ...checkFeedback[value.check.outcome], replayed: value.replayed,
          ...(value.replayed ? { message: `Earlier check: ${checkOutcomeLabels[value.check.outcome]}. The latest saved payment status is shown above.` } : {}) });
        await refreshSavedState(controller.signal);
      } else if ([409, 429].includes(response.status)) {
        const failure = paymentCheckFailure(await response.json(), response.status);
        if (controller.signal.aborted) return;
        if (!failure) throw new Error('Check result could not be verified.');
        if (failure.code === 'PAYMENT_CHECK_NOT_ELIGIBLE') {
          // This response means this new request was not admitted. Refresh both
          // records before releasing its recovery identity.
          await refreshSavedState(controller.signal);
          if (controller.signal.aborted) return;
          let storageError = false;
          try { clearPaymentCheck(orderId, requestId); } catch { storageError = true; }
          updatePending(storageError ? requestId : null, storageError);
          setOperation({ key, severity: 'info', message: 'This order is not eligible for another payment check. The latest saved information is shown above.' });
        } else {
          const message = failure.code === 'PAYMENT_CHECK_IN_PROGRESS'
            ? 'A payment check is already in progress. Recover this request after the current check finishes.'
            : failure.code === 'PAYMENT_CHECK_RATE_LIMITED'
              ? 'Payment checks are temporarily limited. Your recovery request has been kept; try again after the time shown below.'
              : 'This recovery request belongs to a different check. Refresh the order history before taking another action.';
          setOperation({ key, severity: 'warning', message, retryAt: failure.retryAt, conflict: failure.code === 'IDEMPOTENCY_CONFLICT' });
          await refreshSavedState(controller.signal);
        }
      } else {
        throw new Error('Check result is unknown.');
      }
    } catch {
      if (!controller.signal.aborted) {
        setOperation({ key, severity: 'warning', message: ambiguousMessage });
        await refreshSavedState(controller.signal);
      }
    } finally {
      if (actionLock.current === lock) actionLock.current = null;
      if (!controller.signal.aborted) setOperation((previous) => previous?.key === key ? { ...previous, busy: false } : previous);
    }
  };

  return { current, action, busy, retryAt, refresh, recheck };
}
