'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { Alert, Box, CssBaseline, ThemeProvider } from '@mui/material';
import Navbar from '../components/Navbar/Navbar';
import { CommerceProvider, useCommerce } from '../context/CommerceContext';
import { usesSimulatedPayment, usesHostedStripe } from '../lib/storefront-config';
import theme from './store-theme';

function StoreShell({ children }) {
  const { cart, cartActionError } = useCommerce();
  return (
    <>
      <Box component="a" href="#main-content" sx={{ position: 'fixed', top: -80, left: 16, zIndex: 1500, px: 2, py: 1.5, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 1, '&:focus': { top: 12 } }}>Skip to content</Box>
      <Navbar totalItems={cart.total_items || 0} />
      {(usesSimulatedPayment || usesHostedStripe) && (
        <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#eef1e9' }}>
          <Box role="note" sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, sm: 4 }, py: 1.25, fontSize: 12, lineHeight: 1.6, color: 'text.secondary' }}>
            {usesHostedStripe ? <><Box component="strong" sx={{ color: 'primary.main', mr: 0.5 }}>Stripe test checkout.</Box> Sample products with Stripe test payments. No real money is charged and nothing is shipped.</>
              : <><Box component="strong" sx={{ color: 'primary.main', mr: 0.5 }}>Demo store.</Box> Sample products and simulated orders. No payment is collected and nothing is shipped.</>}
          </Box>
        </Box>
      )}
      {cartActionError && <Box sx={{ pt: 2, px: 3 }}><Alert severity="error">{cartActionError}</Alert></Box>}
      <Box id="main-content" tabIndex={-1}>{children}</Box>
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
