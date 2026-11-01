'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { Alert, Box, CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import Navbar from '../components/Navbar/Navbar';
import { CommerceProvider, useCommerce } from '../context/CommerceContext';
import { isDemoMode } from '../lib/commerce-mode';

const theme = createTheme({
  palette: { primary: { main: '#3f51b5' }, secondary: { main: '#c51162' } },
});

function StoreShell({ children }) {
  const { cart, cartActionError } = useCommerce();
  return (
    <>
      <Navbar totalItems={cart.total_items || 0} />
      {isDemoMode && (
        <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
          <Alert severity="info" role="note">
            <strong>Demo store.</strong> Sample products and simulated orders. No payment is collected and nothing is shipped.
          </Alert>
        </Box>
      )}
      {cartActionError && <Box sx={{ pt: 2, px: 3 }}><Alert severity="error">{cartActionError}</Alert></Box>}
      {children}
    </>
  );
}

export default function Providers({ children }) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <CommerceProvider><StoreShell>{children}</StoreShell></CommerceProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
