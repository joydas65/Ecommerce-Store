export function googleAuthorizationUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value);
    return url.origin === 'https://accounts.google.com' && url.pathname === '/o/oauth2/v2/auth'
      && !url.username && !url.password && !url.hash ? url.href : null;
  } catch { return null; }
}

export const customerSignInBody = Object.freeze({ provider: 'google', callbackURL: '/account', errorCallbackURL: '/account/sign-in' });
