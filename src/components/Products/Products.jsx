'use client';

import { Box, Button, Grid, Typography, Alert } from '@mui/material';
import { ArrowForward } from '@mui/icons-material';
import Link from 'next/link';
import useAddToCart from '../../hooks/useAddToCart';
import CartConfirmation from '../CartFeedback/CartConfirmation';

import Product from './Product/Product';
import styles from './styles';

const Products = ({ products, totalProducts = products.length, query = '', controls, onClearSearch, onFocusFallback, onAddToCart, isUpdating = false }) => {
  const { addProduct, addingId, added, unexpectedError, dismiss } = useAddToCart(onAddToCart, isUpdating, onFocusFallback);

  return (
    <Box component="main" sx={styles.content}>
      <Box component="section" aria-labelledby="catalog-title" sx={styles.hero}>
        <Box sx={styles.heroCopy}>
          <Typography component="p" sx={styles.eyebrow}>SMALL THINGS. WELL CONSIDERED.</Typography>
          <Typography id="catalog-title" component="h1" variant="h1" sx={styles.headline}>
            Everyday essentials.{' '}<Box component="span" sx={{ display: 'block', color: 'primary.main' }}>A calmer workspace.</Box>
          </Typography>
          <Typography sx={styles.intro}>Thoughtful pieces for your desk, your daily carry, and everything in between.</Typography>
          <Button component="a" href="#products" endIcon={<ArrowForward />} sx={styles.explore}>Explore the collection</Button>
        </Box>
        <Box sx={styles.heroArt} aria-hidden="true">
          <Box sx={styles.artCircle} />
          <Box sx={styles.artLamp} />
          <Box sx={styles.artNotebook} />
          <Typography sx={styles.artCaption}>A little space for the everyday.</Typography>
        </Box>
      </Box>

      <Box component="section" id="products" aria-labelledby="collection-title" sx={styles.collection}>
        <Box sx={styles.collectionHeader}>
          <Box>
            <Typography component="h2" variant="h2" id="collection-title" sx={styles.collectionTitle}>The everyday collection</Typography>
            <Typography color="text.secondary" variant="body2">Useful things. Room to make them yours.</Typography>
          </Box>
        </Box>
        {controls}
        <Typography aria-live="polite" aria-atomic="true" sx={styles.resultsSummary}>
          {products.length}{query ? ` of ${totalProducts}` : ''} {products.length === 1 && !query ? 'product' : 'products'}{query ? ` for “${query}”` : ''}
        </Typography>
        {unexpectedError && <Alert severity="error" sx={{ mb: 3 }}>{unexpectedError}</Alert>}
        {!products.length && (
          <Box sx={styles.emptyResults}>
            <Typography component="h3" variant="h2" sx={styles.emptyTitle}>No products found</Typography>
            <Typography color="text.secondary" sx={styles.emptyCopy}>We couldn&apos;t find a match for “{query}”. Try a broader term, such as desk or notebook, or clear your search to see the collection.</Typography>
            <Button variant="outlined" onClick={onClearSearch}>Clear search</Button>
          </Box>
        )}
        <Grid container spacing={{ xs: 2.5, sm: 3 }}>
          {products.map((product) => (
            <Grid key={product.id} size={{ xs: 12, sm: 6, lg: 4 }}>
              <Product product={product} onAddToCart={(event) => addProduct(product, event.currentTarget)}
                isUpdating={isUpdating || addingId !== null} isAdding={addingId === product.id} />
            </Grid>
          ))}
        </Grid>
      </Box>
      <Box sx={styles.collectionEnd}>
        <Typography sx={styles.endMark}>j.</Typography>
        <Typography variant="body2">A few good things for your everyday.</Typography>
        <Typography variant="caption" color="text.secondary">Joy&apos;s Store · Work & everyday</Typography>
        <Button component={Link} href="/admin/orders" size="small">Merchant access</Button>
      </Box>
      <CartConfirmation added={added} onDismiss={dismiss} />
    </Box>
  );
};

export default Products;
