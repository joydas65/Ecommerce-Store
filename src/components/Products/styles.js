const styles = {
  content: { maxWidth: 1280, mx: 'auto', px: { xs: 2, sm: 4 }, pb: 12 },
  hero: {
    display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' },
    alignItems: 'center', pt: { xs: 4, sm: 6 }, pb: { xs: 4, sm: 6 }, gap: 3,
  },
  heroCopy: { py: { xs: 0, md: 2 } },
  eyebrow: { fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', color: 'text.secondary', mb: 2 },
  headline: { fontSize: { xs: '2.45rem', sm: '3.5rem', lg: '3.9rem' }, lineHeight: 1.08, maxWidth: 670 },
  intro: { color: 'text.secondary', maxWidth: 440, mt: 2.5, fontSize: { xs: 15, sm: 16 } },
  explore: { mt: 2, px: 0, borderRadius: 0, borderBottom: '1px solid', '&:hover': { backgroundColor: 'transparent', color: 'primary.dark' } },
  heroArt: { position: 'relative', height: 290, display: { xs: 'none', md: 'block' }, overflow: 'hidden' },
  artCircle: { position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: '#e4e9df', right: '8%', top: 0 },
  artLamp: { position: 'absolute', width: '75%', height: 240, right: 0, top: 5, borderRadius: '120px 120px 18px 18px', background: 'url(/demo/desk-lamp.svg) center / cover', border: '8px solid #f8f7f3', transform: 'rotate(5deg)' },
  artNotebook: { position: 'absolute', width: '43%', height: 130, left: '2%', bottom: 25, borderRadius: 2, background: 'url(/demo/notebook.svg) center / cover', border: '6px solid #f8f7f3', transform: 'rotate(-10deg)' },
  artCaption: { position: 'absolute', bottom: 0, right: '5%', fontFamily: 'Georgia, serif', fontSize: 14, fontStyle: 'italic', color: 'text.secondary' },
  collection: { borderTop: '1px solid', borderColor: 'divider', pt: { xs: 3, sm: 4 }, scrollMarginTop: 100 },
  collectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3 },
  collectionTitle: { fontSize: { xs: '1.7rem', sm: '2.1rem' }, mb: 0.75 },
  productCount: { fontSize: 12, whiteSpace: 'nowrap', color: 'text.secondary', display: { xs: 'none', sm: 'block' } },
  collectionEnd: { textAlign: 'center', borderTop: '1px solid', borderColor: 'divider', mt: 6, pt: 4, color: 'primary.main' },
  endMark: { fontFamily: 'Georgia, serif', fontSize: 32, mb: 0.5 },

};

export default styles;
