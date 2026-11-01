import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MerchantSignIn from './MerchantSignIn';
import MerchantSignOut from './MerchantSignOut';

const replace = jest.fn();
const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }));
const originalFetch = global.fetch;
beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => { global.fetch = originalFetch; });

test('disabled environments explain availability without offering a broken sign-in', () => {
  render(<MerchantSignIn available={false} />);
  expect(screen.getByText(/not configured in this environment/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Sign in with GitHub' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to storefront' })).toHaveAttribute('href', '/');
});

test('the sign-in body cannot request another provider, callback or role and failures allow retry', async () => {
  global.fetch.mockResolvedValue({ ok: false, status: 503 });
  render(<MerchantSignIn available />);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/);
  expect(global.fetch).toHaveBeenCalledWith('/api/auth/sign-in/social', expect.objectContaining({ method: 'POST', body: JSON.stringify({ provider: 'github', callbackURL: '/admin/orders', errorCallbackURL: '/admin/sign-in' }) }));
  expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeEnabled();
});

test('sign-in distinguishes rate limiting without reflecting provider errors', async () => {
  global.fetch.mockResolvedValue({ ok: false, status: 429 });
  render(<MerchantSignIn available failed />);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' }));
  expect(await screen.findByText(/wait a moment before trying/)).toBeVisible();
});

test('sign-in refuses an unexpected redirect', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ url: 'https://attacker.example' }) });
  render(<MerchantSignIn available />);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/);
});

test('sign-out waits for session revocation before replacing the page', async () => {
  let resolve;
  global.fetch.mockImplementation(() => new Promise((done) => { resolve = done; }));
  render(<MerchantSignOut />);
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
  expect(replace).not.toHaveBeenCalled();
  resolve({ ok: true });
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/sign-in'));
  expect(refresh).toHaveBeenCalled();
});

test('failed sign-out preserves the current page and offers retry', async () => {
  global.fetch.mockResolvedValue({ ok: false });
  render(<MerchantSignOut />);
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out');
  expect(replace).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
});
