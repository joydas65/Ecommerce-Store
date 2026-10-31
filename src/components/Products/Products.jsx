'use client';

import { Box, Grid } from '@mui/material';

import Product from './Product/Product';
import styles from './styles';

const Products = ({ products, onAddToCart, isUpdating = false }) => (
  <Box component="main" sx={styles.content}>
    <Box sx={styles.toolbar} />
    <Grid container justifyContent="center" spacing={4}>
      {products.map((product) => (
        <Grid key={product.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <Product product={product} onAddToCart={onAddToCart} isUpdating={isUpdating} />
        </Grid>
      ))}
    </Grid>
  </Box>
);

export default Products;
