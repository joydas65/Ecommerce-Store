'use client';

import { Alert, Box, Button, CircularProgress, Container, Typography } from '@mui/material';

export default function StoreStatus({ title, status, message, onRetry }) {
  return (
    <Container component="main" sx={{ py: 3 }}>
      <Box sx={(theme) => theme.mixins.toolbar} />
      <Typography variant="h4" component="h1" gutterBottom>{title}</Typography>
      {status === 'loading' ? <CircularProgress aria-label={`Loading ${title.toLowerCase()}`} /> : (
        <Alert severity="error" action={<Button color="inherit" onClick={onRetry}>Retry</Button>}>{message}</Alert>
      )}
    </Container>
  );
}
