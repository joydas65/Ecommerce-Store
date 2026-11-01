const uuid = '[\\da-f]{8}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{12}';
const orderIdPattern = new RegExp(`^order_${uuid}$`, 'i');
const quoteIdPattern = new RegExp(`^quote_${uuid}$`, 'i');
const isAmount = (value) => Number.isSafeInteger(value) && value >= 0;
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

function isPricingSnapshot(value) {
  if (!value || value.currency !== 'USD' || value.pricingVersion !== 'demo-v1'
    || !['demo-standard', 'demo-express'].includes(value.shippingMethod)
    || !Array.isArray(value.items) || value.items.length === 0
    || ![value.subtotalCents, value.shippingCents, value.taxCents, value.totalCents].every(isAmount)) return false;

  if (!value.items.every((item) => item && isText(item.productId) && isText(item.name)
    && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 99
    && isAmount(item.unitPriceCents) && isAmount(item.lineTotalCents)
    && item.lineTotalCents === item.unitPriceCents * item.quantity)) return false;

  const subtotal = value.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  return new Set(value.items.map((item) => item.productId)).size === value.items.length
    && subtotal === value.subtotalCents
    && value.totalCents === subtotal + value.shippingCents + value.taxCents
    && value.taxCents === Math.round((subtotal + value.shippingCents) * 8 / 100);
}

// Validate the server's pricing/confirmation contract before displaying success
// or clearing a cart. These checks supplement, rather than replace, server rules.
export function isOrderReceipt(order, expectedId) {
  return !!(isPricingSnapshot(order)
    && typeof order.id === 'string' && orderIdPattern.test(order.id)
    && (expectedId === undefined || order.id === expectedId)
    && typeof order.reference === 'string' && /^DEMO-[\da-z-]+$/i.test(order.reference)
    && typeof order.quoteId === 'string' && quoteIdPattern.test(order.quoteId)
    && order.status === 'CONFIRMED' && order.paymentStatus === 'SIMULATED'
    && isDate(order.createdAt) && isDate(order.expiresAt)
    && Date.parse(order.expiresAt) > Date.parse(order.createdAt));
}

export function isQuote(quote, expectedId) {
  return !!(isPricingSnapshot(quote)
    && typeof quote.id === 'string' && quoteIdPattern.test(quote.id)
    && (expectedId === undefined || quote.id === expectedId)
    && isDate(quote.expiresAt));
}
