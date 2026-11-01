const styles = {
  appBar: {
    boxShadow: 'none', borderBottom: '1px solid', borderColor: 'divider',
    backgroundColor: '#f8f7f3',
  },
  toolbar: {
    width: '100%', maxWidth: 1280, mx: 'auto',
    minHeight: { xs: 72, sm: 88 }, px: { xs: 2, sm: 4 }, gap: 2,
  },
  title: {
    alignItems: 'center', display: 'inline-flex', gap: 1.25,
    textDecoration: 'none', color: 'text.primary', minHeight: 44,
  },
  mark: {
    bgcolor: 'primary.main', color: 'primary.contrastText', width: 34, height: 34,
    display: 'grid', placeItems: 'center', borderRadius: '50%',
    fontFamily: 'Georgia, serif', fontSize: 26, lineHeight: 1, pb: 0.5,
  },
  wordmark: { fontFamily: 'Georgia, serif', fontSize: { xs: 22, sm: 27 }, letterSpacing: '-0.04em', whiteSpace: 'nowrap' },
  tagline: { display: { xs: 'none', md: 'block' }, ml: 3, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', color: 'text.secondary' },
  cart: { ml: 'auto', minWidth: 0, px: { xs: 1.25, sm: 1.75 }, gap: 1, borderColor: 'divider', whiteSpace: 'nowrap' },
  count: { bgcolor: '#e4eadf', borderRadius: '50%', minWidth: 23, height: 23, display: 'grid', placeItems: 'center', px: 0.5, fontSize: 12 },
};

export default styles;
