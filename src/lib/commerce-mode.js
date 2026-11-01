// Public, build-time configuration. Merchant credentials never select live mode.
// A fresh checkout (or an unrecognized value) always starts the safe demo.
export const isDemoMode = process.env.NEXT_PUBLIC_COMMERCE_MODE !== 'live';
export const isPersistentDemo = isDemoMode && process.env.NEXT_PUBLIC_DEMO_ORDER_STORAGE === 'remote';
