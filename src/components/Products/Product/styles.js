const styles = {
  root: { position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: '16px' },
  detailLink: { color: 'inherit', textDecoration: 'none', '&::after': { content: '""', position: 'absolute', inset: 0 }, '&:hover': { textDecoration: 'underline' }, '&:focus-visible::after': { outline: '3px solid #a14b2b', outlineOffset: '-4px', borderRadius: '16px' } },
  media: { aspectRatio: '4 / 3', objectFit: 'cover', width: '100%', borderBottom: '1px solid', borderColor: 'divider' },
  content: { px: { xs: 2.5, sm: 3 }, pt: 2.5, pb: 1.5, flexGrow: 1 },
  cardContent: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 1.25 },
  name: { fontSize: 21, fontWeight: 500, letterSpacing: '-0.025em', overflowWrap: 'anywhere', minWidth: 0, flex: '1 1 140px' },
  price: { fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere', maxWidth: '100%' },
  description: { '& p': { m: 0 }, overflowWrap: 'anywhere' },
  cardActions: { position: 'relative', zIndex: 1, px: { xs: 2.5, sm: 3 }, pb: 2.5, pt: 1 },
  addButton: { position: 'relative', zIndex: 1, borderColor: '#aebdb0', minHeight: 46, '&:hover': { bgcolor: 'primary.main', borderColor: 'primary.main', color: 'primary.contrastText' } },
};

export default styles;
