'use client';

import { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Button, TextField } from '@mui/material';
import { Search } from '@mui/icons-material';
import { catalogHref, MAX_QUERY_LENGTH, readCatalogQuery, searchProducts, SORT_OPTIONS } from '../../lib/catalog-discovery';
import Products from './Products';
import styles from './styles';

export default function CatalogDiscovery({ products, onAddToCart, isUpdating }) {
  const searchParams = useSearchParams();
  const { query, sort } = readCatalogQuery(searchParams);
  const [draft, setDraft] = useState({ query, value: query });
  const searchInput = useRef(null);

  // Restore the submitted query on history navigation without remounting the
  // focused input. Changing only the sort keeps an unfinished search draft.
  if (draft.query !== query) setDraft({ query, value: query });

  const navigate = (filters) => {
    const href = catalogHref(searchParams, filters);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== href) {
      // Next integrates native history with useSearchParams. Local collection
      // discovery needs no additional server navigation or network request.
      window.history.pushState(null, '', href);
    }
  };
  const clearSearch = () => {
    setDraft({ query, value: '' });
    navigate({ query: '', sort });
    searchInput.current?.focus();
  };
  const resetFilters = () => {
    setDraft({ query, value: '' });
    navigate({ query: '', sort: 'featured' });
    searchInput.current?.focus();
  };
  const submitSearch = (event) => {
    event.preventDefault();
    // Also normalize the field if submission doesn't change the applied query.
    const next = readCatalogQuery(new URLSearchParams({ q: draft.value, sort }));
    setDraft({ query, value: next.query });
    navigate(next);
  };

  const controls = (
    <Box sx={styles.discovery}>
      <Box component="form" role="search" aria-label="Product search" onSubmit={submitSearch} sx={styles.searchForm}>
        <TextField id="catalog-search" name="q" type="search" label="Search products"
          placeholder="Try desk, cork, or USB-C" value={draft.value}
          onChange={(event) => setDraft({ query, value: event.target.value })} inputRef={searchInput}
          size="small" fullWidth autoComplete="off" sx={styles.searchField}
          slotProps={{ htmlInput: { maxLength: MAX_QUERY_LENGTH }, input: { sx: { bgcolor: 'background.paper', minHeight: 48 } } }} />
        <Button type="submit" variant="contained" startIcon={<Search />} sx={styles.searchButton}>Search</Button>
      </Box>
      <TextField id="catalog-sort" label="Sort products" select value={sort} size="small"
        onChange={(event) => navigate({ query, sort: event.target.value })}
        slotProps={{ select: { native: true }, input: { sx: { bgcolor: 'background.paper', minHeight: 48 } } }}
        sx={styles.sortField}>
        {SORT_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </TextField>
      {(query || sort !== 'featured') && <Button onClick={resetFilters} sx={styles.resetFilters}>Reset filters</Button>}
    </Box>
  );

  return <Products products={searchProducts(products, { query, sort })} totalProducts={products.length}
    query={query} controls={controls} onClearSearch={clearSearch} onFocusFallback={() => searchInput.current?.focus()}
    onAddToCart={onAddToCart} isUpdating={isUpdating} />;
}
