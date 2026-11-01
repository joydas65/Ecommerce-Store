'use client';

import { Alert, Button, CircularProgress, Container, Typography } from '@mui/material';

export default function StoreStatus({ title, status, message, onRetry }) {
  return (
    <Container component="main" sx={{ py: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>{title}</Typography>
      {status === 'loading' ? <CircularProgress aria-label={`Loading ${title.toLowerCase()}`} /> : (
        <Alert severity="error" action={<Button color="inherit" onClick={onRetry}>Retry</Button>}>{message}</Alert>
      )}
    </Container>
  );
}
