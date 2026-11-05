'use client';

import { useEffect, useState } from 'react';

export default function useCustomerResource(path, validate, valid = true) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const key = `${path}:${attempt}`;
  const current = !valid ? { state: 'invalid' } : result?.key === key ? result : { state: 'loading' };
  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
        if (!active) return;
        const failure = { 401: 'unauthorized', 403: 'unauthorized', 404: 'missing', 400: 'invalid' }[response.status];
        if (failure) { setResult({ key, state: failure }); return; }
        if (!response.ok) throw new Error('Account unavailable');
        const data = await response.json();
        if (!active) return;
        if (!validate(data)) throw new Error('Invalid account response');
        setResult({ key, state: 'ready', data });
      } catch {
        if (active) setResult({ key, state: 'error' });
      }
    }
    load();
    return () => { active = false; controller.abort(); };
  }, [path, key, valid, validate]);
  return { ...current, retry: () => setAttempt((value) => value + 1) };
}
