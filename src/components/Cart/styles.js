const styles = {
  toolbar: (theme) => theme.mixins.toolbar,
  title: {
    mt: '5%',
    fontSize: { xs: '2rem', sm: '3rem' },
  },
  actionButton: {
    minWidth: '150px',
    width: { xs: '100%', sm: 'auto' },
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 2,
  },
  cardDetails: {
    display: 'flex',
    flexWrap: 'wrap',
    mt: '10%',
    mb: 3,
    width: '100%',
    justifyContent: 'space-between',
    gap: 3,
  },
};

export default styles;
