'use client';

import { Box, Typography } from '@mui/material';
import { Suspense } from 'react';
import CatalogDiscovery from '../components/Products/CatalogDiscovery';
import StoreStatus from '../components/StoreStatus';
import { useCommerce } from '../context/CommerceContext';

function CatalogContent() {
  const { products, productsStatus, loadProducts, handleAddToCart, isUpdatingCart } = useCommerce();
  if (productsStatus !== 'ready') return <StoreStatus title="Products" status={productsStatus} message="The store is temporarily unavailable. Please try again later." onRetry={loadProducts} />;
  if (!products.length) return <Box component="main" sx={{ py: 3, px: 3 }}><Typography component="h1" variant="h4">Products</Typography><Typography>New products are on their way. Please check back soon.</Typography></Box>;
  return <CatalogDiscovery products={products} onAddToCart={handleAddToCart} isUpdating={isUpdatingCart} />;
}

export default function CatalogPage() {
  return <Suspense fallback={<StoreStatus title="Products" status="loading" />}><CatalogContent /></Suspense>;
}
