import { createTheme } from '@mui/material/styles';

// A small shared palette and type system keeps browsing, cart, and checkout coherent.
const theme = createTheme({
  palette: {
    primary: { main: '#285443', dark: '#193d30', contrastText: '#ffffff' },
    secondary: { main: '#954735', contrastText: '#ffffff' },
    background: { default: '#f8f7f3', paper: '#ffffff' },
    text: { primary: '#252e29', secondary: '#5d665e' },
    divider: '#dedfd7',
    success: { main: '#285443' },
    error: { main: '#a33527' },
  },
  typography: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    h1: { fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 400, letterSpacing: '-0.045em' },
    h2: { fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 400, letterSpacing: '-0.025em' },
    h3: { fontWeight: 500, letterSpacing: '-0.025em' },
    h4: { fontWeight: 500, letterSpacing: '-0.025em' },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
    body1: { lineHeight: 1.65 },
    body2: { lineHeight: 1.6 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { scrollPaddingTop: '96px' },
        body: { WebkitFontSmoothing: 'antialiased' },
        'a:focus-visible, button:focus-visible, [tabindex]:focus-visible': {
          outline: '3px solid #954735', outlineOffset: '4px',
        },
        '::selection': { background: '#dce7d9', color: '#193d30' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 44, borderRadius: 8, paddingInline: 20 } },
    },
    MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
    MuiCard: { styleOverrides: { root: { boxShadow: 'none', border: '1px solid #dedfd7' } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiLink: { styleOverrides: { root: { textUnderlineOffset: '3px' } } },
  },
});

export default theme;
