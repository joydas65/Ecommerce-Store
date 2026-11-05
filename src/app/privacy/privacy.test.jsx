import { render, screen } from '@testing-library/react';
import PrivacyPage, { metadata } from './page';

test('privacy is public and explains account access, retention and deletion', () => {
  render(<PrivacyPage />);
  expect(screen.getByRole('heading', { level: 1, name: 'Privacy at Joy’s Store' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Google sign-in' })).toHaveTextContent('basic identity, email and profile access');
  expect(screen.getByRole('region', { name: 'Your account and orders' })).toHaveTextContent('Shopper sign-in does not grant merchant access');
  expect(screen.getByRole('region', { name: 'How long information remains' })).toHaveTextContent('30 days');
  expect(screen.getByRole('region', { name: 'How long information remains' })).toHaveTextContent('until the store owner processes a deletion request');
  expect(screen.getByRole('link', { name: 'joydas.0111@gmail.com' })).toHaveAttribute('href', 'mailto:joydas.0111@gmail.com');
});

test('privacy provides storefront and sign-in navigation without an account session', () => {
  render(<PrivacyPage />);
  expect(screen.getByRole('navigation', { name: 'Privacy page navigation' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Account sign-in' })).toHaveAttribute('href', '/account/sign-in');
  expect(screen.getByRole('link', { name: 'Continue shopping' })).toHaveAttribute('href', '/');
  expect(metadata.title).toBe('Privacy');
});
