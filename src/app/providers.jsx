'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { Alert, Box, CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import Navbar from '../components/Navbar/Navbar';
import { CommerceProvider, useCommerce } from '../context/CommerceContext';

const theme = createTheme({
  palette: { primary: { main: '#3f51b5' }, secondary: { main: '#f50057' } },
});

function StoreShell({ children }) {
  const { cart, cartActionError } = useCommerce();
  return (
    <>
      <Navbar totalItems={cart.total_items || 0} />
      {cartActionError && <Box sx={{ pt: 9, px: 3 }}><Alert severity="error">{cartActionError}</Alert></Box>}
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
