import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MerchantSignIn from './MerchantSignIn';
import MerchantSignOut from './MerchantSignOut';
import MerchantGoogleConnection from './MerchantGoogleConnection';
import { merchantProviderUrl } from '../../lib/merchant/provider-url';

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

test('Google is opt-in and sends only the fixed merchant sign-in request', async () => {
  global.fetch.mockResolvedValue({ ok: false, status: 503 });
  const { rerender } = render(<MerchantSignIn available />);
  expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument();
  rerender(<MerchantSignIn available googleEnabled />);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
  expect(global.fetch).toHaveBeenCalledWith('/api/auth/sign-in/social', expect.objectContaining({ body: JSON.stringify({ provider: 'google', callbackURL: '/admin/orders', errorCallbackURL: '/admin/sign-in' }) }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/);
});

test('provider URL validation never permits another provider or a lookalike host', () => {
  expect(merchantProviderUrl('https://accounts.google.com/o/oauth2/v2/auth?state=fixture', 'google')).toBeTruthy();
  for (const url of ['https://accounts.google.com.attacker.example/o/oauth2/v2/auth', 'https://accounts.google.com/another', 'https://github.com/login/oauth/authorize', 'javascript:alert(1)', 'https://accounts.google.com/o/oauth2/v2/auth#token']) {
    expect(merchantProviderUrl(url, 'google')).toBeNull();
  }
});

test('Google linking does not offer another link after the account is connected', () => {
  const { rerender } = render(<MerchantGoogleConnection enabled={false} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  rerender(<MerchantGoogleConnection enabled linked />);
  expect(screen.getByText('Google connected')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Connect Google' })).not.toBeInTheDocument();
});

test('Google connection callback failures explain the result without hiding existing access', () => {
  render(<MerchantGoogleConnection enabled failed linked />);
  expect(screen.getByRole('alert')).toHaveTextContent('Google connection was not completed. Your existing merchant access is available.');
  expect(screen.getByText('Google connected')).toBeVisible();
});

test.each(['sign-in', 'connect'])('an unmounted %s cannot finish a stale redirect after reading the response', async (flow) => {
  let finishJson;
  const readUrl = jest.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?state=fixture');
  global.fetch.mockResolvedValue({ ok: true, json: () => new Promise((resolve) => { finishJson = resolve; }) });
  const view = render(flow === 'sign-in' ? <MerchantSignIn available googleEnabled /> : <MerchantGoogleConnection enabled />);
  const button = screen.getByRole('button', { name: flow === 'sign-in' ? 'Sign in with Google' : 'Connect Google' });
  fireEvent.click(button); fireEvent.click(button);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(finishJson).toEqual(expect.any(Function)));
  const signal = global.fetch.mock.calls[0][1].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finishJson({ get url() { return readUrl(); } }));
  expect(readUrl).not.toHaveBeenCalled();
});

test('merchant sign-in hides unexpected network and parser error details', async () => {
  global.fetch.mockRejectedValue(new Error('sensitive-provider-detail'));
  render(<MerchantSignIn available />);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in is temporarily unavailable');
  expect(screen.queryByText(/sensitive-provider-detail/)).not.toBeInTheDocument();
});

test('Google linking handles a lost session and permits retry without exposing upstream errors', async () => {
  global.fetch.mockResolvedValue({ ok: false, status: 401 });
  render(<MerchantGoogleConnection enabled />);
  await userEvent.click(screen.getByRole('button', { name: 'Connect Google' }));
  expect(global.fetch).toHaveBeenCalledWith('/api/auth/link-social', expect.objectContaining({ credentials: 'same-origin', body: JSON.stringify({ provider: 'google', callbackURL: '/admin/orders', errorCallbackURL: '/admin/sign-in' }) }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign in with your approved GitHub account');
  expect(screen.getByRole('button', { name: 'Connect Google' })).toBeEnabled();
});

test('Google linking blocks repeated clicks and unsafe provider redirects', async () => {
  let resolve;
  global.fetch.mockImplementation(() => new Promise((done) => { resolve = done; }));
  render(<MerchantGoogleConnection enabled />);
  await userEvent.click(screen.getByRole('button', { name: 'Connect Google' }));
  expect(screen.getByRole('button', { name: 'Opening Google…' })).toBeDisabled();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  resolve({ ok: true, json: async () => ({ url: 'https://attacker.example' }) });
  expect(await screen.findByRole('alert')).toHaveTextContent('Google could not be connected');
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
