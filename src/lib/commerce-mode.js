// Compatibility names for older consumers. New code selects the capability it
// actually needs from storefront-config rather than treating demo as one mode.
export { usesSimulatedPayment as isDemoMode, usesPersistentOrders as isPersistentDemo } from './storefront-config';
