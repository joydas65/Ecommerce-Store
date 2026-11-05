'use client';

import { AppBar, Toolbar, Box, Typography, Button } from '@mui/material';
import { ShoppingBagOutlined, AccountCircleOutlined } from '@mui/icons-material';
import Link from 'next/link';

import styles from './styles';

const Navbar = ({ totalItems, customerAccountsEnabled = false }) => (
  <AppBar position="sticky" sx={styles.appBar} color="inherit" component="header">
    <Toolbar sx={styles.toolbar}>
      <Box component={Link} href="/" sx={styles.title}>
        <Box component="span" sx={styles.mark} aria-hidden="true">j.</Box>
        <Typography component="span" sx={styles.wordmark}>Joy&apos;s Store</Typography>
      </Box>
      <Typography component="span" sx={styles.tagline}>WORK & EVERYDAY</Typography>
      {customerAccountsEnabled && <Button component={Link} href="/account" color="primary" sx={{ ml: 'auto', minWidth: 44, gap: 0.75 }} aria-label="Your account">
        <AccountCircleOutlined sx={{ fontSize: 20 }} /><Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Account</Box>
      </Button>}
      <Button component={Link} href="/cart" variant="outlined" color="primary" sx={{ ...styles.cart, ...(customerAccountsEnabled ? { ml: 0 } : {}) }}
        aria-label={`Cart ${totalItems} ${totalItems === 1 ? 'item' : 'items'}`}>
        <ShoppingBagOutlined sx={{ fontSize: 20 }} />
        <Box component="span">Cart{' '}</Box>
        <Box component="span" sx={styles.count}>{totalItems}</Box>
      </Button>
    </Toolbar>
  </AppBar>
);

export default Navbar;
