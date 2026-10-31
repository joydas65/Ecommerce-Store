import Providers from './providers';

export const metadata = {
  title: { default: "Joy's Store", template: "%s | Joy's Store" },
  description: 'Browse products and shop with clear shipping, tax, and order confirmation.',
};

export default function RootLayout({ children }) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
