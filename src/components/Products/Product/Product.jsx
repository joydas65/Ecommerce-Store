'use client';

import { Box, Card, CardMedia, CardContent, CardActions, Typography, Button, CircularProgress } from '@mui/material';
import { Add } from '@mui/icons-material';
import { useId } from 'react';
import Link from 'next/link';
import { productPath } from '../../../lib/product-path';

import styles from './styles';

const Product = ({ product, onAddToCart, isUpdating = false, isAdding = false }) => {
  const titleId = useId();
  return (
    <Card component="article" aria-labelledby={titleId} sx={styles.root}>
      <CardMedia component="img" sx={styles.media} image={product.media.source} alt={product.name} />
      <CardContent sx={styles.content}>
        <Box sx={styles.cardContent}>
          <Typography component="h3" id={titleId} sx={styles.name}>
            <Box component={Link} href={productPath(product)} sx={styles.detailLink}>{product.name}</Box>
          </Typography>
          <Typography sx={styles.price}>{product.price.formatted_with_symbol}</Typography>
        </Box>
        <Typography component="div" sx={styles.description} dangerouslySetInnerHTML={{ __html: product.description }} variant="body2" color="text.secondary" />
      </CardContent>
      <CardActions sx={styles.cardActions}>
        <Button fullWidth variant="outlined" aria-label={`${isAdding ? 'Adding…' : 'Add to cart:'} ${product.name}`} aria-busy={isAdding} disabled={isUpdating}
          onClick={onAddToCart} startIcon={isAdding ? <CircularProgress size={16} color="inherit" aria-hidden="true" /> : <Add sx={{ fontSize: 18 }} />}
          sx={styles.addButton}>
          {isAdding ? 'Adding…' : 'Add to cart'}
        </Button>
      </CardActions>
    </Card>
  );
};

export default Product;
