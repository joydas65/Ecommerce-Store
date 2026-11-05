export function merchantProviderUrl(value, provider) {
  try {
    const target = new URL(value);
    const allowed = provider === 'github'
      ? target.origin === 'https://github.com' && target.pathname === '/login/oauth/authorize'
      : provider === 'google' && target.origin === 'https://accounts.google.com' && target.pathname === '/o/oauth2/v2/auth';
    return allowed && !target.username && !target.password && !target.hash ? target.href : null;
  } catch { return null; }
}
