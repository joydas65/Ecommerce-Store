'use client';

import { AppBar, Toolbar, Box, Typography, Button } from '@mui/material';
import { ShoppingBagOutlined } from '@mui/icons-material';
import Link from 'next/link';

import styles from './styles';

const Navbar = ({ totalItems }) => (
  <AppBar position="sticky" sx={styles.appBar} color="inherit" component="header">
    <Toolbar sx={styles.toolbar}>
      <Box component={Link} href="/" sx={styles.title}>
        <Box component="span" sx={styles.mark} aria-hidden="true">j.</Box>
        <Typography component="span" sx={styles.wordmark}>Joy&apos;s Store</Typography>
      </Box>
      <Typography component="span" sx={styles.tagline}>WORK & EVERYDAY</Typography>
      <Button component={Link} href="/cart" variant="outlined" color="primary" sx={styles.cart}
        aria-label={`Cart ${totalItems} ${totalItems === 1 ? 'item' : 'items'}`}>
        <ShoppingBagOutlined sx={{ fontSize: 20 }} />
        <Box component="span">Cart{' '}</Box>
        <Box component="span" sx={styles.count}>{totalItems}</Box>
      </Button>
    </Toolbar>
  </AppBar>
);

export default Navbar;
