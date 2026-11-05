export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const metadata = { title: 'Your account', robots: { index: false, follow: false } };

export default function AccountLayout({ children }) { return children; }
