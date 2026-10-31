'use client';

import { AppBar, Toolbar, IconButton, Badge, Box, Typography } from '@mui/material';
import { ShoppingCart } from '@mui/icons-material';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import logo from '../../assets/commerce.png';
import styles from './styles';

const Navbar = ({ totalItems }) => {
  const pathname = usePathname();

  return (
    <AppBar position="fixed" sx={styles.appBar} color="inherit">
      <Toolbar>
        <Typography component={Link} href="/" variant="h6" sx={styles.title} color="inherit">
          <Image src={logo} alt="" width={25} height={25} />
          Joy&apos;s Store
        </Typography>
        <Box sx={styles.grow} />
        {pathname === '/' && (
          <IconButton component={Link} href="/cart" aria-label="Show cart items" color="inherit">
            <Badge badgeContent={totalItems} color="secondary">
              <ShoppingCart />
            </Badge>
          </IconButton>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;
