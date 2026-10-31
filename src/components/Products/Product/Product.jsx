'use client';

import { Box, Card, CardMedia, CardContent, CardActions, Typography, IconButton } from '@mui/material';
import { AddShoppingCart } from '@mui/icons-material';

import styles from './styles';

const Product = ({ product, onAddToCart, isUpdating = false }) => (
  <Card sx={styles.root}>
    <CardMedia component="img" sx={styles.media} image={product.media.source} alt={product.name} />
    <CardContent>
      <Box sx={styles.cardContent}>
        <Typography variant="h5" gutterBottom>{product.name}</Typography>
        <Typography variant="h5">{product.price.formatted_with_symbol}</Typography>
      </Box>
      <Typography component="div" dangerouslySetInnerHTML={{ __html: product.description }} variant="body2" color="text.secondary" />
    </CardContent>
    <CardActions disableSpacing sx={styles.cardActions}>
      <IconButton aria-label={`Add ${product.name} to cart`} disabled={isUpdating} onClick={() => onAddToCart(product.id, 1)}>
        <AddShoppingCart />
      </IconButton>
    </CardActions>
  </Card>
);

export default Product;
