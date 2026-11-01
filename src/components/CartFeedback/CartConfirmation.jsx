'use client';

import { Box, Button, IconButton, Paper, Typography } from '@mui/material';
import { CheckCircleOutlined, Close } from '@mui/icons-material';
import Link from 'next/link';

export default function CartConfirmation({ added, onDismiss }) {
  return (
    <Box role="status" aria-live="polite" aria-atomic="true">
      {added && (
        <Paper elevation={0} sx={{
          position: 'fixed', bottom: { xs: 16, sm: 24 }, left: '50%', transform: 'translateX(-50%)',
          width: 'max-content', maxWidth: 'calc(100% - 32px)', zIndex: 1200,
          display: 'flex', alignItems: 'center', gap: 1, p: 1.5,
          border: '1px solid #a6b9a7', boxShadow: '0 6px 28px rgba(25,61,48,0.15)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 220px', minWidth: 0, overflowWrap: 'anywhere' }}>
            <CheckCircleOutlined color="primary" sx={{ flexShrink: 0, display: { xs: 'none', sm: 'block' } }} />
            <Typography fontSize={14} fontWeight={600}>{added} added to your cart.</Typography>
          </Box>
          <Button component={Link} href="/cart" variant="contained" size="small" sx={{ flexShrink: 0, px: 1.5 }}>View cart</Button>
          <IconButton aria-label="Dismiss cart confirmation" onClick={onDismiss} size="small" sx={{ flexShrink: 0 }}><Close fontSize="small" /></IconButton>
        </Paper>
      )}
    </Box>
  );
}
