'use client';

import { usesSimulatedPayment, usesHostedStripe } from '../../lib/storefront-config';
import DemoPaymentForm from './DemoPaymentForm';
import LegacyStripePaymentForm from './LegacyStripePaymentForm';
import HostedStripePaymentForm from './HostedStripePaymentForm';

// The form follows the payment provider; catalog and receipt storage are separate.
export default function PaymentForm(props) {
  return usesHostedStripe ? <HostedStripePaymentForm {...props} />
    : usesSimulatedPayment ? <DemoPaymentForm {...props} /> : <LegacyStripePaymentForm {...props} />;
}
